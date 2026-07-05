"""
Shared pytest fixtures for the Pathology LIS backend.

Database strategy:
  - Uses a dedicated test database (pathology_lis_test) to avoid touching production data.
  - Set TEST_DATABASE_URL env var to override (e.g. for CI).
  - Tables are created fresh at session start and dropped at session end.
  - Each test gets its own SessionLocal; committed data persists across tests in the same
    run but is wiped when the session ends. UUID-suffixed usernames prevent fixture conflicts.

Running:
    cd backend
    pytest              # all tests
    pytest -k auth      # only auth tests
"""

import getpass
import os

# Must be set BEFORE app imports so load_dotenv() doesn't clobber these.
# TEST_DATABASE_URL env var is required in CI. Locally, falls back to peer-auth
# using the OS username (the default on macOS + Homebrew Postgres).
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    f"postgresql+psycopg2://{getpass.getuser()}@localhost:5432/pathology_lis_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use-only!")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "3")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("ENVIRONMENT", "development")

import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from passlib.context import CryptContext

from app.db.database import Base
from main import app

_engine = create_engine(os.environ["DATABASE_URL"])
_SessionFactory = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
_pwd = CryptContext(schemes=["argon2"], deprecated="auto")


# ---------------------------------------------------------------------------
# Session-scoped: create/drop tables once per pytest run
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Clear all slowapi rate-limit counters before each test to prevent 429 errors.

    auth.py defines its own Limiter instance separate from app.state.limiter,
    so both must be reset.
    """
    try:
        app.state.limiter._storage.reset()
    except Exception:
        pass
    try:
        from app.routers.auth import limiter as _auth_limiter
        _auth_limiter._storage.reset()
    except Exception:
        pass
    yield


@pytest.fixture(scope="session", autouse=True)
def _tables():
    Base.metadata.drop_all(bind=_engine)   # clean slate (handles crash-interrupted runs)
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


# ---------------------------------------------------------------------------
# Function-scoped: fresh DB session for test data setup
# ---------------------------------------------------------------------------

@pytest.fixture
def db(_tables):
    """Session for creating test records. Each test gets a fresh connection."""
    session = _SessionFactory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ---------------------------------------------------------------------------
# Function-scoped: HTTP client (ASGI app uses its own get_db sessions)
# ---------------------------------------------------------------------------

@pytest.fixture
def client(_tables):
    """Unauthenticated TestClient. HTTP requests use their own DB sessions."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# User factories (UUID suffix prevents conflicts between tests)
# ---------------------------------------------------------------------------

def _make_user(db, username: str, password: str, roles: list[str], status: bool = True):
    from app.models.user import User
    user = User(
        username=username,
        hashed_password=_pwd.hash(password),
        full_name=f"Test {username}",
        roles=roles,
        status=status,
        is_temporary_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, password


@pytest.fixture
def admin_user(db):
    return _make_user(db, f"admin_{uuid.uuid4().hex[:6]}", "AdminPass1!", ["admin"])


@pytest.fixture
def pathologist_user(db):
    return _make_user(db, f"path_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])


@pytest.fixture
def clinician_user(db):
    return _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])


@pytest.fixture
def lab_manager_user(db):
    return _make_user(db, f"labmgr_{uuid.uuid4().hex[:6]}", "LabMgrPass1!", ["lab_manager"])


@pytest.fixture
def inactive_user(db):
    return _make_user(db, f"inact_{uuid.uuid4().hex[:6]}", "InactPass1!", ["register"], status=False)


@pytest.fixture
def two_pathologists(db):
    """Two distinct pathologist users, e.g. for co-sign / two-round consult tests."""
    path1, _ = _make_user(db, f"path1_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    path2, _ = _make_user(db, f"path2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    return path1, path2


# ---------------------------------------------------------------------------
# Pre-authenticated clients
# ---------------------------------------------------------------------------

def _login(client, username, password):
    r = client.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed ({r.status_code}): {r.text}"
    return client


@pytest.fixture
def admin_client(client, admin_user):
    user, pwd = admin_user
    return _login(client, user.username, pwd)


@pytest.fixture
def pathologist_client(client, pathologist_user):
    user, pwd = pathologist_user
    return _login(client, user.username, pwd)


@pytest.fixture
def clinician_client(client, clinician_user):
    user, pwd = clinician_user
    return _login(client, user.username, pwd)


@pytest.fixture
def lab_manager_client(client, lab_manager_user):
    user, pwd = lab_manager_user
    return _login(client, user.username, pwd)
