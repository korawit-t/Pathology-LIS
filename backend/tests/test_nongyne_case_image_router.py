"""Router-level tests for app/routers/nongyne_case_image.py. Mirrors
test_gyne_case_image_router.py exactly — see that file's module docstring
for the STORAGE_ROOT / real-PNG rationale."""

import io

from PIL import Image

import app.utils.file_handler as file_handler

from tests.factories import make_bare_nongyne_case


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="red").save(buf, format="PNG")
    return buf.getvalue()


class TestRbac:
    def test_clinician_cannot_upload(self, db, clinician_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403

    def test_pathologist_can_upload(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "FNA smear photo", "order": 1},
        )
        assert r.status_code == 200
        assert r.json()["description"] == "FNA smear photo"


class TestUploadListUpdateDelete:
    def test_upload_to_missing_case_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        r = pathologist_client.post(
            "/nongyne-cytology/999999/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404

    def test_list_returns_uploaded_images_in_order(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"order": 1},
        )

        r = pathologist_client.get(f"/nongyne-cytology/{case.id}/images")

        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_update_show_in_report(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.patch(f"/nongyne-cytology/images/{created['id']}", json={"show_in_report": False})

        assert r.status_code == 200
        assert r.json()["show_in_report"] is False

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/nongyne-cytology/images/999999", json={"description": "x"}).status_code == 404

    def test_delete_removes_the_db_record_even_if_file_delete_fails(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.delete(f"/nongyne-cytology/images/{created['id']}")

        assert r.status_code == 204
        assert pathologist_client.get(f"/nongyne-cytology/{case.id}/images").json() == []

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/nongyne-cytology/images/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/nongyne-cytology/1/images").status_code == 401
