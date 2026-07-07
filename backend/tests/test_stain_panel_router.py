"""Router-level tests for app/routers/stain_panel.py — any authenticated
user (get_current_user, no role check) for every route."""

from app.crud.stain_panel import create_stain_panel
from app.schemas.stain_panel import StainPanelCreate
from tests.factories import make_anatomical_pathology_test


class TestCrudWiring:
    def test_clinician_can_list_active_only(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        create_stain_panel(db, StainPanelCreate(name="Active Panel", is_active=True), user_id=registrar.id)
        r = clinician_client.get("/stain-panels")
        assert r.status_code == 200
        assert all(p["is_active"] for p in r.json())

    def test_clinician_can_create_with_test_ids(self, db, clinician_client):
        test = make_anatomical_pathology_test(db, system_code="SP_ROUTER_1")
        r = clinician_client.post("/stain-panels", json={"name": "New Panel", "test_ids": [test.id]})
        assert r.status_code == 201
        assert r.json()["items"][0]["test_id"] == test.id

    def test_update_missing_returns_404(self, clinician_client):
        assert clinician_client.patch("/stain-panels/999999", json={"name": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, clinician_client):
        assert clinician_client.delete("/stain-panels/999999").status_code == 404

    def test_requires_authentication(self, client):
        assert client.get("/stain-panels").status_code == 401
