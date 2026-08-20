"""What the settings endpoints may and may not disclose.

The MFA policy fields are readable by anyone signed in and by nobody else. That
distinction is easy to lose, because /system-settings/public and the
authenticated read used to share one response model — and that endpoint needs no
login at all. Which roles are exempt from MFA, and how long a browser stays
trusted, are useful to someone probing the login page and useless to the login
page itself.
"""

import pytest

from app.models.system_setting import SystemSetting

MFA_FIELDS = [
    "mfa_enabled",
    "mfa_required_roles",
    "mfa_grace_period_days",
    "mfa_allowed_methods",
    "mfa_trusted_device_days",
]


@pytest.fixture
def configured(db):
    """Set a policy, then put it back.

    There is one settings row and the test database keeps committed data for the
    whole run, so anything left behind here becomes the starting state of every
    later test. Leaving mfa_required_roles set is particularly nasty: unrelated
    tests that disable MFA start failing with a 403, and the cause is nowhere
    near the failure.
    """
    row = db.query(SystemSetting).first()
    if not row:
        row = SystemSetting(hospital_slug="master")
        db.add(row)
        db.commit()

    before = {field: getattr(row, field) for field in MFA_FIELDS}

    row.mfa_enabled = True
    row.mfa_required_roles = ["admin", "senior_pathologist"]
    row.mfa_grace_period_days = 7
    row.mfa_trusted_device_days = 14
    db.commit()

    yield row

    db.rollback()
    restored = db.query(SystemSetting).first()
    for field, value in before.items():
        setattr(restored, field, value)
    db.commit()


class TestPublicEndpoint:
    def test_the_public_settings_carry_no_mfa_policy(self, client, configured):
        r = client.get("/system-settings/public")
        assert r.status_code == 200
        body = r.json()
        for field in MFA_FIELDS:
            assert field not in body, f"{field} leaked to the unauthenticated endpoint"

    def test_the_public_settings_do_not_name_exempt_roles(self, client, configured):
        """The sharpest version of the same point: a login screen has no use for
        the list, and an attacker choosing which account to go after does."""
        raw = client.get("/system-settings/public").text
        assert "senior_pathologist" not in raw

    def test_branding_still_comes_through(self, client, configured):
        """The endpoint still has a job to do."""
        body = client.get("/system-settings/public").json()
        assert "lab_name_en" in body
        assert "login_announcement" in body


class TestAuthenticatedEndpoint:
    def test_a_signed_in_user_sees_the_policy(self, admin_client, configured):
        body = admin_client.get("/system-settings/1").json()
        for field in MFA_FIELDS:
            assert field in body, f"{field} missing from the authenticated read"
        assert body["mfa_enabled"] is True
        assert body["mfa_required_roles"] == ["admin", "senior_pathologist"]

    def test_it_still_needs_a_session(self, client, configured):
        assert client.get("/system-settings/1").status_code == 401


class TestUpdating:
    def test_the_policy_can_be_saved(self, admin_client, db, configured):
        r = admin_client.patch(
            "/system-settings/update",
            json={
                "mfa_enabled": True,
                "mfa_required_roles": ["admin"],
                "mfa_grace_period_days": 3,
                "mfa_trusted_device_days": 30,
            },
        )
        assert r.status_code == 200, r.text

        db.rollback()
        row = db.query(SystemSetting).first()
        assert row.mfa_enabled is True
        assert row.mfa_required_roles == ["admin"]
        assert row.mfa_grace_period_days == 3
        assert row.mfa_trusted_device_days == 30

    def test_the_switch_can_be_turned_back_off(self, admin_client, db, configured):
        """The master switch has to be a real off switch from the UI too."""
        assert admin_client.patch(
            "/system-settings/update", json={"mfa_enabled": False}
        ).status_code == 200

        db.rollback()
        assert db.query(SystemSetting).first().mfa_enabled is False

    def test_trusted_devices_can_be_disabled_entirely(self, admin_client, db, configured):
        assert admin_client.patch(
            "/system-settings/update", json={"mfa_trusted_device_days": 0}
        ).status_code == 200

        db.rollback()
        assert db.query(SystemSetting).first().mfa_trusted_device_days == 0


class TestServerTime:
    """TOTP is a function of the clock and nothing else.

    If the server drifts past the validation window every code from every user
    is rejected at once, and the failure reads as "the codes are wrong" — which
    sends people to the authenticator app rather than to the clock. This
    endpoint exists so a client can notice before anyone commits to a factor.
    """

    def test_it_reports_the_time_without_a_session(self, client):
        # Unauthenticated on purpose: the enrolment page needs it, and the
        # current time is not a secret.
        r = client.get("/auth/mfa/server-time")
        assert r.status_code == 200
        assert "server_time" in r.json()

    def test_the_time_it_reports_is_actually_now(self, client):
        from datetime import datetime, timezone

        body = client.get("/auth/mfa/server-time").json()
        reported = datetime.fromisoformat(body["server_time"])
        drift = abs((datetime.now(timezone.utc) - reported).total_seconds())
        assert drift < 5

    def test_it_says_how_wide_the_window_is(self, client):
        """So the client can size its warning off the server's real tolerance
        rather than a number hardcoded on the other side."""
        body = client.get("/auth/mfa/server-time").json()
        assert body["totp_period_seconds"] == 30
        assert body["totp_valid_window_steps"] >= 1

    def test_it_discloses_nothing_about_the_installation(self, client):
        raw = client.get("/auth/mfa/server-time").text
        for leak in ("lab_name", "mfa_enabled", "required_roles", "username"):
            assert leak not in raw
