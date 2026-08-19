"""Two-step login.

The properties that matter here are mostly about what the *first* step does not
give away, and about the challenge token being a bridge rather than a
credential. A stolen password should buy an attacker nothing but the knowledge
that it was correct.
"""

import time

import pyotp
import pytest
from cryptography.fernet import Fernet

from app.core.mfa_crypto import ENV_VAR, decrypt_secret
from app.crud import user_mfa as mfa_crud
from app.models.system_setting import SystemSetting
from app.routers import auth as auth_router


@pytest.fixture(autouse=True)
def mfa_key(monkeypatch):
    monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())


@pytest.fixture
def mfa_on(db):
    """Switch MFA on installation-wide."""
    settings = db.query(SystemSetting).first()
    if not settings:
        settings = SystemSetting(hospital_slug="mfa-login-test")
        db.add(settings)
    settings.mfa_enabled = True
    db.commit()
    return settings


@pytest.fixture
def enrolled(client, db, admin_user, mfa_on):
    """An account with a confirmed authenticator, logged out again."""
    user, pwd = admin_user
    client.post("/auth/login", data={"username": user.username, "password": pwd})
    client.post("/auth/mfa/setup", json={"password": pwd})
    db.rollback()
    method = mfa_crud.get_totp_method(db, user.id)
    secret = decrypt_secret(method.secret_enc)
    assert client.post(
        "/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()}
    ).status_code == 200
    client.post("/auth/logout")
    client.cookies.clear()
    return user, pwd, secret


def _login(client, user, pwd):
    return client.post("/auth/login", data={"username": user.username, "password": pwd})


def _fresh_code(secret):
    """A code from a step that has not been burned by enrolment."""
    totp = pyotp.TOTP(secret)
    return totp.at(int(time.time()) + 30)


class TestFirstStep:
    def test_login_returns_a_challenge_instead_of_a_session(self, client, enrolled):
        user, pwd, _secret = enrolled
        r = _login(client, user, pwd)

        assert r.status_code == 200
        body = r.json()
        assert body["mfa_required"] is True
        assert body["mfa_token"]

    def test_no_cookies_are_set_by_the_first_step(self, client, enrolled):
        user, pwd, _s = enrolled
        _login(client, user, pwd)
        assert client.cookies.get("access_token") in (None, "")
        assert client.cookies.get("refresh_token") in (None, "")

    def test_the_first_step_reveals_nothing_about_the_account(self, client, enrolled):
        """A correct password alone must not disclose identity, roles or sites."""
        user, pwd, _s = enrolled
        body = _login(client, user, pwd).json()

        assert "user" not in body
        assert "roles" not in body
        raw = _login(client, user, pwd).text
        assert user.full_name not in raw

    def test_a_wrong_password_still_looks_the_same_as_before(self, client, enrolled):
        user, _pwd, _s = enrolled
        r = client.post("/auth/login", data={"username": user.username, "password": "nope"})
        assert r.status_code == 401

    def test_the_challenge_cannot_authenticate_anything(self, client, enrolled):
        """type="mfa_challenge" is rejected by get_current_user, which accepts
        access tokens only — so a captured challenge opens no doors."""
        user, pwd, _s = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]

        r = client.get("/surgical-cases/", cookies={"access_token": token})
        assert r.status_code == 401
        r = client.get("/surgical-cases/", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401


class TestSecondStep:
    def test_a_valid_code_completes_the_login(self, client, enrolled):
        user, pwd, secret = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]

        r = client.post("/auth/login/mfa", json={"mfa_token": token, "code": _fresh_code(secret)})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["username"] == user.username
        assert "roles" in body
        assert client.cookies.get("access_token")

    def test_the_session_works_afterwards(self, client, enrolled):
        user, pwd, secret = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]
        client.post("/auth/login/mfa", json={"mfa_token": token, "code": _fresh_code(secret)})

        assert client.get("/surgical-cases/").status_code == 200

    def test_a_wrong_code_is_refused(self, client, enrolled):
        user, pwd, _s = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]

        r = client.post("/auth/login/mfa", json={"mfa_token": token, "code": "000000"})
        assert r.status_code == 401
        assert client.cookies.get("access_token") in (None, "")

    def test_a_challenge_can_only_be_spent_once(self, client, enrolled):
        """Otherwise a captured challenge is retryable for its whole lifetime."""
        user, pwd, secret = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]
        assert client.post(
            "/auth/login/mfa", json={"mfa_token": token, "code": _fresh_code(secret)}
        ).status_code == 200

        client.cookies.clear()
        r = client.post("/auth/login/mfa", json={"mfa_token": token, "code": _fresh_code(secret)})
        assert r.status_code == 401

    def test_a_forged_challenge_is_refused(self, client, enrolled):
        user, pwd, secret = enrolled
        _login(client, user, pwd)

        r = client.post(
            "/auth/login/mfa", json={"mfa_token": "not.a.jwt", "code": _fresh_code(secret)}
        )
        assert r.status_code == 401

    def test_an_access_token_is_not_accepted_as_a_challenge(self, client, db, admin_user):
        """The reverse of the earlier check: tokens must not be interchangeable
        in either direction."""
        user, pwd = admin_user
        _login(client, user, pwd)
        access = client.cookies.get("access_token")

        r = client.post("/auth/login/mfa", json={"mfa_token": access, "code": "123456"})
        assert r.status_code == 401

    def test_a_totp_code_cannot_be_replayed(self, client, enrolled):
        user, pwd, secret = enrolled
        code = _fresh_code(secret)

        token = _login(client, user, pwd).json()["mfa_token"]
        assert client.post(
            "/auth/login/mfa", json={"mfa_token": token, "code": code}
        ).status_code == 200

        client.cookies.clear()
        token2 = _login(client, user, pwd).json()["mfa_token"]
        r = client.post("/auth/login/mfa", json={"mfa_token": token2, "code": code})
        assert r.status_code == 401


