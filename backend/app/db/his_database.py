"""
HIS (HOSxP) Database Connection
Separate SQLAlchemy engine for the external MySQL HIS database.
Configured via HIS_DATABASE_URL in .env
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

HIS_DATABASE_URL = os.getenv("HIS_DATABASE_URL")

# Create engine only if configured
_his_engine = None
_HisSessionLocal = None

if HIS_DATABASE_URL and HIS_DATABASE_URL.strip().startswith(("mysql", "postgresql", "sqlite")):
    _his_engine = create_engine(
        HIS_DATABASE_URL,
        pool_pre_ping=True,      # Auto-reconnect on stale connections
        pool_recycle=3600,        # Recycle connections every hour
        pool_size=5,
        max_overflow=10,
    )
    _HisSessionLocal = sessionmaker(bind=_his_engine, autocommit=False, autoflush=False)


def get_his_db():
    """
    Dependency that yields a HIS database session.
    Returns None if HIS is not configured.
    """
    if _HisSessionLocal is None:
        yield None
        return

    db = _HisSessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_his_configured() -> bool:
    """Check if HIS database is configured."""
    return HIS_DATABASE_URL is not None and HIS_DATABASE_URL.strip() != ""
