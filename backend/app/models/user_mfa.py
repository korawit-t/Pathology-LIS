from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    String,
    Text,
    text,
)
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql import func
from app.db.database import Base


class UserMfaMethod(Base):
    """One enrolled second factor. A user may hold several.

    Deliberately a table rather than a couple of columns on `users`: a single
    per-user secret can represent exactly one TOTP app and nothing else, while
    WebAuthn is inherently multi-credential (a laptop and a phone are separate
    registrations of the same person). Adding the second factor type later then
    means inserting rows with a different `method_type`, not reshaping auth.

    Columns are split by which factor uses them — see the section comments.
    Only `totp` rows populate the TOTP block, only `webauthn` rows the WebAuthn
    block; the rest stay NULL.
    """

    __tablename__ = "user_mfa_methods"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    method_type = Column(String(20), nullable=False)  # totp | webauthn
    # User-facing name for the device, e.g. "iPhone" or "ward workstation", so
    # someone with several enrolled can tell which one to reach for.
    label = Column(String(100), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False, server_default="false")

    # --- TOTP only ---
    # Encrypted with MFA_ENCRYPTION_KEY, never the JWT SECRET_KEY: sharing them
    # would both mix key purposes and make SECRET_KEY impossible to rotate,
    # since rotating it would make every stored secret undecryptable at once.
    secret_enc = Column(Text, nullable=True)
    # Highest 30-second step already accepted, so the same code cannot be
    # replayed inside its own validity window.
    last_used_step = Column(BigInteger, nullable=True)

    # --- WebAuthn only ---
    # Unique across all users. Nullable, and Postgres does not treat NULLs as
    # equal, so TOTP rows do not collide with each other on this index.
    credential_id = Column(LargeBinary, nullable=True, unique=True)
    public_key = Column(LargeBinary, nullable=True)
    sign_count = Column(BigInteger, nullable=True)
    transports = Column(JSON, nullable=True)  # ["usb", "internal", "hybrid", ...]

    # NULL until the enrolment is confirmed by entering a code from the new
    # factor. An unconfirmed row must never be accepted at login, otherwise
    # starting an enrolment and abandoning it would leave a usable factor.
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # passive_deletes lets the ON DELETE CASCADE above do the work. Without it
    # SQLAlchemy's default is to load the children on parent delete and NULL
    # their user_id, which this table forbids — so deleting any user who had
    # enrolled a factor would fail outright with a NotNullViolation.
    user = relationship(
        "User",
        backref=backref("mfa_methods", cascade="all, delete-orphan", passive_deletes=True),
    )

    __table_args__ = (
        # At most one primary factor per user. Partial, so the many non-primary
        # rows are not forced to be distinct on user_id.
        Index(
            "ux_user_mfa_methods_one_primary_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )
