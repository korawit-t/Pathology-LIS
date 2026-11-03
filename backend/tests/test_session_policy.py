"""Session rules enforced on every request, not per router.

- A password change (or an admin reset) ends every session the account
  already had. Before, a refresh token kept rotating past it indefinitely,
  so changing the password did nothing about a session left open elsewhere.
- A temporary or expired password is refused on every route except what the
  change-password screen needs. check_password_status used to do this on 11
  routers of 71.
- A disabled account stops at its next request, not when its 15-minute access
  token runs out.
- The SECRET_KEY placeholder shipped in .env.example no longer boots.
"""

import os
import subprocess
import sys
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.routing import iter_route_contexts
from fastapi.testclient import TestClient
from jose import jwt

from app.core.security import ALGORITHM, SECRET_KEY, create_mfa_challenge_token
from app.models.system_setting import SystemSetting
from app.utils.time import local_now
from main import app
from tests.conftest import _make_user
from tests.factories import clear_system_settings, make_system_setting

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def plain_login(db):
    # Settings rows outlive a test. Keep MFA and password expiry from another
    # test out of these logins; the expiry test sets its own value.
    row = db.query(SystemSetting).first()
    saved = (row.mfa_enabled, row.mfa_step_up_minutes, row.password_expiry_days) if row else None
    if row:
        row.mfa_enabled, row.mfa_step_up_minutes, row.password_expiry_days = False, 0, 0
        db.commit()
    yield row
    if row:
        db.refresh(row)
        row.mfa_enabled, row.mfa_step_up_minutes, row.password_expiry_days = saved
        db.commit()


def _account(db, roles=("histo",)):
    return _make_user(db, f"sess_{uuid.uuid4().hex[:10]}", "SessPass1!", list(roles))


def _signed_in(user, password) -> TestClient:
    """A separate browser: its own cookie jar."""
    c = TestClient(app)
    r = c.post("/auth/login", data={"username": user.username, "password": password})
    assert r.status_code == 200, r.text
    return c


class TestPasswordChangeEndsOtherSessions:
    def test_other_sessions_end_and_the_caller_stays_signed_in(self, db):
        user, pwd = _account(db)
        left_open = _signed_in(user, pwd)  # e.g. a ward PC nobody signed out of
        owner = _signed_in(user, pwd)

        r = owner.put("/users/me/password", json={"current_password": pwd, "new_password": "BrandNew99!x"})
        assert r.status_code == 204

        # The old session's access token and refresh token are both refused.
        assert left_open.get("/users/me").status_code == 401
        assert left_open.post("/auth/refresh").status_code == 401
        # The profile-menu change keeps whoever made it signed in, through a
        # refresh too.
        assert owner.get("/org/titles").status_code == 200
        assert owner.post("/auth/refresh").status_code == 200
        assert owner.get("/org/titles").status_code == 200

    def test_admin_reset_ends_the_accounts_sessions(self, db, admin_client):
        user, pwd = _account(db)
        session = _signed_in(user, pwd)

        r = admin_client.put(f"/users/{user.id}", json={"password": "ResetByAdmin1!"})
        assert r.status_code == 200

        assert session.get("/users/me").status_code == 401
        assert session.post("/auth/refresh").status_code == 401

    def test_admin_cannot_clear_the_temporary_flag_of_a_password_they_set(self, db, admin_client):
        user, _ = _account(db)

        r = admin_client.put(
            f"/users/{user.id}",
            json={"password": "ResetByAdmin1!", "is_temporary_password": False},
        )
        assert r.status_code == 200
        assert r.json()["is_temporary_password"] is True

        r = admin_client.put(f"/users/{user.id}", json={"is_temporary_password": False})
        assert r.json()["is_temporary_password"] is True

    def test_mfa_challenge_from_before_the_change_is_refused(self, db, client):
        user, _ = _account(db)
        challenge, _jti, _exp = create_mfa_challenge_token(user.username, user.id)
        user.last_update_password = local_now() + timedelta(seconds=5)
        db.commit()

        r = client.post("/auth/login/mfa", json={"mfa_token": challenge, "code": "000000"})
        # Refused as a stale challenge, before the code is even tried (a wrong
        # code says "That code is not valid." and counts a failure).
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid or expired challenge"
        db.refresh(user)
        assert not user.failed_login_attempts

    def test_tokens_minted_before_iat_existed(self, db, client):
        # Sessions from before this check carry no iat. They are let through
        # only for an account whose password has never been changed.
        user, _ = _account(db)
        legacy = jwt.encode({"sub": user.username, "type": "access", "exp": 4102444800}, SECRET_KEY, algorithm=ALGORITHM)
        headers = {"Authorization": f"Bearer {legacy}"}

        assert client.get("/users/me", headers=headers).status_code == 200
        user.last_update_password = local_now()
        db.commit()
        assert client.get("/users/me", headers=headers).status_code == 401