class TestFailuresFeedTheBackoff:
    def test_repeated_wrong_codes_raise_the_failure_counter(self, client, db, enrolled):
        """Second-step failures must not be a free, unthrottled way to grind at
        a six-digit code."""
        user, pwd, _s = enrolled

        for _ in range(auth_router.FREE_LOGIN_ATTEMPTS + 1):
            token = _login(client, user, pwd).json()["mfa_token"]
            client.post("/auth/login/mfa", json={"mfa_token": token, "code": "000000"})

        db.rollback()
        refreshed = db.query(type(user)).filter_by(id=user.id).one()
        assert refreshed.failed_login_attempts >= auth_router.FREE_LOGIN_ATTEMPTS + 1
        assert refreshed.locked_until is not None

    def test_a_successful_second_step_clears_the_counter(self, client, db, enrolled):
        user, pwd, secret = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]
        client.post("/auth/login/mfa", json={"mfa_token": token, "code": "000000"})

        client.cookies.clear()
        token2 = _login(client, user, pwd).json()["mfa_token"]
        assert client.post(
            "/auth/login/mfa", json={"mfa_token": token2, "code": _fresh_code(secret)}
        ).status_code == 200

        db.rollback()
        refreshed = db.query(type(user)).filter_by(id=user.id).one()
        assert refreshed.failed_login_attempts == 0
        assert refreshed.locked_until is None


class TestSwitchedOff:
    def test_login_is_unchanged_when_the_master_switch_is_off(self, client, db, enrolled):
        """The point of the switch: turning it off lets everyone straight back
        in without having to unenrol anybody."""
        user, pwd, _s = enrolled
        settings = db.query(SystemSetting).first()
        settings.mfa_enabled = False
        db.commit()

        r = _login(client, user, pwd)
        assert r.status_code == 200
        assert "mfa_required" not in r.json()
        assert r.json()["user"]["username"] == user.username
        assert client.cookies.get("access_token")

    def test_a_user_without_a_factor_logs_in_normally(self, client, admin_user, mfa_on):
        user, pwd = admin_user
        r = _login(client, user, pwd)

        assert r.status_code == 200
        assert "mfa_required" not in r.json()
        assert client.cookies.get("access_token")
