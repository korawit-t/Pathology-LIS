"""Enrolment logic for multi-factor authentication.

Login-time verification is not here yet — this covers getting a factor onto an
account and taking it off again. The one login-relevant helper that does live
here is `verify_totp`, because confirming an enrolment and signing in later use
exactly the same check and must not drift apart.
"""

import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple

import pyotp
from sqlalchemy.orm import Session

from app.core.mfa_crypto import decrypt_secret, encrypt_secret
from app.core.security import get_password_hash, verify_password
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.user_mfa import UserMfaBackupCode, UserMfaMethod

TOTP_ISSUER = "Pathology LIS"

# One step either side of now, the usual allowance. Covers a user typing a code
# as it rolls over and modest clock drift on the phone, without widening the
# guessable window much: three codes are live at a time out of a million.
TOTP_VALID_WINDOW = 1

BACKUP_CODE_COUNT = 10
# Two groups of four from an unambiguous alphabet — no O/0, I/1, or similar —
# because these get read off paper and typed under time pressure.
_BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

def get_mfa_settings(db: Session) -> SystemSetting | None:
    return db.query(SystemSetting).first()


def is_mfa_required_for(user: User, settings: SystemSetting | None) -> bool:
    """Whether policy compels this user to keep a factor enrolled.

    False when the installation has MFA switched off entirely, so that turning
    the master switch off also releases anyone who was being compelled by it.
    """
    if not settings or not settings.mfa_enabled:
        return False
    required = settings.mfa_required_roles or []
    if not required:
        return False
    user_roles = user.roles if isinstance(user.roles, list) else []
    return bool(set(user_roles) & set(required))


# ---------------------------------------------------------------------------
# TOTP
# ---------------------------------------------------------------------------

def _totp_for(method: UserMfaMethod) -> pyotp.TOTP:
    return pyotp.TOTP(decrypt_secret(method.secret_enc))


def verify_totp(db: Session, method: UserMfaMethod, code: str) -> bool:
    """Check a code and burn the time step it belongs to.

    Recording the step is what stops a code being replayed inside the thirty
    seconds it stays valid — someone reading it over a shoulder, or replaying a
    captured request, would otherwise get a second use out of it.
    """
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit():
        return False

    totp = _totp_for(method)
    now = _now()
    if not totp.verify(code, for_time=now, valid_window=TOTP_VALID_WINDOW):
        return False

    # Find which step actually matched, so the whole window is not burned at once.
    step = None
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        candidate = totp.timecode(now) + offset
        if secrets.compare_digest(totp.at(candidate * totp.interval), code):
            step = candidate
            break
    if step is None:  # matched by verify() but not located; refuse rather than guess
        return False

    if method.last_used_step is not None and step <= method.last_used_step:
        return False

    method.last_used_step = step
    method.last_used_at = now
    db.add(method)
    return True


# ---------------------------------------------------------------------------
# Enrolment
# ---------------------------------------------------------------------------

def get_totp_method(db: Session, user_id: int, *, confirmed: Optional[bool] = None):
    q = db.query(UserMfaMethod).filter(
        UserMfaMethod.user_id == user_id,
        UserMfaMethod.method_type == "totp",
    )
    if confirmed is True:
        q = q.filter(UserMfaMethod.confirmed_at.isnot(None))
    elif confirmed is False:
        q = q.filter(UserMfaMethod.confirmed_at.is_(None))
    return q.first()


def start_totp_enrolment(db: Session, user: User) -> Tuple[UserMfaMethod, str, str]:
    """Create an unconfirmed TOTP factor and return (method, uri, secret).

    Any earlier unconfirmed attempt is discarded rather than reused: someone
    restarting enrolment has usually scanned a code that did not work, and
    handing back the same secret would keep whatever went wrong in place.
    """
    stale = get_totp_method(db, user.id, confirmed=False)
    if stale:
        db.delete(stale)
        db.flush()

    secret = pyotp.random_base32()
    method = UserMfaMethod(
        user_id=user.id,
        method_type="totp",
        label="Authenticator app",
        secret_enc=encrypt_secret(secret),
    )
    db.add(method)
    db.flush()

    account_name = user.username
    uri = pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=TOTP_ISSUER)
    return method, uri, secret


def confirm_totp_enrolment(db: Session, user: User, code: str) -> Optional[List[str]]:
    """Verify the first code and switch the factor on.

    Returns freshly generated backup codes, or None when the code is wrong.
    """
    method = get_totp_method(db, user.id, confirmed=False)
    if not method:
        return None
    if not verify_totp(db, method, code):
        return None

    method.confirmed_at = _now()
    method.is_primary = True
    user.mfa_enabled = True
    db.add_all([method, user])

    return regenerate_backup_codes(db, user)


def disable_mfa(db: Session, user: User) -> None:
    """Remove every factor and backup code from the account."""
    db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(UserMfaBackupCode).filter(UserMfaBackupCode.user_id == user.id).delete(
        synchronize_session=False
    )
    user.mfa_enabled = False
    db.add(user)


# ---------------------------------------------------------------------------
# Backup codes
# ---------------------------------------------------------------------------

def _new_backup_code() -> str:
    body = "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(8))
    return f"{body[:4]}-{body[4:]}"


def regenerate_backup_codes(db: Session, user: User) -> List[str]:
    """Replace all codes and return the plaintext, which is never stored.

    Hashed with the same Argon2 context as passwords: a backup code is a
    password substitute and a leaked table should not hand over working ones.
    """
    db.query(UserMfaBackupCode).filter(UserMfaBackupCode.user_id == user.id).delete(
        synchronize_session=False
    )
    codes = [_new_backup_code() for _ in range(BACKUP_CODE_COUNT)]
    db.add_all(
        UserMfaBackupCode(user_id=user.id, code_hash=get_password_hash(code))
        for code in codes
    )
    return codes


def count_unused_backup_codes(db: Session, user_id: int) -> int:
    return (
        db.query(UserMfaBackupCode)
        .filter(
            UserMfaBackupCode.user_id == user_id,
            UserMfaBackupCode.used_at.is_(None),
        )
        .count()
    )


def consume_backup_code(db: Session, user: User, code: str) -> bool:
    """Spend a backup code. Each works exactly once.

    Every unused code has to be checked, since only the hashes are stored. That
    is BACKUP_CODE_COUNT Argon2 verifications in the worst case, which is the
    price of not keeping them in a reversible form.
    """
    candidate = (code or "").strip().upper()
    if not candidate:
        return False

    rows = (
        db.query(UserMfaBackupCode)
        .filter(
            UserMfaBackupCode.user_id == user.id,
            UserMfaBackupCode.used_at.is_(None),
        )
        .all()
    )
    for row in rows:
        if verify_password(candidate, row.code_hash):
            row.used_at = _now()
            db.add(row)
            return True
    return False
