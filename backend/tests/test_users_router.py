"""Tests for the authorization guard on PUT /users/{user_id} in app/routers/users.py.

Regression coverage for a privilege-escalation bug: the admin-protection check
used to only inspect the target's *current* roles, so a non-admin caller
(lab_manager) could grant themselves or any other non-admin user the "admin"
role (plus set an arbitrary password) in a single request, since the target
wasn't admin *before* the update. The guard must also reject requests whose
*incoming* roles include "admin" when the caller isn't already an admin.
"""


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
