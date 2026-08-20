"""Integration tests for MFA self-service enrolment.

Login is untouched by this work — a confirmed factor sits on the account unused
until the two-step login lands — so what these cover is getting a factor on and
off an account safely: that a session alone is not enough to enrol, that a code
cannot be replayed, and that policy can stop someone turning their own
factor off.
"""

import pyotp
import pytest
from cryptography.fernet import Fernet

from app.core.mfa_crypto import ENV_VAR, decrypt_secret
from app.crud import user_mfa as crud
from app.models.system_setting import SystemSetting
from app.models.user_mfa import UserMfaMethod


@pytest.fixture(autouse=True)
def mfa_key(monkeypatch):
    monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())


def _setup(client, password):
    return client.post("/auth/mfa/setup", json={"password": password})


def _code_for(db, user_id):
    method = crud.get_totp_method(db, user_id)
    return pyotp.TOTP(decrypt_secret(method.secret_enc)).now()


def _enrol(client, db, user, password):
    """Take an account all the way through enrolment."""
    assert _setup(client, password).status_code == 200
    db.rollback()
    r = client.post("/auth/mfa/confirm", json={"code": _code_for(db, user.id)})
    assert r.status_code == 200, r.text


class TestSetup:
    def test_setup_returns_a_provisioning_uri_and_secret(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        r = _setup(client, pwd)
        assert r.status_code == 200
        body = r.json()
        assert body["provisioning_uri"].startswith("otpauth://totp/")
        assert body["secret"] in body["provisioning_uri"]
        assert body["account_name"] == user.username

    def test_setup_requires_the_current_password(self, client, admin_user):
        """A valid session is not enough. If it were, a stolen session could
        enrol its own authenticator and lock the real owner out — the exact
        situation MFA is supposed to survive."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        assert _setup(client, "not-the-password").status_code == 401

    def test_setup_is_rejected_without_a_session(self, client):
        assert _setup(client, "anything").status_code == 401

    def test_the_stored_secret_is_encrypted(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        secret = _setup(client, pwd).json()["secret"]

        db.rollback()
        row = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).one()
        assert row.secret_enc != secret
        assert secret not in row.secret_enc
        assert decrypt_secret(row.secret_enc) == secret

    def test_nothing_is_enabled_until_confirmation(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _setup(client, pwd)

        db.rollback()
        row = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).one()
        assert row.confirmed_at is None
        assert client.get("/auth/mfa/status").json()["enabled"] is False

    def test_restarting_setup_replaces_the_pending_secret(self, client, db, admin_user):
        """Someone restarting has usually scanned a code that did not work;
        handing back the same secret would preserve whatever went wrong."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        first = _setup(client, pwd).json()["secret"]
        second = _setup(client, pwd).json()["secret"]
        assert first != second

        db.rollback()
        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count() == 1

    def test_setup_is_refused_when_already_enrolled(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        assert _setup(client, pwd).status_code == 409


class TestConfirm:
    def test_a_valid_code_enables_mfa(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        db.rollback()
        refreshed = db.query(type(user)).filter_by(id=user.id).one()
        assert refreshed.mfa_enabled is True

    def test_a_wrong_code_is_rejected_and_changes_nothing(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _setup(client, pwd)

        r = client.post("/auth/mfa/confirm", json={"code": "000000"})
        assert r.status_code == 400

        db.rollback()
        row = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).one()
        assert row.confirmed_at is None

    def test_confirm_without_a_pending_setup_is_refused(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        assert client.post("/auth/mfa/confirm", json={"code": "123456"}).status_code == 409

    def test_a_code_cannot_be_replayed(self, client, db, admin_user):
        """The same code stays valid for thirty seconds. Burning its time step
        stops a shoulder-surfed or captured code being used a second time."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _setup(client, pwd)
        db.rollback()

        code = _code_for(db, user.id)
        assert client.post("/auth/mfa/confirm", json={"code": code}).status_code == 200

        # Same code, fresh enrolment: it must not be accepted again.
        db.rollback()
        method = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).one()
        assert method.last_used_step is not None
        assert crud.verify_totp(db, method, code) is False


class TestDisable:
    def test_disabling_removes_everything(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        assert client.post("/auth/mfa/disable", json={"password": pwd}).status_code == 204

        db.rollback()
        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count() == 0
        assert db.query(type(user)).filter_by(id=user.id).one().mfa_enabled is False

    def test_disabling_requires_the_password(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        assert client.post("/auth/mfa/disable", json={"password": "wrong"}).status_code == 401

    def test_a_compelled_role_cannot_turn_it_off(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        db.rollback()
        settings = db.query(SystemSetting).first()
        if not settings:
            settings = SystemSetting(hospital_slug="master")
            db.add(settings)
        settings.mfa_enabled = True
        settings.mfa_required_roles = ["admin"]
        db.commit()

        r = client.post("/auth/mfa/disable", json={"password": pwd})
        assert r.status_code == 403
        assert "required for your role" in r.json()["detail"]

    def test_the_master_switch_releases_a_compelled_role(self, client, db, admin_user):
        """Turning MFA off installation-wide has to release everyone it was
        compelling, or the switch would not really be an off switch."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        db.rollback()
        settings = db.query(SystemSetting).first()
        if not settings:
            settings = SystemSetting(hospital_slug="master")
            db.add(settings)
        settings.mfa_enabled = False
        settings.mfa_required_roles = ["admin"]
        db.commit()

        assert client.post("/auth/mfa/disable", json={"password": pwd}).status_code == 204


class TestStatus:
    def test_status_reports_an_unenrolled_account(self, client, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        body = client.get("/auth/mfa/status").json()
        assert body["enabled"] is False
        assert body["pending_setup"] is False
        assert body["methods"] == []

    def test_status_reports_an_enrolled_account(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        _enrol(client, db, user, pwd)

        body = client.get("/auth/mfa/status").json()
        assert body["enabled"] is True
        assert len(body["methods"]) == 1
        assert body["methods"][0]["method_type"] == "totp"

    def test_status_never_returns_secret_material(self, client, db, admin_user):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        secret = _setup(client, pwd).json()["secret"]

        raw = client.get("/auth/mfa/status").text
        assert secret not in raw
        assert "secret" not in raw

    def test_status_needs_a_session(self, client):
        assert client.get("/auth/mfa/status").status_code == 401


class TestMissingEncryptionKey:
    def test_setup_fails_clearly_when_the_key_is_absent(self, client, admin_user, monkeypatch):
        """An install that never set MFA_ENCRYPTION_KEY should say so, not
        raise a stack trace after the user has already scanned a code."""
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        monkeypatch.delenv(ENV_VAR, raising=False)

        r = _setup(client, pwd)
        assert r.status_code == 503
        assert "MFA_ENCRYPTION_KEY" in r.json()["detail"]
