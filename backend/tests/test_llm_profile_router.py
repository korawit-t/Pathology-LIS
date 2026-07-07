"""Router-level tests for app/routers/llm_profile.py — CAN_MANAGE_SYSTEM_SETTINGS
(admin only) gates every route."""

from app.crud.llm_profile import create
from app.schemas.llm_profile import LlmProfileCreate


def _profile_in(**overrides):
    fields = dict(display_name="Test Profile", provider="openai", model="gpt-4o")
    fields.update(overrides)
    return fields


class TestRbac:
    def test_admin_can_list(self, admin_client):
        assert admin_client.get("/llm-profiles").status_code == 200

    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/llm-profiles").status_code == 403

    def test_pathologist_cannot_create(self, pathologist_client):
        # CAN_MANAGE_SYSTEM_SETTINGS is admin-only, unlike CAN_MANAGE_SETTINGS
        r = pathologist_client.post("/llm-profiles", json=_profile_in())
        assert r.status_code == 403


class TestCrudWiring:
    def test_admin_can_create_update_delete(self, admin_client):
        created = admin_client.post("/llm-profiles", json=_profile_in()).json()
        assert created["display_name"] == "Test Profile"

        updated = admin_client.put(f"/llm-profiles/{created['id']}", json={"is_active": False})
        assert updated.status_code == 200
        assert updated.json()["is_active"] is False

        deleted = admin_client.delete(f"/llm-profiles/{created['id']}")
        assert deleted.status_code == 204

    def test_update_missing_returns_404(self, admin_client):
        r = admin_client.put("/llm-profiles/999999", json={"is_active": False})
        assert r.status_code == 404

    def test_delete_missing_returns_404(self, admin_client):
        assert admin_client.delete("/llm-profiles/999999").status_code == 404
