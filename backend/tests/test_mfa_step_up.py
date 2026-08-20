"""Step-up re-authentication in front of irreversible actions.

This is the other half of trusted devices. Not asking for a code at every login
is only defensible while the actions that cannot be taken back still ask, so
the tests here are chiefly about two things: that the guard actually bites for
users with MFA, and that it is completely invisible to installations that have
never switched MFA on.
"""

import time

import pyotp
import pytest
from cryptography.fernet import Fernet

from app.core.mfa_crypto import ENV_VAR, decrypt_secret
from app.crud import user_mfa as mfa_crud
from app.dependencies.step_up import COOKIE_NAME, STEP_UP_REQUIRED_DETAIL
from app.models.system_setting import SystemSetting

SETTINGS_URL = "/system-settings/update"


@pytest.fixture(autouse=True)
def mfa_key(monkeypatch):
    monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())


@pytest.fixture
def mfa_on(db):
    row = db.query(SystemSetting).first()
    if not row:
    # Slug "master" on purpose. The MFA code reads settings with
    # db.query(SystemSetting).first(), while /system-settings/update looks the
    # row up by slug and creates a "master" row when it finds none — so a
    # fixture row under any other slug leaves two rows behind and .first()
    # starts returning whichever one it likes.
        row = SystemSetting(hospital_slug="master")
        db.add(row)
    row.mfa_enabled = True
    db.commit()
    return row


@pytest.fixture
def enrolled_admin(client, db, admin_user, mfa_on):
    """An admin with a confirmed factor, signed in on a trusted browser."""
    user, pwd = admin_user
    client.post("/auth/login", data={"username": user.username, "password": pwd})
    client.post("/auth/mfa/setup", json={"password": pwd})
    db.rollback()
    secret = decrypt_secret(mfa_crud.get_totp_method(db, user.id).secret_enc)
    assert client.post(
        "/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()}
    ).status_code == 200
    client.post("/auth/logout")
    client.cookies.clear()

    token = client.post(
        "/auth/login", data={"username": user.username, "password": pwd}
    ).json()["mfa_token"]
    r = client.post(
        "/auth/login/mfa",
        json={"mfa_token": token, "code": _code(secret), "remember_device": True},
    )
    assert r.status_code == 200, r.text

    # Clear the replay guard so the step-up in each test has a usable code.
    # verify_totp only accepts a step strictly later than the last one used,
    # within one either side of now, so logging in consumes the only step a
    # step-up could otherwise use in the same 30 seconds. Real users just read
    # the next code off the app; a test cannot wait for the clock.
    _clear_totp_replay_guard(db, user.id)
    return user, pwd, secret


def _code(secret, skew=30):
    return pyotp.TOTP(secret).at(int(time.time()) + skew)


def _clear_totp_replay_guard(db, user_id):
    db.rollback()
    method = mfa_crud.get_totp_method(db, user_id, confirmed=True)
    method.last_used_step = None
    db.add(method)
    db.commit()


class TestGuardBites:
    def test_settings_update_is_refused_without_a_step_up(self, client, enrolled_admin):
        r = client.patch(SETTINGS_URL, json={"lab_name_en": "Renamed Lab"})
        assert r.status_code == 403
        assert r.json()["detail"] == STEP_UP_REQUIRED_DETAIL

    def test_a_valid_code_unlocks_the_action(self, client, enrolled_admin):
        _user, _pwd, secret = enrolled_admin

        assert client.post("/auth/mfa/step-up", json={"code": _code(secret)}).status_code == 204
        assert client.cookies.get(COOKIE_NAME)

        r = client.patch(SETTINGS_URL, json={"lab_name_en": "Renamed Lab"})
        assert r.status_code == 200

    def test_the_password_also_works_as_a_step_up(self, client, enrolled_admin):
        """The same prompt has to serve users who have no second factor, and it
        is now the only answer available to someone whose phone is broken until
        an administrator resets them."""
        _user, pwd, _secret = enrolled_admin

        assert client.post("/auth/mfa/step-up", json={"code": pwd}).status_code == 204
        assert client.patch(SETTINGS_URL, json={"lab_name_en": "Renamed"}).status_code == 200

    def test_a_wrong_answer_is_refused(self, client, enrolled_admin):
        r = client.post("/auth/mfa/step-up", json={"code": "000000"})
        assert r.status_code == 401
        assert client.cookies.get(COOKIE_NAME) in (None, "")

    def test_trusting_the_browser_does_not_exempt_the_action(self, client, enrolled_admin):
        """The whole point: the login skipped the code because the device is
        trusted, and the irreversible action must still ask."""
        _user, _pwd, _secret = enrolled_admin
        client.cookies.delete("access_token")
        client.cookies.delete("refresh_token")

        user, pwd, _s = enrolled_admin
        again = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert "mfa_required" not in again.json()  # trusted device, no code asked

        r = client.patch(SETTINGS_URL, json={"lab_name_en": "Renamed"})
        assert r.status_code == 403


