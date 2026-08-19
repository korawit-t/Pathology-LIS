from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql import func
from app.db.database import Base


class UserTrustedDevice(Base):
    """A browser allowed to skip the second factor until it expires.

    Why this exists at all: `idle_timeout_minutes` defaults to 10, so staff
    sign in many times a day. Asking for a code every single time does not
    produce more security, it produces workarounds — propped-open sessions,
    a shared login left running on a ward machine — which would leave the
    system worse off than before MFA and would hollow out the audit log along
    with it. Prompting per *device* rather than per *sign-in* keeps the
    protection where it counts.

    A row here bypasses the second factor and nothing else: the password is
    still required on every login, and the actions worth protecting most —
    signing out a report, amending an approved result, changing system settings
    — should ask again regardless of what this table says.
    """

    __tablename__ = "user_trusted_devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # SHA-256 of the cookie value, which is 32 random bytes. A slow KDF is the
    # right answer for low-entropy secrets like passwords and backup codes; for
    # a full-entropy random token it buys nothing and would cost an Argon2
    # verification on every login. Hashed rather than stored raw so a leaked
    # table hands over no usable cookies, and indexed so the lookup is one row
    # rather than a scan of everything the user owns.
    token_hash = Column(String(64), nullable=False, unique=True, index=True)

    # What the user sees in the device list. Derived from the user agent, so it
    # is a hint ("Chrome on Windows") rather than anything to rely on.
    label = Column(String(200), nullable=True)
    user_agent = Column(Text, nullable=True)
    # Where it was trusted from, for the same reason the audit log records IPs:
    # so an unexpected entry in the list can be recognised as unexpected.
    ip_address = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    # Soft revocation, so "I removed that laptop last week" stays answerable
    # instead of the row simply vanishing.
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship(
        "User",
        backref=backref("trusted_devices", cascade="all, delete-orphan", passive_deletes=True),
    )
