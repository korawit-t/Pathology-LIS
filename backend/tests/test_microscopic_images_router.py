"""Router-level tests for app/routers/microscopic_images.py. The crud
layer (app/crud/microscopic_image.py) already has coverage in
test_microscopic_image.py — this is RBAC (CAN_ACCESS_MICROSCOPIC_IMAGE:
admin/pathologist/senior_pathologist only — notably NOT lab_manager,
unlike CAN_ACCESS_GROSS_IMAGE) + wiring, using the same real-PNG approach
as test_gross_images_router.py (validate_and_sanitize opens/re-encodes via
Pillow, so magic-bytes-only fakes 500 instead of the intended 200/400).

Unlike the file_handler.py-based image routers, this one computes its own
module-level UPLOAD_DIR/STORAGE_DIR from BACKEND_DIR at import time and
writes straight to the real backend/uploads/microscopic_images/ folder —
monkeypatch both module attributes to tmp_path so tests don't touch it."""

import io

from PIL import Image

import app.routers.microscopic_images as micro_images_module

from tests.factories import make_signable_case


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="blue").save(buf, format="PNG")
    return buf.getvalue()


def _patch_storage(monkeypatch, tmp_path):
    # Mirror the real STORAGE_DIR -> UPLOAD_DIR relationship (image_url is
    # stored as "microscopic_images/<file>", relative to STORAGE_DIR) so
    # delete's STORAGE_DIR/image_url lookup matches where upload wrote it.
    upload_dir = tmp_path / "microscopic_images"
    upload_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(micro_images_module, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(micro_images_module, "UPLOAD_DIR", upload_dir)


class TestRbac:
    def test_lab_manager_cannot_upload(self, db, lab_manager_client, admin_user, tmp_path, monkeypatch):
        # CAN_ACCESS_MICROSCOPIC_IMAGE is admin/pathologist/senior_pathologist
        # only — unlike gross images, lab_manager is excluded here.
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        r = lab_manager_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 403

    def test_pathologist_can_upload(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"magnification": "40x", "stain": "H&E"},
        )

        assert r.status_code == 200
        assert r.json()["magnification"] == "40x"


class TestListUpdateDelete:
    def test_get_by_specimen_and_case(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        )

        by_specimen = pathologist_client.get(f"/microscopic-images/specimen/{specimen.id}")
        assert by_specimen.status_code == 200
        assert len(by_specimen.json()) == 1

        by_case = pathologist_client.get(f"/microscopic-images/case/{case.id}")
        assert by_case.status_code == 200
        assert len(by_case.json()) == 1

    def test_update_missing_returns_404(self, pathologist_client):
        r = pathologist_client.patch("/microscopic-images/999999", json={"description": "x"})
        assert r.status_code == 404

    def test_update_and_delete(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

        updated = pathologist_client.patch(
            f"/microscopic-images/{created['id']}", json={"description": "Updated"}
        )
        assert updated.status_code == 200
        assert updated.json()["description"] == "Updated"

        deleted = pathologist_client.delete(f"/microscopic-images/{created['id']}")
        assert deleted.status_code == 200

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/microscopic-images/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/microscopic-images/specimen/1").status_code == 401
