from typing import List, Optional, Set
from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.models.revoked_token import RevokedToken
from app.core.security import SECRET_KEY, ALGORITHM


def get_current_user(
    access_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    # Prefer httpOnly cookie; fall back to Bearer header for Swagger / API clients
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        jti: Optional[str] = payload.get("jti")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Reject tokens that were explicitly revoked (e.g. after logout).
    if jti and db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.status:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)):
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user_roles = user.roles if isinstance(user.roles, list) else []

        if "admin" in user_roles:
            return user

        user_roles_set = set(user_roles)
        allowed_roles_set = set(self.allowed_roles)

        if not user_roles_set.intersection(allowed_roles_set):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {self.allowed_roles}",
            )

        return user


# Roles representing an external viewer (a referring clinician or a
# hospital-side account, scoped to one or more assigned hospitals via
# User.hospitals) as opposed to internal lab staff (pathologist,
# cytotechnologist, lab_manager, admin, register, etc.) who work across every
# hospital the lab serves. Internal staff must NOT be hospital-scoped — one
# lab commonly processes cases for many hospitals, and scoping them would
# break that workflow. External roles must only ever see cases/files from
# hospitals explicitly assigned to them, matching what CAN_ACCESS_PATIENT's
# search-public/hospital-cases endpoints already enforce.
#
# Used by: app/routers/storage.py (raw PHI image directories, role-based
# block) and the request-files/consult-pdf endpoints in surgical_case.py,
# gyne_cyto_case.py, nongyne_cyto_case.py (via assert_hospital_scoped_access).
# Import this constant rather than redefining it, so the external-role list
# can't silently drift out of sync between call sites.
EXTERNAL_ROLES = {"clinician", "hospital"}


def get_scoped_hospital_ids(current_user: User) -> Optional[Set[int]]:
    """None => unrestricted (internal staff). Otherwise the exact set of
    hospital ids this external-role user may access (possibly empty)."""
    user_roles = set(current_user.roles or [])
    if not (user_roles & EXTERNAL_ROLES):
        return None
    return {h.id for h in current_user.hospitals}


def assert_hospital_scoped_access(current_user: User, resource_hospital_id: Optional[int]):
    """Raise 403 if an external-role user is accessing a resource outside
    their assigned hospitals. No-op for internal lab staff (any role not in
    EXTERNAL_ROLES), who are allowed to access any hospital's resources."""
    allowed = get_scoped_hospital_ids(current_user)
    if allowed is not None and (resource_hospital_id is None or resource_hospital_id not in allowed):
        raise HTTPException(status_code=403, detail="Access denied.")


def check_password_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_temporary_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="FORCE_PASSWORD_CHANGE")

    from app.models.system_setting import SystemSetting
    from app.utils.time import local_now
    settings = db.query(SystemSetting).first()
    expiry_days = (settings.password_expiry_days or 0) if settings else 0
    if expiry_days > 0 and current_user.last_update_password:
        from datetime import timedelta
        age = (local_now() - current_user.last_update_password).days
        if age >= expiry_days:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="PASSWORD_EXPIRED")

    return current_user
