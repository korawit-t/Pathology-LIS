"""Trusted-device handling for the two-step login.

A trusted device skips the *second* factor and nothing else. The password is
still required every time, so a stolen cookie on its own is not a way in — it
is a way past the code, which is why it expires, is revocable, and is recorded
where the user can see it.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.user_trusted_device import UserTrustedDevice

COOKIE_NAME = "trusted_device"
DEFAULT_TRUSTED_DEVICE_DAYS = 14


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    """SHA-256, deliberately not Argon2.

    The token is 32 bytes from `secrets`, so there is no dictionary to grind
    through and a slow KDF would only add cost to every login. Hashing at all
    is what matters: a leaked table then contains no usable cookies.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def trusted_device_days(settings: Optional[SystemSetting]) -> int:
    if not settings:
        return DEFAULT_TRUSTED_DEVICE_DAYS
    value = settings.mfa_trusted_device_days
    return DEFAULT_TRUSTED_DEVICE_DAYS if value is None else int(value)


def describe_user_agent(user_agent: Optional[str]) -> str:
    """A recognisable label for the device list.

    Crude on purpose. The point is only that someone scanning their own list
    can tell "the ward PC" from "something I do not recognise" — precision here
    would be false confidence, since the string is client-supplied anyway.
    """
    ua = (user_agent or "").strip()
    if not ua:
        return "Unknown device"

    if "Edg/" in ua:
        browser = "Edge"
    elif "Chrome/" in ua and "Chromium" not in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua and "Chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Browser"

    if "Windows" in ua:
        platform = "Windows"
    elif "Android" in ua:
        platform = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        platform = "iOS"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        platform = "macOS"
    elif "Linux" in ua:
        platform = "Linux"
    else:
        return browser

    return f"{browser} on {platform}"


def find_valid_device(db: Session, user: User, token: Optional[str]) -> Optional[UserTrustedDevice]:
    """Resolve a cookie to a live trust record for this specific user.

    The user_id check is not redundant with the token lookup: without it, a
    cookie issued to one account would satisfy the second factor for whichever
    account the password happened to match.
    """
    if not token:
        return None

    device = (
        db.query(UserTrustedDevice)
        .filter(UserTrustedDevice.token_hash == hash_token(token))
        .first()
    )
    if not device:
        return None
    if device.user_id != user.id:
        return None
    if device.revoked_at is not None:
        return None
    if device.expires_at <= _now():
        return None
    return device


def remember_device(
    db: Session,
    user: User,
    *,
    user_agent: Optional[str],
    ip_address: Optional[str],
    days: int,
) -> Optional[str]:
    """Trust this browser and return the raw cookie value, stored only hashed.

    Returns None when the installation has trusted devices switched off, so a
    site that wants a code on every login gets exactly that.
    """
    if days <= 0:
        return None

    token = secrets.token_urlsafe(32)
    db.add(
        UserTrustedDevice(
            user_id=user.id,
            token_hash=hash_token(token),
            label=describe_user_agent(user_agent),
            user_agent=(user_agent or "")[:1000] or None,
            ip_address=ip_address,
            expires_at=_now() + timedelta(days=days),
        )
    )
    return token


def touch(db: Session, device: UserTrustedDevice) -> None:
    device.last_used_at = _now()
    db.add(device)


def list_devices(db: Session, user_id: int) -> List[UserTrustedDevice]:
    """Live devices only — a list padded with expired and revoked entries is
    harder to scan for the one thing it exists to reveal: something unexpected."""
    return (
        db.query(UserTrustedDevice)
        .filter(
            UserTrustedDevice.user_id == user_id,
            UserTrustedDevice.revoked_at.is_(None),
            UserTrustedDevice.expires_at > _now(),
        )
        .order_by(UserTrustedDevice.last_used_at.desc().nullslast(),
                  UserTrustedDevice.created_at.desc())
        .all()
    )


def revoke(db: Session, user_id: int, device_id: int) -> bool:
    device = (
        db.query(UserTrustedDevice)
        .filter(
            UserTrustedDevice.id == device_id,
            UserTrustedDevice.user_id == user_id,
            UserTrustedDevice.revoked_at.is_(None),
        )
        .first()
    )
    if not device:
        return False
    device.revoked_at = _now()
    db.add(device)
    return True


def revoke_all(db: Session, user_id: int) -> int:
    """Used both by the "sign out everywhere" action and whenever MFA is
    turned off or reset, since a trust record outliving its factor is a
    bypass nobody is looking at any more."""
    return (
        db.query(UserTrustedDevice)
        .filter(
            UserTrustedDevice.user_id == user_id,
            UserTrustedDevice.revoked_at.is_(None),
        )
        .update({UserTrustedDevice.revoked_at: _now()}, synchronize_session=False)
    )
