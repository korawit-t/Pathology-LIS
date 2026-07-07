"""Router-level tests for app/routers/wsi_settings.py. No crud test file
exists at all for app/crud/wsi_setting.py's profile CRUD (only the
singleton-settings get/update is exercised indirectly elsewhere), so this
gives fuller coverage of the profile lifecycle in addition to RBAC."""


class TestRbac:
    def test_clinician_cannot_read_settings(self, clinician_client):
        assert clinician_client.get("/wsi-settings").status_code == 403

    def test_admin_can_read_settings(self, admin_client):
        r = admin_client.get("/wsi-settings")
        assert r.status_code == 200
        assert r.json()["hospital_slug"] == "master"


class TestUpdateSettings:
    def test_admin_can_update_root_path(self, admin_client):
        r = admin_client.patch("/wsi-settings", json={"wsi_root_path": "/mnt/wsi-data"})
        assert r.status_code == 200
        assert r.json()["wsi_root_path"] == "/mnt/wsi-data"

    def test_clinician_cannot_update(self, clinician_client):
        assert clinician_client.patch("/wsi-settings", json={"wsi_root_path": "/x"}).status_code == 403


class TestProfileCrud:
    def test_create_list_update_delete(self, admin_client):
        created = admin_client.post(
            "/wsi-settings/profiles",
            json={"name": "Aperio GT450", "filename_pattern": "{accession}_{block}", "file_extensions": [".svs"]},
        )
        assert created.status_code == 201
        profile_id = created.json()["id"]

        listed = admin_client.get("/wsi-settings/profiles")
        assert listed.status_code == 200
        assert any(p["id"] == profile_id for p in listed.json())

        updated = admin_client.put(f"/wsi-settings/profiles/{profile_id}", json={"is_active": False})
        assert updated.status_code == 200
        assert updated.json()["is_active"] is False

        deleted = admin_client.delete(f"/wsi-settings/profiles/{profile_id}")
        assert deleted.status_code == 204

    def test_update_missing_profile_returns_404(self, admin_client):
        r = admin_client.put("/wsi-settings/profiles/999999", json={"is_active": False})
        assert r.status_code == 404

    def test_delete_missing_profile_returns_404(self, admin_client):
        assert admin_client.delete("/wsi-settings/profiles/999999").status_code == 404

    def test_clinician_cannot_create_profile(self, clinician_client):
        r = clinician_client.post(
            "/wsi-settings/profiles",
            json={"name": "X", "filename_pattern": "{accession}"},
        )
        assert r.status_code == 403


def test_requires_authentication(client):
    assert client.get("/wsi-settings").status_code == 401
