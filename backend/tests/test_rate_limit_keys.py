"""Signed-in routes are rate limited per user, not per client address.

Docker Desktop shows the backend one address for every machine on the LAN, and
NAT or an unlisted reverse proxy does the same. With the limits keyed on that
address, one person's token refreshes, mistyped passwords or MFA attempts used
up everyone's allowance: past 20 refreshes a minute across the whole hospital,
/auth/refresh answered 429 and whoever came next was signed out.

Every TestClient request comes from the same address ("testclient"), so the
behavioural tests below stand in for a hospital behind one address.
"""

from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from jose import jwt
from starlette.requests import Request

from app.core.mfa_crypto import ENV_VAR as MFA_KEY_ENV_VAR
from app.core.rate_limit import refresh_token_user_key, signed_in_user_key
from app.core.security import ALGORITHM, SECRET_KEY, create_access_token, create_refresh_token
from app.routers import auth as auth_router
from app.routers import user_mfa as mfa_router
from app.routers import users as users_router
from main import app

ADDRESS = "10.0.0.7"


def _request(cookies=None, headers=None):
    raw = []
    if cookies:
        raw.append((b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode()))
    for name, value in (headers or {}).items():
        raw.append((name.lower().encode(), value.encode()))
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/",
        "query_string": b"",
        "headers": raw,
        "client": (ADDRESS, 50000),
    })


def _allowed(limit: str) -> int:
    return int(limit.split("/")[0])


def _signed_in(username, password):
    """A second, independent browser: its own cookie jar, same address."""
    other = TestClient(app)
    r = other.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return other


class TestRefreshKey:
    def test_a_valid_refresh_cookie_keys_on_its_user(self):
        token, _jti, _exp = create_refresh_token(subject="alice")
        assert refresh_token_user_key(_request(cookies={"refresh_token": token})) == "user:alice"

    def test_no_cookie_falls_back_to_the_address(self):
        assert refresh_token_user_key(_request()) == ADDRESS

    def test_a_token_signed_with_another_key_does_not_get_a_bucket_of_its_own(self):
        forged = jwt.encode({"sub": "alice", "type": "refresh"}, "not-the-server-key", algorithm=ALGORITHM)
        assert refresh_token_user_key(_request(cookies={"refresh_token": forged})) == ADDRESS

    def test_an_expired_refresh_token_falls_back_to_the_address(self):
        expired = jwt.encode(
            {"sub": "alice", "type": "refresh", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        assert refresh_token_user_key(_request(cookies={"refresh_token": expired})) == ADDRESS

    def test_an_access_token_in_the_refresh_cookie_is_not_a_refresh_key(self):
        token, _jti, _exp = create_access_token(subject="alice", uid=1)
        assert refresh_token_user_key(_request(cookies={"refresh_token": token})) == ADDRESS


class TestSignedInUserKey:
    def test_the_access_cookie_keys_on_its_user(self):
        token, _jti, _exp = create_access_token(subject="alice", uid=1)
        assert signed_in_user_key(_request(cookies={"access_token": token})) == "user:alice"

    def test_a_bearer_header_keys_on_its_user(self):
        token, _jti, _exp = create_access_token(subject="bob", uid=2)
        assert signed_in_user_key(_request(headers={"Authorization": f"Bearer {token}"})) == "user:bob"

    def test_the_cookie_wins_over_the_header_as_in_get_current_user(self):
        cookie, _jti, _exp = create_access_token(subject="alice", uid=1)
        header, _jti, _exp = create_access_token(subject="bob", uid=2)
        request = _request(cookies={"access_token": cookie}, headers={"Authorization": f"Bearer {header}"})
        assert signed_in_user_key(request) == "user:alice"

    def test_a_refresh_token_presented_as_access_is_not_a_user_key(self):
        token, _jti, _exp = create_refresh_token(subject="alice")
        assert signed_in_user_key(_request(cookies={"access_token": token})) == ADDRESS

    def test_no_token_falls_back_to_the_address(self):
        assert signed_in_user_key(_request()) == ADDRESS


class TestColleaguesBehindOneAddress:
    def test_one_users_refreshes_do_not_sign_a_colleague_out(self, client, admin_user, pathologist_user):
        busy, busy_pwd = admin_user
        colleague, colleague_pwd = pathologist_user
        assert client.post("/auth/login", data={"username": busy.username, "password": busy_pwd}).status_code == 200
        other = _signed_in(colleague.username, colleague_pwd)

        for _ in range(_allowed(auth_router.REFRESH_ATTEMPTS_PER_USER)):
            assert client.post("/auth/refresh").status_code == 200
        assert client.post("/auth/refresh").status_code == 429

        assert other.post("/auth/refresh").status_code == 200

    def test_one_users_password_attempts_leave_a_colleagues_alone(self, client, admin_user, pathologist_user):
        busy, busy_pwd = admin_user
        colleague, colleague_pwd = pathologist_user
        assert client.post("/auth/login", data={"username": busy.username, "password": busy_pwd}).status_code == 200
        other = _signed_in(colleague.username, colleague_pwd)
        wrong = {"current_password": "not-the-password", "new_password": "BrandNewPass1!"}

        for _ in range(_allowed(users_router.PASSWORD_CHANGE_ATTEMPTS_PER_USER)):
            assert client.put("/users/me/password", json=wrong).status_code == 400
        assert client.put("/users/me/password", json=wrong).status_code == 429

        assert other.put("/users/me/password", json=wrong).status_code == 400

    def test_one_users_mfa_attempts_leave_a_colleagues_alone(
        self, client, admin_user, pathologist_user, monkeypatch
    ):
        monkeypatch.setenv(MFA_KEY_ENV_VAR, Fernet.generate_key().decode())
        busy, busy_pwd = admin_user
        colleague, colleague_pwd = pathologist_user
        assert client.post("/auth/login", data={"username": busy.username, "password": busy_pwd}).status_code == 200
        other = _signed_in(colleague.username, colleague_pwd)
        wrong = {"password": "not-the-password"}

        for _ in range(_allowed(mfa_router.MFA_ATTEMPTS_PER_USER)):
            assert client.post("/auth/mfa/setup", json=wrong).status_code == 401
        assert client.post("/auth/mfa/setup", json=wrong).status_code == 429

        assert other.post("/auth/mfa/setup", json=wrong).status_code == 401


@pytest.mark.parametrize(
    "limit",
    [
        auth_router.REFRESH_ATTEMPTS_PER_USER,
        users_router.PASSWORD_CHANGE_ATTEMPTS_PER_USER,
        mfa_router.MFA_ATTEMPTS_PER_USER,
    ],
)
def test_limits_are_per_minute(limit):
    """The tests above spend a budget inside one window; a per-hour budget
    would make them slow, a per-second one flaky."""
    assert limit.endswith("/minute")
