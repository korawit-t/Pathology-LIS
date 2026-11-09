"""
HIS Database Connection
Separate SQLAlchemy engine for the external HIS database (HOSxP's MySQL, or
whatever database another vendor's HIS runs on).
Configured via HIS_DATABASE_URL in .env
"""
import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

HIS_DATABASE_URL = os.getenv("HIS_DATABASE_URL")


def _build_session_factory(url):
    """A sessionmaker for `url`, or None when there is no usable HIS URL.

    Any SQLAlchemy URL is accepted, so a HIS on e.g. MS SQL works once its
    driver is pip-installed. This used to allow only mysql/postgresql/sqlite
    prefixes, while is_his_configured() looked at the raw string — so any
    other URL reported "configured" yet every call 503'd "not configured".
    create_engine() doesn't connect; it fails here only on a malformed URL
    or a missing driver, and that must not take the whole backend down.
    """
    if not url or not url.strip():
        return None
    try:
        engine = create_engine(
            url.strip(),
            pool_pre_ping=True,      # Auto-reconnect on stale connections
            pool_recycle=3600,        # Recycle connections every hour
            pool_size=5,
            max_overflow=10,
        )
    except Exception as e:  # any failure means "no HIS"; logged below
        # Log the scheme only: the exception text can echo the full URL,
        # password included.
        scheme = url.split("://", 1)[0] if "://" in url else "?"
        logger.warning(
            "HIS_DATABASE_URL is set but no engine could be created for scheme '%s' (%s). "
            "HIS integration is disabled — check the URL and that its database driver is installed.",
            scheme,
            type(e).__name__,
        )
        return None
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


_HisSessionLocal = _build_session_factory(HIS_DATABASE_URL)


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
    """Whether a HIS database connection is set up and usable.

    Checks the session factory rather than the raw URL string: a URL that
    couldn't produce an engine is as good as none, and saying "configured"
    for it is what made the frontend show a HIS button that only ever 503'd."""
    return _HisSessionLocal is not None


def get_his_session_direct():
    """Open a HIS session directly (not as a FastAPI dependency generator).

    For callers outside a request/response cycle — e.g. the
    scheduled_notifications background worker — that need to open and close
    their own session. Returns None if HIS is not configured; caller is
    responsible for closing the returned session.
    """
    if _HisSessionLocal is None:
        return None
    return _HisSessionLocal()
