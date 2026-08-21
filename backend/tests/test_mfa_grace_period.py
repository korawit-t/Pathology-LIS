"""Enforcing the enrolment deadline.

Naming a role in `mfa_required_roles` used to do one thing: stop somebody who
had already enrolled from turning their factor off. The people who had not
enrolled — the ones with no protection at all — were never pushed. That is the
wrong way round, and this closes it.

The grace period counts from `mfa_required_since`, stamped when a policy first
names a role. Counting from anything else either punishes people who were
already here or hands a fresh deadline to anyone who stays away long enough.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.crud import user_mfa as mfa_crud
from app.dependencies.step_up import MFA_SETUP_REQUIRED_DETAIL
from app.models.system_setting import SystemSetting

SETTINGS_URL = "/system-settings/update"


@pytest.fixture
def settings(db):
    row = db.query(SystemSetting).first()
    if not row:
        row = SystemSetting(hospital_slug="master")
        db.add(row)
        db.commit()
    before = {
        f: getattr(row, f)
        for f in ("mfa_enabled", "mfa_required_roles", "mfa_grace_period_days", "mfa_required_since")
    }
    row.mfa_enabled = True
    row.mfa_required_roles = ["admin"]
    row.mfa_grace_period_days = 7
    row.mfa_required_since = datetime.now(timezone.utc)
    db.commit()
    yield row

    db.rollback()
    restored = db.query(SystemSetting).first()
    for field, value in before.items():
        setattr(restored, field, value)
    db.commit()


def _set_anchor(db, when):
    row = db.query(SystemSetting).first()
    row.mfa_required_since = when
    db.commit()


class TestTheAnchorIsStampedAutomatically:
    def test_naming_a_role_starts_the_clock(self, admin_client, db):
        db.rollback()
        row = db.query(SystemSetting).first()
        if not row:
            row = SystemSetting(hospital_slug="master")
            db.add(row)
        row.mfa_required_roles = []
        row.mfa_required_since = None
        db.commit()

        assert admin_client.patch(
            SETTINGS_URL, json={"mfa_required_roles": ["pathologist"]}
        ).status_code == 200

        db.rollback()
        assert db.query(SystemSetting).first().mfa_required_since is not None

    def test_the_clock_is_not_restarted_by_a_later_save(self, admin_client, db, settings):
        """Otherwise every settings save would quietly buy another week."""
        db.rollback()
        original = db.query(SystemSetting).first().mfa_required_since

        admin_client.patch(SETTINGS_URL, json={"mfa_required_roles": ["admin", "pathologist"]})

        db.rollback()
        assert db.query(SystemSetting).first().mfa_required_since == original

    def test_clearing_the_roles_clears_the_clock(self, admin_client, db, settings):
        """It should not keep running for whenever somebody switches it back on."""
        assert admin_client.patch(
            SETTINGS_URL, json={"mfa_required_roles": []}
        ).status_code == 200

        db.rollback()
        assert db.query(SystemSetting).first().mfa_required_since is None


class TestStatus:
    def test_a_user_outside_the_named_roles_owes_nothing(self, db, pathologist_user, settings):
        user, _ = pathologist_user
        status = mfa_crud.enrolment_status(db, user)
        assert status.required is False
        assert status.overdue is False

    def test_a_named_role_inside_the_grace_period_is_warned_not_blocked(
        self, db, admin_user, settings
    ):
        user, _ = admin_user
        status = mfa_crud.enrolment_status(db, user)
        assert status.required is True
        assert status.overdue is False
        assert status.days_left == 7

    def test_it_becomes_overdue_once_the_deadline_passes(self, db, admin_user, settings):
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=8))
        user, _ = admin_user

        status = mfa_crud.enrolment_status(db, user)
        assert status.overdue is True
        assert status.days_left == 0

    def test_a_zero_day_grace_is_immediate(self, db, admin_user, settings):
        db.rollback()
        row = db.query(SystemSetting).first()
        row.mfa_grace_period_days = 0
        db.commit()
        user, _ = admin_user

        assert mfa_crud.enrolment_status(db, user).overdue is True

    def test_an_enrolled_user_is_never_overdue(self, db, admin_user, settings):
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=99))
        user, _ = admin_user
        db.rollback()
        fresh = db.query(type(user)).filter_by(id=user.id).one()
        fresh.mfa_enabled = True
        db.commit()

        assert mfa_crud.enrolment_status(db, fresh).overdue is False

    def test_a_missing_anchor_warns_rather_than_blocks(self, db, admin_user, settings):
        """Locking people out on the strength of a missing timestamp would be
        the worst possible reading of an ambiguous state."""
        _set_anchor(db, None)
        user, _ = admin_user

        status = mfa_crud.enrolment_status(db, user)
        assert status.required is True
        assert status.overdue is False

    def test_the_master_switch_releases_everyone(self, db, admin_user, settings):
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=30))
        db.rollback()
        row = db.query(SystemSetting).first()
        row.mfa_enabled = False
        db.commit()
        user, _ = admin_user

        assert mfa_crud.enrolment_status(db, user).overdue is False


class TestLoginTellsTheUser:
    def test_the_countdown_reaches_the_client(self, client, db, admin_user, settings):
        """A deadline that arrives without notice reads as a fault, not a policy."""
        user, pwd = admin_user
        body = client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()

        assert body["mfa_setup_required"] is False
        assert body["mfa_setup_due_in_days"] == 7

    def test_an_overdue_login_is_flagged(self, client, db, admin_user, settings):
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=8))
        user, pwd = admin_user

        body = client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()
        assert body["mfa_setup_required"] is True

    def test_login_still_succeeds_when_overdue(self, client, db, admin_user, settings):
        """The gate is enrolment, not the door. Someone locked out entirely
        could not reach the setup page to comply."""
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=8))
        user, pwd = admin_user

        r = client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert r.status_code == 200
        assert client.cookies.get("access_token")

    def test_an_unaffected_user_sees_no_countdown(self, client, db, pathologist_user, settings):
        user, pwd = pathologist_user
        body = client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).json()

        assert body["mfa_setup_required"] is False
        assert body["mfa_setup_due_in_days"] is None


class TestIrreversibleActionsAreClosed:
    """What stops the deadline being purely a frontend redirect."""

    def test_an_overdue_user_cannot_sign_out_a_report(self, client, db, admin_user, settings):
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=8))
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        r = client.post("/surgical-reports/999999/finalize-snapshot", json={})
        assert r.status_code == 403
        assert r.json()["detail"] == MFA_SETUP_REQUIRED_DETAIL

    def test_it_uses_a_different_code_from_the_step_up_prompt(
        self, client, db, admin_user, settings
    ):
        """"Confirm it is you" and "you have not set one up yet" need different
        things from the user; one code would send the frontend to the wrong
        prompt."""
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=8))
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        detail = client.patch(SETTINGS_URL, json={"lab_name_en": "X"}).json()["detail"]
        assert detail == MFA_SETUP_REQUIRED_DETAIL
        assert detail != "step_up_required"

    def test_inside_the_grace_period_nothing_is_blocked(self, client, db, admin_user, settings):
        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})

        r = client.patch(SETTINGS_URL, json={"lab_name_en": "Still Allowed"})
        assert r.status_code == 200

    def test_a_user_outside_the_policy_is_untouched(self, client, db, admin_user, settings):
        """Master switch on, deadline long past — but this user's role was never
        named, so none of it applies to them."""
        _set_anchor(db, datetime.now(timezone.utc) - timedelta(days=30))
        db.rollback()
        row = db.query(SystemSetting).first()
        row.mfa_required_roles = ["senior_pathologist"]
        db.commit()

        user, pwd = admin_user
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert client.patch(SETTINGS_URL, json={"lab_name_en": "Fine"}).status_code == 200
