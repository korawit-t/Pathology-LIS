"""Recovering an account whose second factor is gone.

Since the lab chose administrator-verified reset over printed recovery codes,
these two routes are now the *only* way back into an enrolled account. That
makes them load-bearing rather than a convenience.

Two routes, deliberately. The API covers the ordinary case — someone reports a
lost phone and an administrator clears it. The console script covers the case
the API cannot: the last administrator loses theirs, and nobody can sign in to
help. Without that second route the account is unreachable permanently, since
turning MFA off requires signing in and signing in requires the factor.
"""

import time

import pyotp
import pytest
from cryptography.fernet import Fernet

from app.core.mfa_crypto import ENV_VAR, decrypt_secret
from app.crud import user_mfa as mfa_crud
from app.models.audit_log import AuditLog
from app.models.system_setting import SystemSetting
from app.models.user_mfa import UserMfaMethod
from app.models.user_trusted_device import UserTrustedDevice
from scripts.reset_mfa import reset as console_reset


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


def _enrol(client, db, user, pwd, remember=False):
    """Put a confirmed factor on an account; return its TOTP secret."""
    client.post("/auth/login", data={"username": user.username, "password": pwd})
    client.post("/auth/mfa/setup", json={"password": pwd})
    db.rollback()
    secret = decrypt_secret(mfa_crud.get_totp_method(db, user.id).secret_enc)
    confirmed = client.post("/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()})
    assert confirmed.status_code == 200, confirmed.text

    if remember:
        client.post("/auth/logout")
        client.cookies.clear()
        token = client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()["mfa_token"]
        assert client.post(
            "/auth/login/mfa",
            json={
                "mfa_token": token,
                "code": pyotp.TOTP(secret).at(int(time.time()) + 30),
                "remember_device": True,
            },
        ).status_code == 200

    # Clear the replay guard: verify_totp only accepts a step later than the
    # last one used, within one either side of now, so enrolling and signing in
    # consume the steps a later step-up would need inside the same 30 seconds.
    db.rollback()
    method = mfa_crud.get_totp_method(db, user.id, confirmed=True)
    method.last_used_step = None
    db.add(method)
    db.commit()
    return secret


class TestAdminReset:
    def test_an_admin_can_clear_another_user_factor(
        self, client, db, admin_user, pathologist_user, mfa_on
    ):
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd, remember=True)
        client.post("/auth/logout")
        client.cookies.clear()

        admin, admin_pwd = admin_user
        client.post("/auth/login", data={"username": admin.username, "password": admin_pwd})
        # The admin has no factor here, so require_step_up passes straight through.
        r = client.post(f"/users/{victim.id}/mfa/reset")
        assert r.status_code == 204, r.text

        db.rollback()
        refreshed = db.query(type(victim)).filter_by(id=victim.id).one()
        assert refreshed.mfa_enabled is False
        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == victim.id).count() == 0


    def test_reset_also_revokes_trusted_devices(
        self, client, db, admin_user, pathologist_user, mfa_on
    ):
        """A trust record surviving the factor it stood in for would let the
        lost device keep working — the opposite of what was asked for."""
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd, remember=True)
        client.post("/auth/logout")
        client.cookies.clear()

        admin, admin_pwd = admin_user
        client.post("/auth/login", data={"username": admin.username, "password": admin_pwd})
        client.post(f"/users/{victim.id}/mfa/reset")

        db.rollback()
        live = db.query(UserTrustedDevice).filter(
            UserTrustedDevice.user_id == victim.id,
            UserTrustedDevice.revoked_at.is_(None),
        ).count()
        assert live == 0

    def test_the_user_can_log_in_with_a_password_afterwards(
        self, client, db, admin_user, pathologist_user, mfa_on
    ):
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd)
        client.post("/auth/logout")
        client.cookies.clear()

        admin, admin_pwd = admin_user
        client.post("/auth/login", data={"username": admin.username, "password": admin_pwd})
        client.post(f"/users/{victim.id}/mfa/reset")
        client.post("/auth/logout")
        client.cookies.clear()

        r = client.post("/auth/login", data={"username": victim.username, "password": victim_pwd})
        assert r.status_code == 200
        assert "mfa_required" not in r.json()

    def test_the_reset_is_recorded_with_who_did_it(
        self, client, db, admin_user, pathologist_user, mfa_on
    ):
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd)
        client.post("/auth/logout")
        client.cookies.clear()

        admin, admin_pwd = admin_user
        client.post("/auth/login", data={"username": admin.username, "password": admin_pwd})
        client.post(f"/users/{victim.id}/mfa/reset")

        db.rollback()
        row = (
            db.query(AuditLog)
            .filter(AuditLog.action == "MFA_RESET_BY_ADMIN", AuditLog.resource_id == victim.id)
            .one()
        )
        assert row.user_id == admin.id
        assert row.new_values["target_username"] == victim.username

    def test_a_clinician_cannot_reset_anyone(
        self, client, db, clinician_user, pathologist_user, mfa_on
    ):
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd)
        client.post("/auth/logout")
        client.cookies.clear()

        user, pwd = clinician_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert client.post(f"/users/{victim.id}/mfa/reset").status_code == 403

    def test_reset_needs_a_session(self, client, pathologist_user):
        victim, _ = pathologist_user
        assert client.post(f"/users/{victim.id}/mfa/reset").status_code == 401

    def test_unknown_user_is_a_404(self, client, admin_user, mfa_on):
        admin, admin_pwd = admin_user
        client.post("/auth/login", data={"username": admin.username, "password": admin_pwd})
        assert client.post("/users/99999999/mfa/reset").status_code == 404

    def test_an_enrolled_admin_must_step_up_first(
        self, client, db, admin_user, pathologist_user, mfa_on
    ):
        """Clearing someone else's factor is the one routine action that lowers
        another account's protection, so a session left open is not enough."""
        victim, victim_pwd = pathologist_user
        _enrol(client, db, victim, victim_pwd)
        client.post("/auth/logout")
        client.cookies.clear()

        admin, admin_pwd = admin_user
        secret = _enrol(client, db, admin, admin_pwd)

        assert client.post(f"/users/{victim.id}/mfa/reset").status_code == 403

        step_up_code = pyotp.TOTP(secret).at(int(time.time()) + 30)
        assert client.post("/auth/mfa/step-up", json={"code": step_up_code}).status_code == 204
        assert client.post(f"/users/{victim.id}/mfa/reset").status_code == 204


