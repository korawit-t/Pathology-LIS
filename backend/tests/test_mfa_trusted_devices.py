"""Trusted devices — skipping the second factor on a known browser.

The feature exists because a 10-minute idle timeout plus a code on every login
drives workarounds rather than security. So the tests are mostly about the
limits of the shortcut: it must never stand in for the password, never cross
between accounts, and stop working the moment it is revoked.
"""

import time
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from cryptography.fernet import Fernet

from app.core.mfa_crypto import ENV_VAR, decrypt_secret
from app.crud import user_mfa as mfa_crud
from app.crud import user_trusted_device as device_crud
from app.models.system_setting import SystemSetting
from app.models.user_trusted_device import UserTrustedDevice

COOKIE = device_crud.COOKIE_NAME


@pytest.fixture(autouse=True)
def mfa_key(monkeypatch):
    monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())


@pytest.fixture
def settings(db):
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
    row.mfa_trusted_device_days = 14
    db.commit()
    return row


@pytest.fixture
def enrolled(client, db, admin_user, settings):
    user, pwd = admin_user
    client.post("/auth/login", data={"username": user.username, "password": pwd})
    client.post("/auth/mfa/setup", json={"password": pwd})
    db.rollback()
    secret = decrypt_secret(mfa_crud.get_totp_method(db, user.id).secret_enc)
    assert client.post("/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()}).status_code == 200
    client.post("/auth/logout")
    client.cookies.clear()
    return user, pwd, secret


def _code(secret, skew=30):
    return pyotp.TOTP(secret).at(int(time.time()) + skew)


def _login(client, user, pwd):
    return client.post("/auth/login", data={"username": user.username, "password": pwd})


def _login_with_factor(client, user, pwd, secret, remember=False, skew=30):
    token = _login(client, user, pwd).json()["mfa_token"]
    return client.post(
        "/auth/login/mfa",
        json={"mfa_token": token, "code": _code(secret, skew), "remember_device": remember},
    )


class TestRemembering:
    def test_the_second_step_can_trust_the_browser(self, client, enrolled):
        user, pwd, secret = enrolled
        r = _login_with_factor(client, user, pwd, secret, remember=True)

        assert r.status_code == 200
        assert r.json()["device_remembered"] is True
        assert client.cookies.get(COOKIE)

    def test_trust_is_opt_in(self, client, enrolled):
        user, pwd, secret = enrolled
        r = _login_with_factor(client, user, pwd, secret, remember=False)

        assert r.json()["device_remembered"] is False
        assert client.cookies.get(COOKIE) in (None, "")

    def test_a_trusted_browser_skips_the_code(self, client, enrolled):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        client.cookies.delete("access_token")
        client.cookies.delete("refresh_token")

        r = _login(client, user, pwd)
        assert r.status_code == 200
        assert "mfa_required" not in r.json()
        assert r.json()["user"]["username"] == user.username
        assert client.cookies.get("access_token")

    def test_the_cookie_is_stored_only_as_a_hash(self, client, db, enrolled):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        raw = client.cookies.get(COOKIE)

        db.rollback()
        row = db.query(UserTrustedDevice).filter(UserTrustedDevice.user_id == user.id).one()
        assert row.token_hash != raw
        assert raw not in row.token_hash
        assert row.token_hash == device_crud.hash_token(raw)

    def test_the_device_gets_a_recognisable_label(self, client, db, enrolled):
        user, pwd, secret = enrolled
        token = _login(client, user, pwd).json()["mfa_token"]
        client.post(
            "/auth/login/mfa",
            json={"mfa_token": token, "code": _code(secret), "remember_device": True},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36"},
        )

        db.rollback()
        row = db.query(UserTrustedDevice).filter(UserTrustedDevice.user_id == user.id).one()
        assert row.label == "Chrome on Windows"


class TestLimitsOfTheShortcut:
    def test_it_never_replaces_the_password(self, client, enrolled):
        """The cookie skips the code, not the login."""
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        client.cookies.delete("access_token")

        r = client.post("/auth/login", data={"username": user.username, "password": "wrong"})
        assert r.status_code == 401

    def test_a_cookie_from_another_account_is_ignored(self, client, db, enrolled, pathologist_user):
        """Without the user check, a cookie issued to one account would satisfy
        the second factor for whichever account the password matched."""
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        stolen = client.cookies.get(COOKIE)
        client.cookies.clear()

        other, other_pwd = pathologist_user
        db.rollback()
        other_fresh = db.query(type(other)).filter_by(id=other.id).one()
        other_fresh.mfa_enabled = True
        db.commit()

        client.cookies.set(COOKIE, stolen)
        r = client.post("/auth/login", data={"username": other.username, "password": other_pwd})
        assert r.json().get("mfa_required") is True

    def test_a_forged_cookie_is_ignored(self, client, enrolled):
        user, pwd, _s = enrolled
        client.cookies.set(COOKIE, "not-a-real-token")

        assert _login(client, user, pwd).json().get("mfa_required") is True

    def test_an_expired_trust_stops_working(self, client, db, enrolled):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        cookie = client.cookies.get(COOKIE)
        client.cookies.clear()

        db.rollback()
        row = db.query(UserTrustedDevice).filter(UserTrustedDevice.user_id == user.id).one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

        client.cookies.set(COOKIE, cookie)
        assert _login(client, user, pwd).json().get("mfa_required") is True


class TestRevocation:
    def test_revoking_takes_effect_on_the_next_login(self, client, enrolled):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        cookie = client.cookies.get(COOKIE)

        devices = client.get("/auth/mfa/devices").json()
        assert len(devices) == 1
        assert client.delete(f"/auth/mfa/devices/{devices[0]['id']}").status_code == 204

        client.cookies.clear()
        client.cookies.set(COOKIE, cookie)
        assert _login(client, user, pwd).json().get("mfa_required") is True

    def test_revoke_all_clears_every_device(self, client, enrolled):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)

        assert client.delete("/auth/mfa/devices").status_code == 204
        assert client.get("/auth/mfa/devices").json() == []

    def test_a_device_belonging_to_someone_else_cannot_be_revoked(
        self, client, db, enrolled, pathologist_user
    ):
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)
        victim_device = client.get("/auth/mfa/devices").json()[0]["id"]
        client.cookies.clear()

        other, other_pwd = pathologist_user
        client.post("/auth/login", data={"username": other.username, "password": other_pwd})
        assert client.delete(f"/auth/mfa/devices/{victim_device}").status_code == 404

    def test_disabling_mfa_revokes_every_trusted_device(self, client, db, enrolled):
        """A trust record outliving the factor it stood in for is a bypass
        nobody is watching any more."""
        user, pwd, secret = enrolled
        _login_with_factor(client, user, pwd, secret, remember=True)

        assert client.post("/auth/mfa/disable", json={"password": pwd}).status_code == 204

        db.rollback()
        live = db.query(UserTrustedDevice).filter(
            UserTrustedDevice.user_id == user.id,
            UserTrustedDevice.revoked_at.is_(None),
        ).count()
        assert live == 0


class TestSwitchedOff:
    def test_zero_days_disables_trusting_entirely(self, client, db, enrolled, settings):
        """A site that wants a code on every single login can have one."""
        user, pwd, secret = enrolled
        db.rollback()
        row = db.query(SystemSetting).first()
        row.mfa_trusted_device_days = 0
        db.commit()

        r = _login_with_factor(client, user, pwd, secret, remember=True)
        assert r.status_code == 200
        assert r.json()["device_remembered"] is False
        assert client.cookies.get(COOKIE) in (None, "")


class TestUserAgentLabels:
    @pytest.mark.parametrize(
        "ua,expected",
        [
            ("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36", "Chrome on Windows"),
            ("Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0", "Firefox on macOS"),
            ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari/605.1", "Safari on iOS"),
            ("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Edg/120.0", "Edge on Windows"),
            ("", "Unknown device"),
            (None, "Unknown device"),
        ],
    )
    def test_labels_are_recognisable(self, ua, expected):
        assert device_crud.describe_user_agent(ua) == expected
