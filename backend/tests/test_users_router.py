"""Tests for the authorization guard on PUT /users/{user_id} in app/routers/users.py.

Regression coverage for a privilege-escalation bug: the admin-protection check
used to only inspect the target's *current* roles, so a non-admin caller
(lab_manager) could grant themselves or any other non-admin user the "admin"
role (plus set an arbitrary password) in a single request, since the target
wasn't admin *before* the update. The guard must also reject requests whose
*incoming* roles include "admin" when the caller isn't already an admin.
"""

import uuid

import pytest

import app.crud.user as user_crud
from app.models.system_setting import SystemSetting
from app.schemas.user import PASSWORD_MIN_LENGTH


class TestUpdateUserAdminGuard:
    def test_lab_manager_cannot_grant_admin_role_to_self(self, lab_manager_client, lab_manager_user):
        user, _ = lab_manager_user

        response = lab_manager_client.put(
            f"/users/{user.id}",
            json={"roles": ["admin"], "password": "AttackerPass1!"},
        )

        assert response.status_code == 403

    def test_lab_manager_cannot_grant_admin_role_to_other_user(self, lab_manager_client, pathologist_user):
        target, _ = pathologist_user

        response = lab_manager_client.put(
            f"/users/{target.id}",
            json={"roles": ["admin"], "password": "AttackerPass1!"},
        )

        assert response.status_code == 403

    def test_lab_manager_cannot_modify_existing_admin_account(self, lab_manager_client, admin_user):
        target, _ = admin_user

        response = lab_manager_client.put(
            f"/users/{target.id}",
            json={"full_name": "Renamed"},
        )

        assert response.status_code == 403

    def test_lab_manager_can_update_non_admin_user_without_role_change(self, lab_manager_client, pathologist_user):
        target, _ = pathologist_user

        response = lab_manager_client.put(
            f"/users/{target.id}",
            json={"full_name": "Updated Name"},
        )

        assert response.status_code == 200
        assert response.json()["full_name"] == "Updated Name"

    def test_admin_can_grant_admin_role(self, admin_client, pathologist_user):
        target, _ = pathologist_user

        response = admin_client.put(
            f"/users/{target.id}",
            json={"roles": ["admin"]},
        )

        assert response.status_code == 200
        assert "admin" in response.json()["roles"]


class TestUpdateMyPassword:
    """Regression coverage for a fix requiring the caller's current password
    on PUT /users/me/password: previously any authenticated caller could set
    a new password knowing only a valid session (e.g. a hijacked cookie),
    without ever proving they knew the account's actual password."""

    def test_wrong_current_password_is_rejected(self, pathologist_client):
        response = pathologist_client.put(
            "/users/me/password",
            json={"current_password": "WrongPass1!", "new_password": "BrandNewPass1!"},
        )
        assert response.status_code == 400

    def test_correct_current_password_succeeds(self, pathologist_client):
        response = pathologist_client.put(
            "/users/me/password",
            json={"current_password": "PathPass1!", "new_password": "BrandNewPass1!"},
        )
        assert response.status_code == 204

    def test_missing_current_password_is_rejected(self, pathologist_client):
        response = pathologist_client.put(
            "/users/me/password",
            json={"new_password": "BrandNewPass1!"},
        )
        assert response.status_code == 422


class TestPasswordPolicyOnUserManagement:
    """The Security tab's Minimum Password Length used to bind only when people
    changed their own password: an administrator creating or resetting an
    account was held to the schema's 8 alone."""

    @pytest.fixture
    def policy(self, db):
        settings = db.query(SystemSetting).first()
        if not settings:
            # "master", like /system-settings/update would create — see
            # test_auth_mfa_login.mfa_on for why any other slug leaks a row.
            settings = SystemSetting(hospital_slug="master")
            db.add(settings)
        previous = settings.password_min_length

        def set_to(length):
            settings.password_min_length = length
            db.commit()

        yield set_to
        # Commits outlive the test; put the policy back for whoever runs next.
        settings.password_min_length = previous if previous is not None else 8
        db.commit()

    def _new_user(self, password):
        return {
            "username": f"new_{uuid.uuid4().hex[:12]}",
            "full_name": "New User",
            "roles": ["pathologist"],
            "password": password,
        }

    def test_create_refuses_a_password_below_the_policy(self, admin_client, policy):
        policy(12)

        response = admin_client.post("/users", json=self._new_user("Short12345"))

        assert response.status_code == 422
        [error] = response.json()["detail"]
        assert error["loc"] == ["body", "password"]
        assert error["ctx"] == {"min_length": 12}

    def test_create_accepts_a_password_meeting_the_policy(self, admin_client, policy):
        policy(12)

        response = admin_client.post("/users", json=self._new_user("LongEnough12"))

        assert response.status_code == 200

    def test_reset_refuses_a_password_below_the_policy(
        self, admin_client, pathologist_user, policy
    ):
        target, _ = pathologist_user
        policy(12)

        response = admin_client.put(f"/users/{target.id}", json={"password": "Short12345"})

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "password"]

    def test_edit_without_a_password_is_unaffected(
        self, admin_client, pathologist_user, policy
    ):
        target, _ = pathologist_user
        policy(12)

        response = admin_client.put(f"/users/{target.id}", json={"full_name": "Renamed"})

        assert response.status_code == 200

    def test_a_policy_below_the_floor_does_not_lower_it(self, admin_client, db, policy):
        policy(6)

        assert user_crud.password_min_length(db) == PASSWORD_MIN_LENGTH
        response = admin_client.post("/users", json=self._new_user("Seven77"))
        assert response.status_code == 422

    def test_own_password_change_uses_the_same_policy(self, pathologist_client, policy):
        policy(12)

        response = pathologist_client.put(
            "/users/me/password",
            json={"current_password": "PathPass1!", "new_password": "Short12345"},
        )

        assert response.status_code == 400
        assert "12" in response.json()["detail"]
