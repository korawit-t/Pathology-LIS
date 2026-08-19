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
        row = SystemSetting(hospital_slug="step-up-test")
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
    confirmed = client.post("/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()})
    assert confirmed.status_code == 200
    codes = confirmed.json()["backup_codes"]
    client.post("/auth/logout")
    client.cookies.clear()

    # Sign in with a backup code rather than a TOTP code on purpose. Confirming
    # enrolment already burned the current time step, and verify_totp only
    # accepts a step strictly later than the last one used, within a window of
    # one either side — so a TOTP login here would leave no step available for
    # the step-up that follows within the same 30 seconds.
    token = client.post(
        "/auth/login", data={"username": user.username, "password": pwd}
    ).json()["mfa_token"]
    r = client.post(
        "/auth/login/mfa",
        json={"mfa_token": token, "code": codes[0], "remember_device": True},
    )
    assert r.status_code == 200, r.text
    return user, pwd, secret


def _code(secret, skew=30):
    return pyotp.TOTP(secret).at(int(time.time()) + skew)


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
        """The same prompt has to serve users who have no second factor, so it
        accepts the password too rather than needing a separate flow."""
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
