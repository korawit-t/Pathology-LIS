"""Router-level tests for app/routers/gross_images.py. save_gross_image_local/
delete_gross_image_local write to the real STORAGE_ROOT dir by default —
monkeypatch it to tmp_path so nothing touches the real uploads/ folder."""

import io

from PIL import Image

import app.utils.file_handler as file_handler

from tests.factories import make_signable_case


def _png_bytes():
    # A real, Pillow-decodable PNG — validate_and_sanitize's _strip_exif
    # actually opens/re-encodes the image, so a magic-bytes-only fake (as
    # used for the pure magic-byte-sniffing tests in test_file_handler.py)
    # 500s here instead of the intended 200/400.
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="blue").save(buf, format="PNG")
    return buf.getvalue()


class TestUploadAndList:
    def test_pathologist_can_upload_and_list(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/surgical-specimens/{specimen.id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Gross photo", "order": 1},
        )
        assert r.status_code == 200
        assert r.json()["description"] == "Gross photo"

        listing = pathologist_client.get(f"/surgical-specimens/{specimen.id}/images/")
        assert listing.status_code == 200
        assert len(listing.json()) == 1

    def test_clinician_cannot_upload(self, db, clinician_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            f"/surgical-specimens/{specimen.id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403

    def test_upload_to_missing_specimen_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        r = pathologist_client.post(
            "/surgical-specimens/999999/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404


class TestUpdateAndDelete:
    def test_update_show_in_report(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/surgical-specimens/{specimen.id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.patch(f"/surgical-specimens/images/{created['id']}", json={"show_in_report": False})

        assert r.status_code == 200
        assert r.json()["show_in_report"] is False

    def test_delete_removes_the_db_record_even_if_file_delete_fails(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        # The router swallows any exception from delete_gross_image_local and
        # still removes the DB row — confirm that resilience behavior.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/surgical-specimens/{specimen.id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        r = pathologist_client.delete(f"/surgical-specimens/images/{created['id']}")

        assert r.status_code == 204
        assert pathologist_client.get(f"/surgical-specimens/{specimen.id}/images/").json() == []

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/surgical-specimens/images/999999", json={"description": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/surgical-specimens/images/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/surgical-specimens/1/images/").status_code == 401