class TestConsoleScript:
    """The route that has to work when nobody can sign in at all."""

    def test_it_clears_everything(self, client, db, admin_user, mfa_on):
        user, pwd = admin_user
        _enrol(client, db, user, pwd, remember=True)

        db.rollback()
        assert console_reset(db, user.username, assume_yes=True) == 0

        db.rollback()
        refreshed = db.query(type(user)).filter_by(id=user.id).one()
        assert refreshed.mfa_enabled is False
        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count() == 0
        assert db.query(UserTrustedDevice).filter(
            UserTrustedDevice.user_id == user.id,
            UserTrustedDevice.revoked_at.is_(None),
        ).count() == 0

    def test_it_leaves_an_audit_trail_with_no_actor(self, client, db, admin_user, mfa_on):
        """Nobody authenticated to run it. A row with a null actor and this
        action is precisely the signal that someone went in through the
        console, which an audit reviewer should be able to notice."""
        user, pwd = admin_user
        _enrol(client, db, user, pwd)

        db.rollback()
        console_reset(db, user.username, assume_yes=True)

        db.rollback()
        row = (
            db.query(AuditLog)
            .filter(AuditLog.action == "MFA_RESET_VIA_CONSOLE", AuditLog.resource_id == user.id)
            .one()
        )
        assert row.user_id is None
        assert row.new_values["target_username"] == user.username

    def test_an_unknown_username_fails_without_changing_anything(self, db):
        assert console_reset(db, "no_such_person_xyz", assume_yes=True) == 1

    def test_an_account_with_no_factor_is_a_no_op(self, db, pathologist_user):
        user, _pwd = pathologist_user
        assert console_reset(db, user.username, assume_yes=True) == 0

    def test_the_account_can_sign_in_afterwards(self, client, db, admin_user, mfa_on):
        user, pwd = admin_user
        _enrol(client, db, user, pwd)
        client.post("/auth/logout")
        client.cookies.clear()

        db.rollback()
        console_reset(db, user.username, assume_yes=True)

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        assert "mfa_required" not in r.json()
