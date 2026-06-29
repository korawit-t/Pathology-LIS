from datetime import datetime, timezone
from app.db.database import Base, engine, SessionLocal
import app.models  # registers all models with Base.metadata via __init__.py

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Done.")

# Ensure all enum values exist (create_all does not update existing enums)
_ENUM_MIGRATIONS = [
    ("reportstatus", ["draft", "pending", "published", "cancelled"]),
]

# Rename uppercase legacy labels → lowercase (idempotent: skipped if old label already gone)
# Needed because DROP TABLE does NOT drop enum types — old types may survive a table wipe.
_ENUM_RENAMES = [
    ("reportstatus",        [("DRAFT", "draft"), ("PENDING_APPROVAL", "pending"), ("PUBLISHED", "published"), ("CANCELLED", "cancelled")]),
    ("gynereportstatus",    [("DRAFT", "draft"), ("PENDING_APPROVAL", "pending"), ("PUBLISHED", "published"), ("CANCELLED", "cancelled")]),
    ("nongynereportstatus", [("DRAFT", "draft"), ("PENDING_APPROVAL", "pending"), ("PUBLISHED", "published"), ("CANCELLED", "cancelled")]),
]

try:
    from sqlalchemy import text
    with engine.connect() as conn:
        for enum_name, values in _ENUM_MIGRATIONS:
            for value in values:
                conn.execute(text(
                    f"DO $$ BEGIN "
                    f"IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '{value}' "
                    f"AND enumtypid = (SELECT oid FROM pg_type WHERE typname = '{enum_name}')) "
                    f"THEN ALTER TYPE {enum_name} ADD VALUE '{value}'; END IF; END $$;"
                ))
        for enum_name, renames in _ENUM_RENAMES:
            for old, new in renames:
                conn.execute(text(
                    f"DO $$ BEGIN "
                    f"IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
                    f"WHERE t.typname = '{enum_name}' AND e.enumlabel = '{old}') "
                    f"THEN ALTER TYPE {enum_name} RENAME VALUE '{old}' TO '{new}'; END IF; END $$;"
                ))
        conn.commit()
    print("Enum sync done.")
except Exception as e:
    print(f"Warning: enum sync failed: {e}")

# Purge expired rows from revoked_tokens on every restart so the table
# doesn't grow unbounded.  Rows older than the longest access token lifetime
# can never match a valid token anyway.
try:
    from app.models.revoked_token import RevokedToken
    db = SessionLocal()
    deleted = db.query(RevokedToken).filter(
        RevokedToken.expires_at < datetime.now(timezone.utc)
    ).delete(synchronize_session=False)
    db.commit()
    db.close()
    if deleted:
        print(f"Cleaned up {deleted} expired revoked token(s).")
except Exception as e:
    print(f"Warning: revoked_tokens cleanup failed: {e}")
