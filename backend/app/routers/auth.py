from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional
from jose import jwt, JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address
from limits import parse as parse_rate_limit
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter

from datetime import datetime, timezone, timedelta
from app.db.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.revoked_token import RevokedToken
from app.models.system_setting import SystemSetting
from app.context import current_user_id, current_ip
from app.core.config import IS_PRODUCTION, COOKIE_DOMAIN, COOKIE_SAMESITE
from app.crud import user_mfa as mfa_crud
from app.crud import user_trusted_device as device_crud
from app.schemas.user_mfa import MfaLoginRequest
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    create_mfa_challenge_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    ALGORITHM,
)

# Login throttling, replacing an earlier 5-strikes / 15-minute hard lockout.
#
# A hard lock is a denial-of-service primitive: anyone holding a staff list
# could keep a whole department permanently locked out, and in a lab that means
# reports stop going out. NIST SP 800-63B prefers throttling over lockout for
# exactly this reason.
#
# The first FREE_LOGIN_ATTEMPTS consecutive failures cost nothing, which covers
# ordinary typos. Each failure after that doubles the wait, capped at
# LOGIN_BACKOFF_MAX_SECONDS:
#
#     4th failure -> 30s, 5th -> 1m, 6th -> 2m, 7th -> 4m, 8th onwards -> 5m
#
# The cap is deliberately short. Someone who genuinely forgot their password
# should be waiting minutes rather than a quarter of an hour, and bulk guessing
# is already bounded by the per-IP rate limit on this endpoint. Past the free
# allowance an attacker gets one guess per window — roughly 12 per hour once
# the cap is reached.
FREE_LOGIN_ATTEMPTS = 3
LOGIN_BACKOFF_BASE_SECONDS = 30
LOGIN_BACKOFF_MAX_SECONDS = 300


def _login_backoff_seconds(consecutive_failures: int) -> int:
    """How long logins stay blocked after `consecutive_failures` failures."""
    over_allowance = consecutive_failures - FREE_LOGIN_ATTEMPTS
    if over_allowance <= 0:
        return 0
    # Shift rather than 2 ** n, and clamp it: the counter is only reset by a
    # successful login, so it can climb arbitrarily high under a sustained
    # attack and an unclamped exponent would build a pointlessly huge integer.
    shift = min(over_allowance - 1, 20)
    return min(LOGIN_BACKOFF_BASE_SECONDS << shift, LOGIN_BACKOFF_MAX_SECONDS)


def _humanize_seconds(seconds: int) -> str:
    """Render a retry delay, rounding up so nobody is told to come back early."""
    if seconds < 60:
        return f"{seconds} second(s)"
    return f"{(seconds + 59) // 60} minute(s)"


limiter = Limiter(key_func=get_remote_address)

# Login is capped on two dimensions, and a third control sits behind them.
#
#   per IP                  — horizontal: how many accounts one source can rake
#                             through. On the route, via slowapi.
#   per (username, IP)      — vertical: how hard one source can lean on one
#                             account. Below, in the handler.
#   per account, any source — the failure backoff above, which is the only one
#                             of the three that an attacker cannot escape by
#                             rotating addresses.
#
# The pair is deliberate rather than a single per-username cap. Keying the
# vertical cap on the username alone would let anyone deny a named user access
# indefinitely by spending ten attempts a minute on them; including the address
# means an attacker cannot touch the bucket the real user is logging in from.
# It also means the cap is escapable by rotating addresses, which is exactly
# what the per-account backoff is there to catch.
#
# The username dimension cannot be expressed as another @limiter.limit, because
# slowapi calls its key_func synchronously, before the request body has been
# read — so the submitted username simply is not available to it yet (see
# slowapi/extension.py, `limit_key = lim.key_func(request)`). It is enforced in
# the handler instead, against the same `limits` backend slowapi itself runs on,
# so this adds no dependency.
#
# Having the vertical cap is what lets the horizontal one be loose. When per-IP
# was the only cap it had to be tight, which meant an entire department sharing
# one egress address — behind hospital NAT, or a reverse proxy whose
# TRUSTED_PROXY_IPS was never configured, in which case every request appears to
# come from the proxy — could lock each other out of logging in at shift change.
# Per-account brute-force resistance no longer rests on the per-IP number.
#
# Keyed on the username as submitted whether or not any such account exists, so
# it reveals nothing about which usernames are real.
#
# In-process storage, matching slowapi's own default here: correct for the
# current single-worker deployment, and per-worker the moment that changes.
LOGIN_ATTEMPTS_PER_IP = "60/minute"
LOGIN_ATTEMPTS_PER_USERNAME = "10/minute"