class TestPasswordChangeDue:
    def test_temporary_password_reaches_only_the_change_screen(self, db):
        user, pwd = _account(db)
        user.is_temporary_password = True
        db.commit()
        c = _signed_in(user, pwd)

        # A login-only route that check_password_status never covered.
        r = c.get("/org/titles")
        assert r.status_code == 403
        assert r.json()["detail"] == "FORCE_PASSWORD_CHANGE"
        assert c.get("/users/me").status_code == 200

        assert c.put("/users/me/password", json={"current_password": pwd, "new_password": "BrandNew99!x"}).status_code == 204
        assert c.get("/org/titles").status_code == 200

    def test_expired_password_is_refused_until_changed(self, db, plain_login):
        row = plain_login or make_system_setting(db)
        row.password_expiry_days = 30
        db.commit()
        try:
            user, pwd = _account(db)
            user.last_update_password = local_now() - timedelta(days=31)
            db.commit()
            c = _signed_in(user, pwd)

            r = c.get("/org/titles")
            assert r.status_code == 403
            assert r.json()["detail"] == "PASSWORD_EXPIRED"
            assert c.put("/users/me/password", json={"current_password": pwd, "new_password": "BrandNew99!x"}).status_code == 204
            assert c.get("/org/titles").status_code == 200
        finally:
            if plain_login is None:
                clear_system_settings(db)

    def test_only_the_change_screens_endpoints_are_exempt(self):
        exempt = {
            ctx.endpoint.__name__
            for ctx in iter_route_contexts(app.routes)
            if getattr(getattr(ctx, "endpoint", None), "allowed_while_password_change_due", False)
        }
        assert exempt == {"read_users_me", "update_my_password", "update_my_preferences"}


class TestDisabledAccount:
    def test_stops_at_the_next_request(self, db):
        user, pwd = _account(db)
        c = _signed_in(user, pwd)
        user.status = False
        db.commit()

        # Login-only routes used to keep answering until the token expired.
        assert c.get("/org/titles").status_code == 401
        assert c.post("/org/titles", json={"title": f"zz{uuid.uuid4().hex[:6]}"}).status_code == 401
        assert c.post("/auth/refresh").status_code == 401


class TestSecretKeyPlaceholder:
    def _boot(self, key):
        env = {**os.environ, "SECRET_KEY": key}
        return subprocess.run(
            [sys.executable, "-c", "import app.core.security"],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True,
        )

    def test_env_example_placeholder_is_refused(self):
        example = (BACKEND_DIR / ".env.example").read_text()
        placeholder = next(
            line.split("=", 1)[1].strip() for line in example.splitlines() if line.startswith("SECRET_KEY=")
        )
        r = self._boot(placeholder)
        assert r.returncode != 0
        assert "placeholder" in r.stderr

    def test_a_generated_key_boots(self):
        assert self._boot(uuid.uuid4().hex + uuid.uuid4().hex).returncode == 0
