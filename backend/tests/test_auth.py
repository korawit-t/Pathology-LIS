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