_username_rate_limiter = FixedWindowRateLimiter(MemoryStorage())
_login_username_limit = parse_rate_limit(LOGIN_ATTEMPTS_PER_USERNAME)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=COOKIE_DOMAIN,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
        domain=COOKIE_DOMAIN,
    )


def _set_trusted_device_cookie(response: Response, token: str, days: int):
    response.set_cookie(
        key=device_crud.COOKIE_NAME,
        value=token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite=COOKIE_SAMESITE,
        max_age=days * 86400,
        path="/",
        domain=COOKIE_DOMAIN,
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie("refresh_token", path="/", domain=COOKIE_DOMAIN)


# --- Login ---
@router.post("/login")
@limiter.limit(LOGIN_ATTEMPTS_PER_IP)
def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    trusted_device: Optional[str] = Cookie(default=None, alias=device_crud.COOKIE_NAME),
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else None

    # Vertical cap, checked before the user lookup so a flood costs no queries.
    # Case-folded so cycling the capitalisation of a username cannot buy extra
    # attempts, since the lookup below is exact and would reject them anyway.
    if not _username_rate_limiter.hit(
        _login_username_limit, "login", form_data.username.lower(), ip or "unknown"
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait a moment and try again.",
        )

    from sqlalchemy.orm import joinedload
    user = (
        db.query(User)
        .options(joinedload(User.position), joinedload(User.hospitals))
        .filter(User.username == form_data.username)
        .first()
    )

    now = datetime.now(timezone.utc)

    # 🔒 Always run verify_password (against the real hash, or a fixed dummy
    # hash when the user doesn't exist) so a nonexistent-username attempt
    # takes the same time as a wrong-password attempt for a real account —
    # otherwise the response timing leaks whether the username exists.
    #
    # This now runs before the throttle check as well. The previous order —
    # throttle first, returning 429 — made this endpoint a username oracle:
    # a real account answered 429 once locked while an unknown one answered
    # 401 forever, so login could be used to confirm which usernames exist.
    # The early return also skipped the Argon2 work that _DUMMY_HASH exists
    # to pay, leaking the same fact a second time through response timing.
    password_ok = verify_password(form_data.password, user.hashed_password if user else None)

    throttled = bool(user and user.locked_until and user.locked_until > now)

    def _reject_unauthenticated():
        """The single response anyone without valid credentials ever sees."""
        db.add(AuditLog(
            user_id=None,
            action="LOGIN_FAILED",
            resource_type="User",
            new_values={"username": form_data.username, "throttled": throttled},
            ip_address=ip,
        ))
        db.commit()
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if throttled:
        # Attempts inside the window are refused whether or not the password is
        # right, which is what actually slows guessing down. They deliberately
        # do NOT advance the counter: letting them would hand an attacker an
        # easy way to hold someone else's account at the maximum delay forever.
        if not password_ok:
            raise _reject_unauthenticated()
        # Reaching here means the caller proved they know the password, so
        # telling them how long to wait gives an attacker nothing.
        retry_after = max(1, int((user.locked_until - now).total_seconds()) + 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {_humanize_seconds(retry_after)}.",
            headers={"Retry-After": str(retry_after)},
        )

    if not user or not password_ok:
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            backoff = _login_backoff_seconds(user.failed_login_attempts)
            user.locked_until = now + timedelta(seconds=backoff) if backoff else None
        raise _reject_unauthenticated()

    if not user.status:
        raise HTTPException(status_code=400, detail="Inactive user")

    # The password is right, but that is only the first factor. Everything the
    # caller would want — identity, roles, hospitals, and both cookies — is
    # withheld until the second one is produced, so a stolen password on its
    # own reveals nothing beyond the fact that it was correct.
    if _mfa_required_for_login(db, user):
        # A trusted browser skips the code, never the password — which has
        # already been checked by this point. Revocation and expiry are read
        # from the database on every login, so removing a device in the profile
        # screen takes effect immediately rather than whenever a cookie happens
        # to lapse.
        device = device_crud.find_valid_device(db, user, trusted_device)
        if device:
            device_crud.touch(db, device)
            return _complete_login(db, response, user, ip, action="LOGIN_TRUSTED_DEVICE")

        challenge, jti, _exp = create_mfa_challenge_token(subject=user.username, uid=user.id)
        db.add(AuditLog(
            user_id=user.id,
            action="MFA_CHALLENGE_ISSUED",
            resource_type="User",
            resource_id=user.id,
            new_values={"jti": jti},
            ip_address=ip,
        ))
        # The failure counter is deliberately left alone here. It is reset only
        # once the login actually completes, so failures at the second step
        # keep feeding the same backoff and cannot be cleared by replaying a
        # known-good password.
        db.commit()
        return {"mfa_required": True, "mfa_token": challenge}

    return _complete_login(db, response, user, ip, action="LOGIN")


def _mfa_required_for_login(db: Session, user: User) -> bool:
    """Whether this sign-in needs a second factor.

    Both switches have to agree: the installation must have MFA on, and this
    user must have a confirmed factor. Turning the master switch off therefore
    lets everyone straight back in without unenrolling anyone.
    """
    from app.models.system_setting import SystemSetting

    if not user.mfa_enabled:
        return False
    settings = db.query(SystemSetting).first()
    return bool(settings and settings.mfa_enabled)


def _complete_login(db: Session, response: Response, user: User, ip, action: str) -> dict:
    """Issue cookies and build the session payload.

    Shared by the one-step and two-step paths on purpose: the body a client
    receives must not depend on which route it arrived by, or the frontend ends
    up with two subtly different notions of a logged-in user.
    """
    user.failed_login_attempts = 0
    user.locked_until = None

    access_token, _jti, _exp = create_access_token(subject=user.username, uid=user.id)
    refresh_token, _refresh_jti, _refresh_exp = create_refresh_token(subject=user.username)

    db.add(AuditLog(
        user_id=user.id,
        action=action,
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


# --- Login step two: redeem the MFA challenge ---
@router.post("/login/mfa")
@limiter.limit(LOGIN_ATTEMPTS_PER_IP)
def complete_mfa_login(
    request: Request,
    response: Response,
    payload: MfaLoginRequest,
    db: Session = Depends(get_db),
):
    """Exchange a challenge token plus a second factor for a session.

    There is no self-service recovery code here: a lost authenticator is
    resolved by an administrator who has verified who is asking (see
    POST /users/{id}/mfa/reset). Printed recovery codes were considered and
    rejected on the grounds that they end up stored somewhere that defeats the
    point of having a second factor at all.
    """
    ip = request.client.host if request.client else None
    now = datetime.now(timezone.utc)

    def _reject(detail: str = "Invalid or expired challenge"):
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    try:
        decoded = jwt.decode(payload.mfa_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise _reject()

    if decoded.get("type") != "mfa_challenge":
        raise _reject()
    jti = decoded.get("jti")
    username = decoded.get("sub")
    if not jti or not username:
        raise _reject()

    # A challenge is single-use. Without this, anyone who captured one could
    # keep retrying second factors against it for its whole five minutes.
    if db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise _reject()

    from sqlalchemy.orm import joinedload
    user = (
        db.query(User)
        .options(joinedload(User.position), joinedload(User.hospitals))
        .filter(User.username == username)
        .first()
    )
    if not user or not user.status:
        raise _reject()

    # The same backoff that guards the password guards this step, so failures
    # here are not a free, unthrottled way to grind at a six-digit code.
    if user.locked_until and user.locked_until > now:
        retry_after = max(1, int((user.locked_until - now).total_seconds()) + 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {_humanize_seconds(retry_after)}.",
            headers={"Retry-After": str(retry_after)},
        )

    method = mfa_crud.get_totp_method(db, user.id, confirmed=True)
    verified = bool(method and mfa_crud.verify_totp(db, method, payload.code))

    if not verified:
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        backoff = _login_backoff_seconds(user.failed_login_attempts)
        user.locked_until = now + timedelta(seconds=backoff) if backoff else None
        db.add(AuditLog(
            user_id=user.id,
            action="MFA_FAILED",
            resource_type="User",
            resource_id=user.id,
            ip_address=ip,
        ))
        db.commit()
        raise _reject("That code is not valid.")

    # Spend the challenge before issuing anything, so a replay of this exact
    # request cannot mint a second session.
    exp_ts = decoded.get("exp")
    if exp_ts:
        db.merge(RevokedToken(jti=jti, expires_at=datetime.fromtimestamp(exp_ts, tz=timezone.utc)))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    body = _complete_login(db, response, user, ip, action="MFA_SUCCESS")
    body["device_remembered"] = False
    if payload.remember_device:
        settings = db.query(SystemSetting).first()
        days = device_crud.trusted_device_days(settings)
        token = device_crud.remember_device(
            db,
            user,
            user_agent=request.headers.get("user-agent"),
            ip_address=ip,
            days=days,
        )
        if token:
            db.add(AuditLog(
                user_id=user.id,
                action="MFA_DEVICE_TRUSTED",
                resource_type="User",
                resource_id=user.id,
                new_values={"days": days},
                ip_address=ip,
            ))
            db.commit()
            _set_trusted_device_cookie(response, token, days)
            body["device_remembered"] = True

    return body


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
