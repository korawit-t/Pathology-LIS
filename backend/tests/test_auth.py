"""
Integration tests for the authentication flow.

Covers: login success/failure, inactive user, logout, unauthenticated access
to protected routes, and the failed-login counter / login backoff policy.

The classes near the bottom cover the throttling in `app/routers/auth.py`.
They started life as characterization tests for a 5-strikes / 15-minute hard
lockout and were rewritten when that was replaced by exponential backoff; the
two enumeration tests in particular used to assert the leak and now assert the
guarantee.
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

    Keep `times` under LOGIN_ATTEMPTS_PER_USERNAME unless the cap is the point
    of the test: attempts on one username are capped per minute, and the autouse
    `_reset_rate_limits` fixture only resets *between* tests.
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


def _arm_backoff(db, user_id, failures, seconds_remaining):
    """Put a user straight into a given throttle state.

    Driving the counter up over HTTP costs one request per failure, and one
    username only gets LOGIN_ATTEMPTS_PER_USERNAME of those a minute, so tests
    that care about the *later* rungs of the backoff ladder set the state
    directly instead. Pass `seconds_remaining=0` for a window that has already
    lapsed.
    """
    user = _reload(db, user_id)
    user.failed_login_attempts = failures
    user.locked_until = (
        datetime.now(timezone.utc) + timedelta(seconds=seconds_remaining)
        if seconds_remaining
        else datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    db.commit()
    return user


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


class TestLoginBackoffSchedule:
    """The delay curve itself, exercised directly rather than over HTTP."""

    def test_the_free_allowance_costs_nothing(self):
        for failures in range(0, auth_router.FREE_LOGIN_ATTEMPTS + 1):
            assert auth_router._login_backoff_seconds(failures) == 0

    def test_each_further_failure_doubles_the_wait(self):
        first_penalised = auth_router.FREE_LOGIN_ATTEMPTS + 1
        assert auth_router._login_backoff_seconds(first_penalised) == 30
        assert auth_router._login_backoff_seconds(first_penalised + 1) == 60
        assert auth_router._login_backoff_seconds(first_penalised + 2) == 120
        assert auth_router._login_backoff_seconds(first_penalised + 3) == 240

    def test_the_wait_is_capped(self):
        assert auth_router._login_backoff_seconds(50) == auth_router.LOGIN_BACKOFF_MAX_SECONDS

    def test_a_runaway_counter_does_not_build_a_huge_integer(self):
        """The counter only resets on a successful login, so it can climb a
        long way under sustained attack; the shift is clamped for that."""
        assert auth_router._login_backoff_seconds(10_000) == auth_router.LOGIN_BACKOFF_MAX_SECONDS

    def test_humanized_delay_rounds_up(self):
        assert auth_router._humanize_seconds(30) == "30 second(s)"
        assert auth_router._humanize_seconds(61) == "2 minute(s)"
        assert auth_router._humanize_seconds(300) == "5 minute(s)"


class TestFailedLoginCounter:
    """Invariants that held under the old hard lockout and still hold now."""

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


class TestLoginBackoff:
    """Exponential backoff on consecutive failures, exercised over HTTP."""

    def test_the_free_allowance_sets_no_delay(self, client, db, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username, times=auth_router.FREE_LOGIN_ATTEMPTS)

        after = _reload(db, user.id)
        assert after.failed_login_attempts == auth_router.FREE_LOGIN_ATTEMPTS
        assert after.locked_until is None

    def test_the_first_penalised_failure_starts_the_delay(self, client, db, admin_user):
        user, _ = admin_user
        _fail_login(client, user.username, times=auth_router.FREE_LOGIN_ATTEMPTS + 1)

        after = _reload(db, user.id)
        assert after.locked_until is not None
        remaining = (after.locked_until - datetime.now(timezone.utc)).total_seconds()
        assert 0 < remaining <= auth_router.LOGIN_BACKOFF_BASE_SECONDS

    def test_the_counter_keeps_climbing_rather_than_resetting(self, client, db, admin_user):
        """The old hard lockout zeroed the counter every time it locked, which
        is precisely what stopped the penalty from escalating."""
        user, _ = admin_user
        _fail_login(client, user.username, times=auth_router.FREE_LOGIN_ATTEMPTS + 1)

        assert _reload(db, user.id).failed_login_attempts == auth_router.FREE_LOGIN_ATTEMPTS + 1

    def test_each_further_failure_earns_a_longer_delay(self, client, db, admin_user):
        user, _ = admin_user
        _arm_backoff(db, user.id, failures=auth_router.FREE_LOGIN_ATTEMPTS + 1, seconds_remaining=0)

        _fail_login(client, user.username)

        after = _reload(db, user.id)
        assert after.failed_login_attempts == auth_router.FREE_LOGIN_ATTEMPTS + 2
        remaining = (after.locked_until - datetime.now(timezone.utc)).total_seconds()
        # Second rung of the ladder: double the base, not the base again.
        assert auth_router.LOGIN_BACKOFF_BASE_SECONDS < remaining <= auth_router.LOGIN_BACKOFF_BASE_SECONDS * 2

    def test_correct_password_during_the_delay_is_refused_and_told_when_to_retry(
        self, client, db, admin_user
    ):
        """Only a caller who already proved they know the password learns that
        a delay is in force, so this leaks nothing to someone guessing."""
        user, pwd = admin_user
        _arm_backoff(db, user.id, failures=5, seconds_remaining=90)

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})

        assert r.status_code == 429
        assert "Retry-After" in r.headers
        assert 0 < int(r.headers["Retry-After"]) <= 91
        assert "2 minute(s)" in r.json()["detail"]

    def test_wrong_password_during_the_delay_does_not_extend_it(self, client, db, admin_user):
        """Otherwise an attacker could hold someone else's account at the
        maximum delay indefinitely just by keeping on guessing."""
        user, _ = admin_user
        armed = _arm_backoff(db, user.id, failures=5, seconds_remaining=90)
        locked_until_before = armed.locked_until

        r = _fail_login(client, user.username)
        assert r.status_code == 401

        after = _reload(db, user.id)
        assert after.failed_login_attempts == 5
        assert abs((after.locked_until - locked_until_before).total_seconds()) < 1

    def test_login_succeeds_once_the_delay_lapses(self, client, db, admin_user):
        user, pwd = admin_user
        _arm_backoff(db, user.id, failures=5, seconds_remaining=0)

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200

    def test_successful_login_clears_the_counter_and_the_delay(self, client, db, admin_user):
        user, pwd = admin_user
        _arm_backoff(db, user.id, failures=5, seconds_remaining=0)

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200

        after = _reload(db, user.id)
        assert after.failed_login_attempts == 0
        assert after.locked_until is None

    def test_inactive_user_with_wrong_password_is_still_counted(self, client, db, inactive_user):
        """`status` is only checked after the password check, so a disabled
        account still accrues failures."""
        user, _ = inactive_user
        _fail_login(client, user.username, times=2)
        assert _reload(db, user.id).failed_login_attempts == 2


class TestLoginRateCaps:
    """The two request-rate dimensions, distinct from the failure backoff.

    The backoff punishes *failures* and is per account; these cap *attempts*
    and are what stop a flood before it reaches the password hash or the DB.
    """

    def test_attempts_on_one_username_are_capped(self, client, admin_user):
        user, _ = admin_user
        allowed = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])

        _fail_login(client, user.username, times=allowed)
        over = _fail_login(client, user.username)

        assert over.status_code == 429
        assert "Too many login attempts" in over.json()["detail"]

    def test_the_cap_applies_to_a_correct_password_too(self, client, admin_user):
        """Otherwise the cap would be trivially bypassed on the one attempt
        that matters, and would leak which guess was right."""
        user, pwd = admin_user
        allowed = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])
        _fail_login(client, user.username, times=allowed)

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 429

    def test_a_second_username_from_the_same_address_has_its_own_budget(
        self, client, admin_user, pathologist_user
    ):
        """The point of the username dimension: colleagues behind one shared
        egress address must not spend each other's login budget."""
        noisy, _ = admin_user
        quiet, quiet_pwd = pathologist_user
        allowed = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])

        _fail_login(client, noisy.username, times=allowed + 1)

        r = client.post("/auth/login", data={"username": quiet.username, "password": quiet_pwd})
        assert r.status_code == 200

    def test_the_cap_does_not_distinguish_real_from_unknown_usernames(self, client, admin_user):
        user, _ = admin_user
        allowed = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])

        real = _fail_login(client, user.username, times=allowed + 1)
        unknown = _fail_login(client, "no_such_user_xyz", times=allowed + 1)

        assert real.status_code == unknown.status_code == 429
        assert real.json()["detail"] == unknown.json()["detail"]

    def test_changing_the_capitalisation_does_not_buy_more_attempts(self, client, admin_user):
        user, _ = admin_user
        allowed = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])
        _fail_login(client, user.username, times=allowed)

        r = _fail_login(client, user.username.upper())
        assert r.status_code == 429

    def test_the_per_ip_cap_is_looser_than_the_per_username_one(self):
        """A department behind one address has to be able to log in; the per-IP
        number stopped being the per-account defence when the username cap and
        the failure backoff took that over."""
        per_ip = int(auth_router.LOGIN_ATTEMPTS_PER_IP.split("/")[0])
        per_username = int(auth_router.LOGIN_ATTEMPTS_PER_USERNAME.split("/")[0])
        assert per_ip > per_username


class TestLoginDoesNotRevealWhichUsernamesExist:
    """The counterpart of the enumeration oracle the old lockout had.

    Back then a real account answered 429 once locked while an unknown one
    answered 401 forever, so login could be used to confirm which usernames
    existed; the throttle also returned before reaching Argon2, leaking the
    same fact again through response timing. The throttle is now checked after
    the password comparison, so everyone without valid credentials sees one
    identical response.
    """

    def test_unknown_username_never_gets_a_429(self, client):
        for _ in range(auth_router.FREE_LOGIN_ATTEMPTS + 3):
            r = _fail_login(client, "no_such_user_xyz")
            assert r.status_code == 401

    def test_throttled_account_is_indistinguishable_from_an_unknown_one(
        self, client, db, admin_user
    ):
        user, _ = admin_user
        _arm_backoff(db, user.id, failures=5, seconds_remaining=90)

        real = _fail_login(client, user.username)
        unknown = _fail_login(client, "no_such_user_xyz")

        assert real.status_code == unknown.status_code == 401
        assert real.json()["detail"] == unknown.json()["detail"]
        # A Retry-After on one and not the other would give the game away.
        assert "Retry-After" not in real.headers
        assert "Retry-After" not in unknown.headers