class TestGrantIsNarrow:
    def test_a_grant_does_not_cross_sessions(self, client, enrolled_admin):
        """Bound to the access token that asked for it. Otherwise a step-up in
        one browser would authorise an irreversible action from another —
        precisely what a stolen session looks like."""
        _user, _pwd, secret = enrolled_admin
        client.post("/auth/mfa/step-up", json={"code": _code(secret)})
        grant = client.cookies.get(COOKIE_NAME)

        user, pwd, _s = enrolled_admin
        # Drop only the session cookies: keeping the trusted-device one is what
        # lets the second login complete without another code, which is the
        # situation being tested.
        client.cookies.delete("access_token")
        client.cookies.delete("refresh_token")
        client.cookies.delete(COOKIE_NAME)
        assert "mfa_required" not in client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()
        client.cookies.set(COOKIE_NAME, grant)

        assert client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).status_code == 403

    def test_a_forged_grant_is_refused(self, client, enrolled_admin):
        client.cookies.set(COOKIE_NAME, "not.a.jwt")
        assert client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).status_code == 403

    def test_an_access_token_is_not_accepted_as_a_grant(self, client, enrolled_admin):
        client.cookies.set(COOKIE_NAME, client.cookies.get("access_token"))
        assert client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).status_code == 403

    def test_step_up_needs_a_session(self, client):
        assert client.post("/auth/mfa/step-up", json={"code": "123456"}).status_code == 401


class TestInvisibleWithoutMfa:
    """This has to reach installations that never switched MFA on without
    changing how their staff sign out reports."""

    def test_settings_update_is_untouched_when_mfa_is_off(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        r = client.patch(SETTINGS_URL, json={"lab_name_en": "No MFA Here"})
        assert r.status_code == 200

    def test_a_user_without_a_factor_is_unaffected(self, client, db, admin_user, mfa_on):
        """Master switch on, but this user has enrolled nothing."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        assert client.patch(SETTINGS_URL, json={"lab_name_en": "Still Fine"}).status_code == 200

    def test_turning_the_master_switch_off_releases_the_guard(self, client, db, enrolled_admin):
        assert client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).status_code == 403

        db.rollback()
        row = db.query(SystemSetting).first()
        row.mfa_enabled = False
        db.commit()

        assert client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).status_code == 200


class TestEveryGuardedEndpoint:
    """The guard is applied to four endpoints. Testing one proves one.

    Report sign-out is the reason step-up exists at all — settings was the
    additional case, not the motivating one. Dropping the dependency from a
    publish route would be a silent removal of the protection that makes
    trusted devices defensible, and nothing else would notice.

    These call with an id that does not exist on purpose: FastAPI resolves
    dependencies before the handler runs, so a 403 here proves the guard is
    wired without needing a whole case fixture. A route with the guard removed
    would return 404 instead, which is exactly the signal wanted.
    """

    GUARDED = [
        ("post", "/surgical-reports/999999/finalize-snapshot"),
        ("post", "/gyne-cyto-reports/999999/publish"),
        ("post", "/nongyne-cyto-reports/999999/publish"),
        ("patch", SETTINGS_URL),
    ]

    @pytest.mark.parametrize("method,url", GUARDED)
    def test_it_refuses_without_a_step_up(self, client, enrolled_admin, method, url):
        r = getattr(client, method)(url, json={})
        assert r.status_code == 403, f"{url} is not behind the step-up guard"
        assert r.json()["detail"] == STEP_UP_REQUIRED_DETAIL

    @pytest.mark.parametrize("method,url", GUARDED)
    def test_it_gets_past_the_guard_after_a_step_up(self, client, enrolled_admin, method, url):
        """Past the guard, not necessarily to a 200 — a nonexistent case is
        still a 404. What matters is that it is no longer the step-up refusal."""
        _user, pwd, _secret = enrolled_admin
        assert client.post("/auth/mfa/step-up", json={"code": pwd}).status_code == 204

        r = getattr(client, method)(url, json={})
        assert r.json().get("detail") != STEP_UP_REQUIRED_DETAIL

    @pytest.mark.parametrize("method,url", GUARDED)
    def test_it_is_untouched_for_a_user_without_mfa(self, client, db, admin_user, method, url):
        """Installations that never switched MFA on must sign out reports
        exactly as they did before."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        r = getattr(client, method)(url, json={})
        assert r.status_code != 403 or r.json().get("detail") != STEP_UP_REQUIRED_DETAIL


class TestChallengeExpiry:
    def test_an_expired_challenge_is_refused(self, client, db, admin_user, mfa_on, monkeypatch):
        """Five minutes is long enough to fetch a phone; one left open on a
        screen overnight should be worth nothing."""
        import time as _time

        import pyotp as _pyotp
        from app.core import security

        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        client.post("/auth/mfa/setup", json={"password": pwd})
        db.rollback()
        secret = decrypt_secret(mfa_crud.get_totp_method(db, user.id).secret_enc)
        assert client.post(
            "/auth/mfa/confirm", json={"code": _pyotp.TOTP(secret).now()}
        ).status_code == 200
        client.post("/auth/logout")
        client.cookies.clear()

        # Issue a challenge that was already stale when it was minted.
        monkeypatch.setattr(security, "MFA_CHALLENGE_EXPIRE_MINUTES", -1)
        token = client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()["mfa_token"]
        monkeypatch.undo()

        r = client.post(
            "/auth/login/mfa",
            json={"mfa_token": token, "code": _pyotp.TOTP(secret).at(int(_time.time()) + 30)},
        )
        assert r.status_code == 401
        assert client.cookies.get("access_token") in (None, "")
