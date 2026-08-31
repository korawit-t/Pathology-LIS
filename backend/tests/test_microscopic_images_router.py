"""Router-level tests for app/routers/microscopic_images.py. The crud
layer (app/crud/microscopic_image.py) already has coverage in
test_microscopic_image.py — this is RBAC (CAN_ACCESS_MICROSCOPIC_IMAGE:
admin/pathologist/senior_pathologist only — notably NOT lab_manager,
unlike CAN_ACCESS_GROSS_IMAGE) + wiring, using the same real-PNG approach
as test_gross_images_router.py (validate_and_sanitize opens/re-encodes via
Pillow, so magic-bytes-only fakes 500 instead of the intended 200/400).

Uploads and deletes go through file_handler (save/delete_microscopic_image_
local), so STORAGE_ROOT must be redirected at tmp_path — but this router also
keeps its own module-level UPLOAD_DIR/STORAGE_DIR, computed from BACKEND_DIR at
import time, which the get-image endpoint still serves from. Patch all three or
tests write into the real backend/uploads/microscopic_images/ folder."""

import io

from PIL import Image

import app.routers.microscopic_images as micro_images_module
import app.utils.file_handler as file_handler

from app.models.surgical_diagnosis import SurgicalDiagnosis

from tests.factories import make_signable_case


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="blue").save(buf, format="PNG")
    return buf.getvalue()


def _patch_storage(monkeypatch, tmp_path):
    # Mirror the real STORAGE_DIR -> UPLOAD_DIR relationship (image_url is
    # stored as "microscopic_images/<file>", relative to STORAGE_DIR) so
    # the get-image lookup matches where the upload wrote it. STORAGE_ROOT is
    # what save/delete_microscopic_image_local actually resolve against.
    upload_dir = tmp_path / "microscopic_images"
    upload_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
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


class TestReplaceContent:
    """PUT /microscopic-images/{id}/content swaps the stored file for a
    re-cropped / rotated / annotated render, keeping the row and metadata."""

    def _upload(self, client, specimen_id):
        return client.post(
            f"/microscopic-images/{specimen_id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"magnification": "40x", "stain": "H&E", "description": "Tumour front"},
        ).json()

    def test_replace_swaps_the_file_and_keeps_metadata(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)
        # image_url here carries no "/storage/" prefix — see the module docstring
        old_path = tmp_path / created["image_url"]
        assert old_path.exists()

        r = pathologist_client.put(
            f"/microscopic-images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 200
        body = r.json()
        assert body["image_url"] != created["image_url"]
        assert (tmp_path / body["image_url"]).exists()
        assert not old_path.exists()
        assert body["id"] == created["id"]
        assert body["magnification"] == "40x"
        assert body["stain"] == "H&E"
        assert body["description"] == "Tumour front"

    def test_replace_rejects_a_non_image(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        r = pathologist_client.put(
            f"/microscopic-images/{created['id']}/content",
            files={"file": ("evil.png", b"not really a png", "image/png")},
        )

        assert r.status_code == 400
        assert (tmp_path / created["image_url"]).exists()

    def test_replace_missing_image_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        r = pathologist_client.put(
            "/microscopic-images/999999/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404

    def test_lab_manager_cannot_replace(self, db, pathologist_client, lab_manager_user, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        # Every *_client fixture returns the SAME TestClient (one cookie jar),
        # so holding two handles just means the last login wins. Switch
        # identity explicitly instead.
        user, pwd = lab_manager_user
        assert pathologist_client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).status_code == 200

        r = pathologist_client.put(
            f"/microscopic-images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403


class TestLockedCaseGuard:
    """A signed-out case must reject every image write, not just hide the
    buttons — see app/utils/case_lock.py."""

    def _upload(self, client, specimen_id):
        return client.post(
            f"/microscopic-images/{specimen_id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"magnification": "40x", "stain": "H&E"},
        ).json()

    def test_every_write_is_rejected_once_the_case_is_signed_out(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "signed out"
        db.commit()

        assert pathologist_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"magnification": "40x", "stain": "H&E"},
        ).status_code == 423
        assert pathologist_client.put(
            f"/microscopic-images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        ).status_code == 423
        assert pathologist_client.patch(f"/microscopic-images/{created['id']}", json={"description": "changed"}).status_code == 423
        assert pathologist_client.delete(f"/microscopic-images/{created['id']}").status_code == 423

        # reads are unaffected — the report still has to be viewable
        assert pathologist_client.get(f"/microscopic-images/specimen/{specimen.id}").status_code == 200

    def test_an_open_addendum_draft_unlocks_writes_again(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        # A draft diagnosis on a signed-out case is the addendum flow; the
        # frontend re-enables editing there, so the backend must too.
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "signed out"
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="draft"))
        db.commit()

        assert pathologist_client.put(
            f"/microscopic-images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        ).status_code == 200
        assert pathologist_client.patch(f"/microscopic-images/{created['id']}", json={"description": "changed"}).status_code == 200

    def test_a_cancelled_case_is_locked_even_with_a_draft(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        _patch_storage(monkeypatch, tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "cancelled"
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="draft"))
        db.commit()

        assert pathologist_client.delete(f"/microscopic-images/{created['id']}").status_code == 423
