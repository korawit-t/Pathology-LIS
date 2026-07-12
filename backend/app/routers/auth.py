from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional
from jose import jwt, JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

from datetime import datetime, timezone, timedelta
from app.db.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.revoked_token import RevokedToken
from app.context import current_user_id, current_ip
from app.core.config import IS_PRODUCTION, COOKIE_DOMAIN
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    ALGORITHM,
)

MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="none" if IS_PRODUCTION else "lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=COOKIE_DOMAIN,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="none" if IS_PRODUCTION else "strict",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
        domain=COOKIE_DOMAIN,
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie("refresh_token", path="/", domain=COOKIE_DOMAIN)


# --- Login ---
@router.post("/login")
@limiter.limit("10/minute")
def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    from sqlalchemy.orm import joinedload
    user = (
        db.query(User)
        .options(joinedload(User.position), joinedload(User.hospitals))
        .filter(User.username == form_data.username)
        .first()
    )

    ip = request.client.host if request.client else None

    # Check if account is locked before verifying password (avoids timing oracle).
    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until > now:
        remaining = int((user.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked. Try again in {remaining} minute(s).",
        )

    # 🔒 Always run verify_password (against the real hash, or a fixed dummy
    # hash when the user doesn't exist) so a nonexistent-username attempt
    # takes the same time as a wrong-password attempt for a real account —
    # otherwise the response timing leaks whether the username exists.
    password_ok = verify_password(form_data.password, user.hashed_password if user else None)
    if not user or not password_ok:
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= MAX_FAILED_LOGINS:
                user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
        db.add(AuditLog(
            user_id=None,
            action="LOGIN_FAILED",
            resource_type="User",
            new_values={"username": form_data.username},
            ip_address=ip,
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.status:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Reset failed counter on successful login.
    user.failed_login_attempts = 0
    user.locked_until = None

    access_token, _jti, _exp = create_access_token(subject=user.username, uid=user.id)
    refresh_token, _refresh_jti, _refresh_exp = create_refresh_token(subject=user.username)

    db.add(AuditLog(
        user_id=user.id,
        action="LOGIN",
        resource_type="User",
        resource_id=user.id,
        ip_address=ip,
    ))
    db.commit()

    _set_auth_cookies(response, access_token, refresh_token)

    position_name = user.position.name if user.position else None

    from app.models.system_setting import SystemSetting
    from app.utils.time import local_now
    settings = db.query(SystemSetting).first()
    expiry_days = (settings.password_expiry_days or 0) if settings else 0
    is_password_expired = False
    if expiry_days > 0 and user.last_update_password:
        is_password_expired = (local_now() - user.last_update_password).days >= expiry_days

    return {
        "token_type": "bearer",
        "roles": user.roles,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "report_name": user.report_name,
            "is_temporary_password": user.is_temporary_password,
            "is_password_expired": is_password_expired,
            "preferences": user.preferences,
            "hospital_ids": [h.id for h in user.hospitals],
            "hospital_names": [h.name for h in user.hospitals],
            "position_id": user.position_id,
            "position_name": position_name,
        },
    }


# --- Refresh (with rotation) ---
@router.post("/refresh")
@limiter.limit("20/minute")
def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
    db: Session = Depends(get_db),
):
    rt = refresh_token_cookie
    if not rt:
        raise HTTPException(status_code=401, detail="Refresh token required")

    try:
        decoded = jwt.decode(rt, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = decoded.get("sub")
        token_type: str = decoded.get("type")
        old_jti: Optional[str] = decoded.get("jti")
        old_exp_ts = decoded.get("exp")
        if username is None or token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token expired or invalid")

    # Reuse detection: this exact refresh token was already rotated away by an
    # earlier call — replaying it now (e.g. an exfiltrated copy) is rejected.
    if old_jti and db.query(RevokedToken).filter(RevokedToken.jti == old_jti).first():
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token already used")

    user = db.query(User).filter(User.username == username).first()
    if not user or not user.status:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Rotate: issue both new access and new refresh tokens
    new_access_token, _jti, _exp = create_access_token(subject=user.username, uid=user.id)
    new_refresh_token, _new_refresh_jti, _new_refresh_exp = create_refresh_token(subject=user.username)

    # Revoke the just-used refresh token so it cannot be replayed.
    if old_jti and old_exp_ts:
        db.merge(RevokedToken(jti=old_jti, expires_at=datetime.fromtimestamp(old_exp_ts, tz=timezone.utc)))
        try:
            db.commit()
        except IntegrityError:
            # A concurrent /refresh call for the same token won the race and
            # already inserted this jti — it's revoked either way, so proceed.
            db.rollback()

    _set_auth_cookies(response, new_access_token, new_refresh_token)

    return {"token_type": "bearer"}


# --- Logout ---
@router.post("/logout")
def logout(
    response: Response,
    access_token: Optional[str] = Cookie(default=None),
    refresh_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    uid = current_user_id.get()
    ip = current_ip.get()

    # Revoke the current access AND refresh tokens so neither can be reused
    # after logout (previously only the access token was revoked, leaving the
    # refresh token valid to mint fresh access tokens for up to its full TTL).
    for token in (access_token, refresh_token):
        if not token:
            continue
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti")
            exp_ts = payload.get("exp")
            if jti and exp_ts:
                expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
                db.merge(RevokedToken(jti=jti, expires_at=expires_at))
                db.commit()
        except IntegrityError:
            # Already revoked by a concurrent request — fine, it's revoked either way.
            db.rollback()
        except Exception:
            db.rollback()  # Expired or invalid token — no need to revoke

    if uid:
        db.add(AuditLog(
            user_id=uid,
            action="LOGOUT",
            resource_type="User",
            resource_id=uid,
            ip_address=ip,
        ))
    db.commit()
    _clear_auth_cookies(response)
    return {"message": "Logged out"}
