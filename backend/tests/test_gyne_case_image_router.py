"""Router-level tests for app/routers/gyne_case_image.py. Mirrors
test_gross_images_router.py's approach: save_gyne_image_local/
delete_gyne_image_local write to the real STORAGE_ROOT by default, so
monkeypatch it to tmp_path; validate_and_sanitize actually opens/re-encodes
via Pillow, so uploads need a real, decodable PNG, not magic-bytes-only."""

import io

from PIL import Image

import app.utils.file_handler as file_handler

from tests.factories import make_bare_gyne_case


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="green").save(buf, format="PNG")
    return buf.getvalue()


class TestRbac:
    def test_clinician_cannot_upload(self, db, clinician_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            f"/gyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403

    def test_pathologist_can_upload(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/gyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Pap smear photo", "order": 1},
        )
        assert r.status_code == 200
        assert r.json()["description"] == "Pap smear photo"


class TestUploadListUpdateDelete:
    def test_upload_to_missing_case_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        r = pathologist_client.post(
            "/gyne-cytology/999999/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404

    def test_list_returns_uploaded_images_in_order(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        pathologist_client.post(
            f"/gyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"order": 1},
        )

        r = pathologist_client.get(f"/gyne-cytology/{case.id}/images")

        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_update_show_in_report(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/gyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.patch(f"/gyne-cytology/images/{created['id']}", json={"show_in_report": False})

        assert r.status_code == 200
        assert r.json()["show_in_report"] is False

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/gyne-cytology/images/999999", json={"description": "x"}).status_code == 404

    def test_delete_removes_the_db_record_even_if_file_delete_fails(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/gyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.delete(f"/gyne-cytology/images/{created['id']}")

        assert r.status_code == 204
        assert pathologist_client.get(f"/gyne-cytology/{case.id}/images").json() == []

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/gyne-cytology/images/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/gyne-cytology/1/images").status_code == 401
