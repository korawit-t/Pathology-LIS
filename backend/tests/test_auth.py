"""
Integration tests for the authentication flow.

Covers: login success/failure, inactive user, logout, unauthenticated access
to protected routes, and the failed-login counter / account-lockout policy.

The lockout classes near the bottom of this file are *characterization* tests:
they pin down what `app/routers/auth.py` does today, before TODO.md item A1
replaces the hard 5-strikes lockout with exponential backoff. Several of them
assert behaviour that A1 is expected to change — each says so in its docstring.
They are meant to fail loudly during that refactor so every change is a
deliberate one, not a silent regression.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.audit_log import AuditLog
from app.models.user import User
from app.routers import auth as auth_router


def _set_cookie_headers(response):
    return [v for k, v in response.headers.multi_items() if k.lower() == "set-cookie"]


def _fail_login(client, username, times=1):
    """POST a deliberately wrong password `times` times; return the last response.

    Keep `times` small: /auth/login is rate limited to 10/minute and the
    autouse `_reset_rate_limits` fixture only resets *between* tests.
    """
    last = None
    for _ in range(times):
        last = client.post(
            "/auth/login",
            data={"username": username, "password": "DefinitelyNotThePassword!"},
        )
    return last


def _reload(db, user_id):
    """Re-read a user the ASGI app just mutated through its own DB session."""
    db.rollback()  # drop this session's snapshot so we see the app's commits
    return db.query(User).filter(User.id == user_id).one()


class TestCookieDomain:
    """COOKIE_DOMAIN drives the `domain=` attribute on the auth cookies.

    Regression coverage for the Safari cross-site cookie fix: when unset
    (the default — LAN-only / single-host deployments), cookies must NOT
    carry a Domain attribute, preserving the original host-only behavior.
    """

    def test_no_domain_attribute_when_cookie_domain_unset(self, client, admin_user, monkeypatch):
        monkeypatch.setattr(auth_router, "COOKIE_DOMAIN", None)
        user, pwd = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        cookies = _set_cookie_headers(r)
        assert cookies, "expected Set-Cookie headers on login"
        assert all("domain=" not in c.lower() for c in cookies)

    def test_domain_attribute_present_when_cookie_domain_set(self, client, admin_user, monkeypatch):
        monkeypatch.setattr(auth_router, "COOKIE_DOMAIN", ".mylis.example.com")
        user, pwd = admin_user
        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        cookies = _set_cookie_headers(r)
        assert cookies, "expected Set-Cookie headers on login"
        assert all("domain=.mylis.example.com" in c.lower() for c in cookies)


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


class TestLockoutPolicyConstants:
    def test_current_policy_is_five_strikes_for_fifteen_minutes(self):
        """Pins the policy numbers so TODO.md A1 has to change them on purpose.

        A1 replaces this with exponential backoff; when it lands, this test
        should be rewritten rather than merely adjusted.
        """
        assert auth_router.MAX_FAILED_LOGINS == 5
        assert auth_router.LOCKOUT_MINUTES == 15


class TestFailedLoginCounter:
    """Invariants that must survive the A1 refactor."""

    def test_wrong_password_increments_counter(self, client, db, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username)
        assert _reload(db, user.id).failed_login_attempts == 1

    def test_consecutive_failures_accumulate(self, client, db, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username, times=3)
        assert _reload(db, user.id).failed_login_attempts == 3

    def test_successful_login_resets_counter(self, client, db, admin_user):
        user, pwd = admin_user
        _fail_login(client, user.username, times=3)
        assert _reload(db, user.id).failed_login_attempts == 3

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        assert _reload(db, user.id).failed_login_attempts == 0

    def test_failed_login_writes_an_audit_row(self, client, db, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username)

        db.rollback()
        rows = [
            row
            for row in db.query(AuditLog).filter(AuditLog.action == "LOGIN_FAILED").all()
            if (row.new_values or {}).get("username") == user.username
        ]
        assert len(rows) == 1
        # Nobody is authenticated on a failed attempt, so the row is unattributed.
        assert rows[0].user_id is None


class TestAccountLockout:
    """Current 5-strikes/15-minute behaviour. A1 changes most of this."""

    def test_final_allowed_failure_still_returns_401_not_429(self, client, admin_user):
        """The Nth failure locks the account but still answers 401.

        The 429 only appears on the *next* attempt, because the lock is checked
        at the top of the handler before the password is verified.
        """
        user, _ = admin_user
        last = _fail_login(client, user.username, times=auth_router.MAX_FAILED_LOGINS)
        assert last.status_code == 401

    def test_attempt_after_the_limit_returns_429(self, client, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username, times=auth_router.MAX_FAILED_LOGINS)

        r = _fail_login(client, user.username)
        assert r.status_code == 429
        assert "locked" in r.json().get("detail", "").lower()

    def test_lockout_sets_locked_until_and_zeroes_the_counter(self, client, db, admin_user):
        """On locking, the counter is reset to 0 — `locked_until` is the state
        that matters, and the count restarts once the lock lapses."""
        user, _ = admin_user
        _fail_login(client, user.username, times=auth_router.MAX_FAILED_LOGINS)

        locked = _reload(db, user.id)
        assert locked.locked_until is not None
        assert locked.locked_until > datetime.now(timezone.utc)
        assert locked.failed_login_attempts == 0

    def test_locked_account_rejects_even_the_correct_password(self, client, db, admin_user):
        """The lock check runs before `verify_password`, so a locked-out user
        cannot log in during the window even with valid credentials."""
        user, pwd = admin_user
        target = _reload(db, user.id)
        target.locked_until = datetime.now(timezone.utc) + timedelta(minutes=10)
        db.commit()

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 429

    def test_lockout_message_rounds_remaining_minutes_up(self, client, db, admin_user):
        """`int(seconds / 60) + 1` rounds up, so the user is never told to come
        back sooner than the lock actually lifts.

        The offset is deliberately half a minute off a whole-minute boundary:
        at exactly 10 minutes the elapsed request time drops the delta just
        under 600s and the message reads "10 minute(s)", which makes the
        rounding look like truncation and the assertion boundary-fragile.
        """
        user, pwd = admin_user
        target = _reload(db, user.id)
        target.locked_until = datetime.now(timezone.utc) + timedelta(minutes=10, seconds=30)
        db.commit()

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert "11 minute(s)" in r.json().get("detail", "")

    def test_login_succeeds_once_the_lock_expires(self, client, db, admin_user):
        user, pwd = admin_user
        _fail_login(client, user.username, times=auth_router.MAX_FAILED_LOGINS)

        expired = _reload(db, user.id)
        assert expired.locked_until is not None
        # Fast-forward rather than sleeping out the real 15 minutes.
        expired.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200

    def test_successful_login_clears_locked_until(self, client, db, admin_user):
        user, pwd = admin_user
        target = _reload(db, user.id)
        target.locked_until = datetime.now(timezone.utc) - timedelta(minutes=1)
        target.failed_login_attempts = 3
        db.commit()

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200

        after = _reload(db, user.id)
        assert after.locked_until is None
        assert after.failed_login_attempts == 0

    def test_inactive_user_with_wrong_password_is_still_counted(self, client, db, inactive_user):
        """`status` is only checked after the password check, so a disabled
        account still accrues failures and can be locked."""
        user, _ = inactive_user
        _fail_login(client, user.username, times=2)
        assert _reload(db, user.id).failed_login_attempts == 2


class TestLockoutDoesNotResistEnumeration:
    """Documents two oracles the current lockout opens up.

    Neither is a problem on a closed LAN, but both matter if the deployment is
    ever exposed (TODO.md phase C), and A1's redesign is the natural place to
    close them. These tests assert today's leaky behaviour on purpose: when A1
    fixes it, they fail and get rewritten as the guarantee instead.
    """

    def test_unknown_username_never_locks_out(self, client):
        """A nonexistent account answers 401 forever — no counter, no lock."""
        last = _fail_login(client, "no_such_user_xyz", times=auth_router.MAX_FAILED_LOGINS + 1)
        assert last.status_code == 401

    def test_429_versus_401_reveals_that_an_account_exists(self, client, db, admin_user):
        """Known account locks (429); unknown one keeps saying 401 — so an
        attacker can enumerate valid usernames just by hammering login.

        Locking a real account is also a denial-of-service in its own right:
        with a staff list, a whole department can be kept locked out.
        """
        user, _ = admin_user
        target = _reload(db, user.id)
        target.locked_until = datetime.now(timezone.utc) + timedelta(minutes=10)
        db.commit()

        real = _fail_login(client, user.username)
        fake = _fail_login(client, "no_such_user_xyz")

        assert real.status_code == 429
        assert fake.status_code == 401
