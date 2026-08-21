"""Re-authentication in front of actions that cannot be taken back.

Trusting a browser (see app/crud/user_trusted_device.py) means the second
factor is not asked for on every login. That trade is only defensible while the
irreversible actions still ask — signing out a report, amending an approved
result, changing system settings. Otherwise a session left open on a ward
machine is enough to publish a diagnosis in someone else's name.

Deliberately a no-op for users without MFA. This has to be able to ship to
installations that have never switched MFA on without changing how their staff
sign out reports; the check only bites where there is a second factor to check
against.

Also a no-op unless a site asks for it: SystemSetting.mfa_step_up_minutes is 0
by default, meaning never re-ask. Sign-out is a batch activity — a prompt every
few cases costs a pathologist more than the window it closes, and an unattended
session is already ended by idle_timeout_minutes. Sites that want the
protection set a number of minutes in Security settings.
"""

from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.security import ALGORITHM, SECRET_KEY
from app.db.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.system_setting import SystemSetting
from app.models.user import User

COOKIE_NAME = "step_up"

# Sent instead of a bare 403 so the frontend can tell "you may not do this" from
# "confirm it is you" and put up the code prompt rather than an error.
STEP_UP_REQUIRED_DETAIL = "step_up_required"

# Distinct from the above on purpose: "confirm it is you" and "you have not set
# up a second factor yet" need different things from the user, and a single code
# would send the frontend to the wrong prompt.
MFA_SETUP_REQUIRED_DETAIL = "mfa_setup_required"


def step_up_minutes(settings: Optional[SystemSetting]) -> int:
    """How long a re-check lasts, in minutes. 0 (the default) means never ask."""
    if settings is None or settings.mfa_step_up_minutes is None:
        return 0
    return int(settings.mfa_step_up_minutes)


def _access_jti(access_token: Optional[str], authorization: Optional[str]) -> Optional[str]:
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    return payload.get("jti")


def require_step_up(
    step_up: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    access_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
) -> User:
    """Allow the request only if a factor was re-checked in the last few minutes."""
    settings = db.query(SystemSetting).first()
    mfa_on = bool(settings and settings.mfa_enabled)
    if not mfa_on:
        return user

    # 0 means never re-ask. Checked before the enrolment branch below on
    # purpose: a site that has switched the re-check off should not have
    # sign-out closed on its overdue users either — that deadline is enforced
    # at login, and this guard is not the place to make it bite harder than
    # the site asked for.
    if step_up_minutes(settings) <= 0:
        return user

    if not user.mfa_enabled:
        # Someone whose grace period has run out still has no factor to check,
        # so there is nothing to step up with. Refusing here is what stops the
        # enrolment deadline from being purely a frontend redirect: the actions
        # that cannot be undone are closed server-side until they enrol.
        from app.crud import user_mfa as mfa_crud

        if mfa_crud.enrolment_status(db, user, settings).overdue:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=MFA_SETUP_REQUIRED_DETAIL,
            )
        return user

    if not step_up:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=STEP_UP_REQUIRED_DETAIL
        )

    try:
        payload = jwt.decode(step_up, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=STEP_UP_REQUIRED_DETAIL
        )

    if payload.get("type") != "step_up" or payload.get("uid") != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=STEP_UP_REQUIRED_DETAIL
        )

    # Bound to the session that asked for it: a step-up done in one browser must
    # not authorise an action from another.
    current_jti = _access_jti(access_token, authorization)
    if not current_jti or payload.get("ajti") != current_jti:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=STEP_UP_REQUIRED_DETAIL
        )

    return user
