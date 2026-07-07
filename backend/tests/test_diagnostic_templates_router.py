"""Router-level tests for app/routers/diagnostic_templates.py — any
authenticated user (get_current_user, no role check) for every route."""

from app.crud.diagnostic_template import create_diagnostic_template
from app.schemas.diagnostic_template import DiagnosticTemplateCreate


class TestCrudWiring:
    def test_clinician_can_create_and_read(self, clinician_client):
        created = clinician_client.post(
            "/diagnostic-templates", json={"name": "Tmpl", "diagnosis_content": "text"},
        ).json()
        r = clinician_client.get(f"/diagnostic-templates/{created['id']}")
        assert r.status_code == 200
        assert r.json()["diagnosis_content"] == "text"

    def test_filters_by_category(self, db, clinician_client):
        create_diagnostic_template(db, DiagnosticTemplateCreate(name="A", diagnosis_content="x", category="Skin"))
        r = clinician_client.get("/diagnostic-templates", params={"category": "Skin"})
        assert r.status_code == 200
        assert all(t["category"] == "Skin" for t in r.json())

    def test_update_and_delete(self, clinician_client):
        created = clinician_client.post(
            "/diagnostic-templates", json={"name": "Tmpl", "diagnosis_content": "old"},
        ).json()
        updated = clinician_client.patch(f"/diagnostic-templates/{created['id']}", json={"diagnosis_content": "new"})
        assert updated.json()["diagnosis_content"] == "new"
        deleted = clinician_client.delete(f"/diagnostic-templates/{created['id']}")
        assert deleted.status_code == 200

    def test_read_missing_returns_404(self, clinician_client):
        assert clinician_client.get("/diagnostic-templates/999999").status_code == 404

    def test_update_missing_returns_404(self, clinician_client):
        assert clinician_client.patch("/diagnostic-templates/999999", json={"name": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, clinician_client):
        assert clinician_client.delete("/diagnostic-templates/999999").status_code == 404

    def test_requires_authentication(self, client):
        assert client.get("/diagnostic-templates").status_code == 401
