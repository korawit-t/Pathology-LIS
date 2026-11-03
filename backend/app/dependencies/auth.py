from typing import Iterable, List, Optional, Set
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.models.revoked_token import RevokedToken
from app.core.security import SECRET_KEY, ALGORITHM
from app.utils.time import local_now, local_timestamp


def allowed_while_password_change_due(endpoint):
    """Mark an endpoint an account may still call while its password is
    temporary or expired: only what the change-password screen needs. Every
    other endpoint answers 403 FORCE_PASSWORD_CHANGE / PASSWORD_EXPIRED until
    the password is changed (see get_current_user). Put it directly under the
    @router decorator so it marks the function the router registers."""
    endpoint.allowed_while_password_change_due = True
    return endpoint


def issued_before_password_change(user: User, issued_at) -> bool:
    """True for a token minted before the account's password last changed.

    Changing a password, or an admin resetting it, is how someone ends a
    session they no longer control, such as one left open on a ward PC.
    Without this, that session's refresh token kept rotating past the change
    indefinitely. A token without iat predates this check and is treated as
    older than any change on record.
    """
    changed = user.last_update_password
    if changed is None:
        return False
    if not isinstance(issued_at, (int, float)):
        return True
    return issued_at < local_timestamp(changed)


def password_change_due(user: User, db: Session) -> Optional[str]:
    """FORCE_PASSWORD_CHANGE or PASSWORD_EXPIRED if the account must change its
    password before doing anything else, otherwise None."""
    if user.is_temporary_password:
        return "FORCE_PASSWORD_CHANGE"
    if not user.last_update_password:
        return None
    from app.models.system_setting import SystemSetting
    settings = db.query(SystemSetting).first()
    expiry_days = (settings.password_expiry_days or 0) if settings else 0
    if expiry_days > 0 and (local_now() - user.last_update_password).days >= expiry_days:
        return "PASSWORD_EXPIRED"
    return None


def get_current_user(
    request: Request,
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
        token_type: Optional[str] = payload.get("type")
        issued_at = payload.get("iat")
        if username is None:
            raise credentials_exception
        # Only access tokens may authenticate a request. Without this check a
        # refresh token (type="refresh", 3-day TTL) presented as the
        # access_token cookie or Bearer header would be accepted here, since it
        # also carries a valid `sub`. Refresh tokens are only ever exchanged at
        # /auth/refresh, never used directly for API calls.
        if token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Reject tokens that were explicitly revoked (e.g. after logout).
    if jti and db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    # A disabled account stops at its next request rather than when its access
    # token runs out. RoleChecker (via get_current_active_user) already refused
    # one, but routes that need only a login come straight here.
    if not user.status:
        raise credentials_exception
    if issued_before_password_change(user, issued_at):
        raise credentials_exception

    # Enforced here so it covers every route. As a per-router dependency
    # (check_password_status) it reached 11 routers of 71, so a temporary or
    # expired password still worked against the API almost everywhere.
    reason = password_change_due(user, db)
    if reason:
        endpoint = getattr(request.scope.get("route"), "endpoint", None)
        if not getattr(endpoint, "allowed_while_password_change_due", False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.status:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


class RoleChecker:
    def __init__(self, allowed_roles: List[str], admin_bypass: bool = True):
        self.allowed_roles = allowed_roles
        # Admin passes every gate by default. Turn that off only for a gate
        # whose whole point is *who* exercised a judgement (e.g. QC review),
        # where an IT account clearing it would defeat the control.
        self.admin_bypass = admin_bypass

    def allows(self, user: User | None) -> bool:
        """Same decision as __call__, without raising — for callers that must
        record a refusal before reporting it."""
        if not user:
            return False
        user_roles = set(user.roles if isinstance(user.roles, list) else [])
        if self.admin_bypass and "admin" in user_roles:
            return True
        return bool(user_roles.intersection(self.allowed_roles))

    def __call__(self, user: User = Depends(get_current_active_user)):
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")

        if not self.allows(user):
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

# Accounts that only ever get to see a result once a pathologist has signed it
# out — the referring side plus the front desk that hands the paper over. Lab
# staff are deliberately absent: previewing an unsigned result is how they
# review it.
#
# Used by the out-lab PDF endpoints in gyne_cyto_case.py and molecular_case.py.
# Import this rather than redefining it, for the same reason as EXTERNAL_ROLES.
CLINICIAN_FACING_ROLES = EXTERNAL_ROLES | {"register"}


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


class InternalStaffOnly:
    """Router-level gate that refuses accounts holding nothing but external
    roles (EXTERNAL_ROLES), on every endpoint of the router except the ones
    named in ``open_to_external``.

    It makes "closed to the referring side" the default. Before it, any route
    that only required a login answered every clinician and hospital account,
    which is how the audit trail, billing summaries, HOSxP patient search and
    other hospitals' drafts were open to them. To open an endpoint, add its
    function name to the router's list, and make it scope what it returns
    with assert_hospital_scoped_access or get_scoped_hospital_ids.

    An account with any internal role passes. That is the same rule the
    frontend's getHomeRoute (utils/hasRole.ts) uses to send a user to the lab
    dashboard rather than the results portal. Wired up in main.py for
    internal-only routers; shared routers declare their own instance.
    """

    def __init__(self, open_to_external: Iterable[str] = ()):
        self.open_to_external = frozenset(open_to_external)

    def __call__(self, request: Request, user: User = Depends(get_current_user)) -> User:
        user_roles = set(user.roles if isinstance(user.roles, list) else [])
        if user_roles - EXTERNAL_ROLES:
            return user
        # FastAPI puts the matched route (as declared on its own router) here
        # before resolving dependencies; its name is the endpoint function's.
        route = request.scope.get("route")
        if getattr(route, "name", None) in self.open_to_external:
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


def check_password_status(current_user: User = Depends(get_current_user)):
    """Kept for the routes that still declare it. The temporary/expired
    password check it used to make now runs in get_current_user, for every
    route."""
    return current_user
