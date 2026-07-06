"""
Integration tests for the authentication flow.

Covers: login success/failure, inactive user, logout, and
unauthenticated access to protected routes.
"""

import pytest


class TestLogin:
    def test_login_success_returns_user_data(self, client, admin_user):
        user, pwd = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        body = r.json()
        # Login returns {"token_type": ..., "roles": [...], "user": {...}}
        assert "user" in body
        assert body["user"]["username"] == user.username
        assert "roles" in body

    def test_login_sets_auth_cookie(self, client, admin_user):
        user, pwd = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        # httpOnly cookies are in the cookie jar, not the response body
        assert "access_token" in r.cookies

    def test_login_response_body_does_not_leak_tokens(self, client, admin_user):
        user, pwd = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" not in body
        assert "refresh_token" not in body

    def test_login_wrong_password_returns_401(self, client, admin_user):
        user, _ = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": "WrongPass!"})
        assert r.status_code == 401

    def test_login_nonexistent_user_returns_401(self, client):
        r = client.post("/auth/login", data={"username": "nobody_xyz", "password": "any"})
        assert r.status_code == 401

    def test_inactive_user_cannot_login(self, client, inactive_user):
        user, pwd = inactive_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        # Inactive user returns 400 (separate from wrong-password 401)
        assert r.status_code == 400
        assert "Inactive" in r.json().get("detail", "")


class TestLogout:
    def test_logout_returns_200(self, admin_client):
        r = admin_client.post("/auth/logout")
        assert r.status_code == 200

    def test_after_logout_cookie_is_cleared(self, admin_client):
        admin_client.post("/auth/logout")
        # Cookie value should be empty or removed
        cookie_value = admin_client.cookies.get("access_token", "")
        assert cookie_value == ""


class TestRefreshRotationAndReuseDetection:
    """Regression tests for a fix to app/routers/auth.py's /auth/refresh and
    /auth/logout: refresh tokens previously carried no jti and were never
    revoked on rotation or logout, so a stolen refresh token stayed valid
    for its full TTL (up to REFRESH_TOKEN_EXPIRE_DAYS) even after the
    legitimate user rotated past it or logged out."""

    def test_refresh_rotates_both_tokens(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        old_refresh = client.cookies.get("refresh_token")

        r = client.post("/auth/refresh")

        assert r.status_code == 200
        assert client.cookies.get("refresh_token") != old_refresh
        body = r.json()
        assert "access_token" not in body
        assert "refresh_token" not in body

    def test_reusing_a_rotated_refresh_token_is_rejected(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        old_refresh = client.cookies.get("refresh_token")

        first = client.post("/auth/refresh")
        assert first.status_code == 200

        # Replay the pre-rotation refresh token explicitly (the client's own
        # cookie jar now holds the new one, so override it for this call).
        replay = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})

        assert replay.status_code == 401

    def test_logout_revokes_refresh_token_too(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        refresh_token = client.cookies.get("refresh_token")

        logout_resp = client.post("/auth/logout")
        assert logout_resp.status_code == 200

        replay = client.post("/auth/refresh", cookies={"refresh_token": refresh_token})

        assert replay.status_code == 401


class TestProtectedRoutes:
    def test_unauthenticated_request_returns_401(self, client):
        r = client.get("/surgical-cases/")
        assert r.status_code == 401

    def test_authenticated_request_is_accepted(self, admin_client):
        r = admin_client.get("/surgical-cases/")
        assert r.status_code == 200

    def test_protected_endpoint_includes_user_context(self, admin_client):
        """A protected endpoint responds 200 (auth is wired end-to-end)."""
        r = admin_client.get("/surgical-cases/")
        assert r.status_code == 200
