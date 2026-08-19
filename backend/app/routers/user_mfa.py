"""Self-service enrolment for multi-factor authentication.

These endpoints let a user put a second factor on their own account and take it
off again. Nothing here changes how logging in works — that arrives with the
two-step login, and until then a confirmed factor sits on the account unused.
Which means this can ship and be exercised by real users before anyone is
locked behind it.

Starting, removing and re-issuing a factor all re-check the current password
even though the caller already holds a valid session. A stolen session is
precisely what MFA exists to survive: without that check, whoever took one
could enrol their own authenticator and lock the real owner out.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.context import current_ip
from app.core.mfa_crypto import MfaEncryptionKeyError, is_configured
from app.core.security import verify_password
from app.crud import user_mfa as crud
from app.crud import user_trusted_device as device_crud
from app.db.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.user_mfa import (
    MfaBackupCodesResponse,
    MfaConfirmRequest,
    MfaConfirmResponse,
    MfaMethodRead,
    MfaPasswordConfirm,
    MfaSetupResponse,
    MfaStatusResponse,
    TrustedDeviceRead,
)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth/mfa", tags=["Authentication"])


def _audit(db: Session, user: User, action: str, detail: Optional[dict] = None) -> None:
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            resource_type="User",
            resource_id=user.id,
            new_values=detail,
            ip_address=current_ip.get(),
        )
    )


def _require_password(user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )


def _require_key_configured() -> None:
    """Fail early and legibly when the install has no MFA_ENCRYPTION_KEY.

    Without this the first sign of trouble is a stack trace from the crypto
    layer partway through enrolment, after the user has already scanned a code.
    """
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Multi-factor authentication is not configured on this server: "
                "MFA_ENCRYPTION_KEY is not set. Ask an administrator to set it."
            ),
        )


@router.get("/status", response_model=MfaStatusResponse)
def get_mfa_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    settings = crud.get_mfa_settings(db)
    methods = [m for m in user.mfa_methods if m.confirmed_at is not None]
    return MfaStatusResponse(
        enabled=bool(user.mfa_enabled),
        pending_setup=crud.get_totp_method(db, user.id, confirmed=False) is not None,
        methods=[MfaMethodRead.model_validate(m) for m in methods],
        backup_codes_remaining=crud.count_unused_backup_codes(db, user.id),
        required_for_this_user=crud.is_mfa_required_for(user, settings),
        system_enabled=bool(settings.mfa_enabled) if settings else False,
    )


@router.post("/setup", response_model=MfaSetupResponse)
@limiter.limit("10/minute")
def start_mfa_setup(
    request: Request,
    payload: MfaPasswordConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    _require_key_configured()
    _require_password(user, payload.password)

    # One TOTP factor per account for now. Several *devices* is a WebAuthn
    # concern; letting a second authenticator app be added silently would just
    # widen the ways in without the user noticing.
    if crud.get_totp_method(db, user.id, confirmed=True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An authenticator app is already set up. Remove it first to enrol a new one.",
        )

    try:
        _method, uri, secret = crud.start_totp_enrolment(db, user)
    except MfaEncryptionKeyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    _audit(db, user, "MFA_SETUP_STARTED")
    db.commit()

    return MfaSetupResponse(
        provisioning_uri=uri,
        secret=secret,
        issuer=crud.TOTP_ISSUER,
        account_name=user.username,
    )


@router.post("/confirm", response_model=MfaConfirmResponse)
@limiter.limit("10/minute")
def confirm_mfa_setup(
    request: Request,
    payload: MfaConfirmRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Verify the first code from the new authenticator and switch it on.

    Rate limited because this accepts a six-digit code. The window allows three
    codes at a time, so an unthrottled endpoint would be a three-in-a-million
    guess per request, and a patient attacker gets a lot of requests.
    """
    _require_key_configured()

    if crud.get_totp_method(db, user.id, confirmed=True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An authenticator app is already set up.",
        )
    if not crud.get_totp_method(db, user.id, confirmed=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No enrolment in progress. Start setup first.",
        )

    try:
        codes = crud.confirm_totp_enrolment(db, user, payload.code)
    except MfaEncryptionKeyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    if codes is None:
        _audit(db, user, "MFA_CONFIRM_FAILED")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code is not valid. Check your authenticator app and try again.",
        )

    _audit(db, user, "MFA_ENABLED", {"method": "totp"})
    db.commit()
    return MfaConfirmResponse(enabled=True, backup_codes=codes)


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def disable_mfa(
    request: Request,
    payload: MfaPasswordConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    _require_password(user, payload.password)

    settings = crud.get_mfa_settings(db)
    if crud.is_mfa_required_for(user, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Multi-factor authentication is required for your role and cannot be "
                "turned off. An administrator can reset it if you have lost your device."
            ),
        )

    crud.disable_mfa(db, user)
    # A trust record that outlives the factor it was standing in for is a
    # bypass nobody is watching any more.
    revoked = device_crud.revoke_all(db, user.id)
    _audit(db, user, "MFA_DISABLED", {"trusted_devices_revoked": revoked})
    db.commit()


@router.post("/backup-codes/regenerate", response_model=MfaBackupCodesResponse)
@limiter.limit("10/minute")
def regenerate_backup_codes(
    request: Request,
    payload: MfaPasswordConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Issue a fresh set, invalidating every previous code."""
    _require_password(user, payload.password)

    if not crud.get_totp_method(db, user.id, confirmed=True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Set up an authenticator app before generating backup codes.",
        )

    codes = crud.regenerate_backup_codes(db, user)
    _audit(db, user, "MFA_BACKUP_CODES_REGENERATED")
    db.commit()
    return MfaBackupCodesResponse(backup_codes=codes)


@router.get("/devices", response_model=List[TrustedDeviceRead])
def list_trusted_devices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Browsers currently allowed to skip the second factor.

    The list is the point of the feature as much as the convenience is: an
    entry nobody recognises is the signal that something is wrong, and there is
    nowhere else that would show it.
    """
    return [TrustedDeviceRead.model_validate(d) for d in device_crud.list_devices(db, user.id)]


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_trusted_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Revoking takes effect on the next login, not when the cookie expires.

    No password is asked for here on purpose: removing trust only ever makes
    the account harder to reach, and putting friction in front of the safe
    direction is how people end up not doing it.
    """
    if not device_crud.revoke(db, user.id, device_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    _audit(db, user, "MFA_DEVICE_REVOKED", {"device_id": device_id})
    db.commit()


@router.delete("/devices", status_code=status.HTTP_204_NO_CONTENT)
def revoke_all_trusted_devices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """The "I have lost a laptop" button."""
    revoked = device_crud.revoke_all(db, user.id)
    _audit(db, user, "MFA_ALL_DEVICES_REVOKED", {"count": revoked})
    db.commit()
