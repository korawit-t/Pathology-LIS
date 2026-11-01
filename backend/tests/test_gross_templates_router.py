"""Router-level tests for app/routers/gross_templates.py — any authenticated
user (get_current_user, no role check) for every route. Delete is a soft
delete (deactivate), matching the crud layer."""


class TestCrudWiring:
    def test_lab_staff_can_create_and_list(self, staff_client):
        staff_client.post("/gross-templates", json={"name": "Tmpl", "raw_content": "text"})
        r = staff_client.get("/gross-templates")
        assert r.status_code == 200
        assert any(t["name"] == "Tmpl" for t in r.json())

    def test_put_and_patch_both_update(self, staff_client):
        created = staff_client.post("/gross-templates", json={"name": "Tmpl", "raw_content": "old"}).json()
        r1 = staff_client.put(f"/gross-templates/{created['id']}", json={"raw_content": "via put"})
        assert r1.json()["raw_content"] == "via put"
        r2 = staff_client.patch(f"/gross-templates/{created['id']}", json={"raw_content": "via patch"})
        assert r2.json()["raw_content"] == "via patch"

    def test_delete_deactivates_and_disappears_from_list(self, staff_client):
        created = staff_client.post("/gross-templates", json={"name": "ToDeactivate", "raw_content": "x"}).json()
        r = staff_client.delete(f"/gross-templates/{created['id']}")
        assert r.status_code == 200
        listing = staff_client.get("/gross-templates").json()
        assert created["id"] not in {t["id"] for t in listing}

    def test_update_missing_returns_404(self, staff_client):
        assert staff_client.put("/gross-templates/999999", json={"name": "x", "raw_content": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, staff_client):
        assert staff_client.delete("/gross-templates/999999").status_code == 404

    def test_requires_authentication(self, client):
        assert client.get("/gross-templates").status_code == 401
