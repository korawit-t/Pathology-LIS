"""Router-level tests for app/routers/gross_images.py. save_gross_image_local/
delete_gross_image_local write to the real STORAGE_ROOT dir by default —
monkeypatch it to tmp_path so nothing touches the real uploads/ folder."""

import io

from PIL import Image

import app.utils.file_handler as file_handler

from app.models.surgical_diagnosis import SurgicalDiagnosis

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


class TestReplaceContent:
    """PUT .../content swaps the stored file for a re-cropped / rotated /
    annotated render while keeping the row and its metadata intact."""

    def _upload(self, client, specimen_id):
        return client.post(
            f"/surgical-specimens/{specimen_id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Gross photo", "order": 3},
        ).json()

    def test_replace_swaps_the_file_and_keeps_metadata(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)
        old_path = tmp_path / created["image_url"].removeprefix("/storage/")
        assert old_path.exists()

        r = pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 200
        body = r.json()
        # A new file is written rather than the old one overwritten, so the
        # URL changes and clients can't serve a stale cached image.
        assert body["image_url"] != created["image_url"]
        assert (tmp_path / body["image_url"].removeprefix("/storage/")).exists()
        assert not old_path.exists()
        # Metadata survives the swap
        assert body["id"] == created["id"]
        assert body["description"] == "Gross photo"
        assert body["order"] == 3

    def test_replace_rejects_a_non_image(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        r = pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("evil.png", b"not really a png", "image/png")},
        )

        assert r.status_code == 400
        # the original file is untouched
        assert (tmp_path / created["image_url"].removeprefix("/storage/")).exists()

    def test_replace_missing_image_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        r = pathologist_client.put(
            "/surgical-specimens/images/999999/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404

    def test_clinician_cannot_replace(self, db, pathologist_client, clinician_user, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        # Every *_client fixture returns the SAME TestClient (one cookie jar),
        # so holding two handles just means the last login wins. Switch
        # identity explicitly instead.
        user, pwd = clinician_user
        assert pathologist_client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).status_code == 200

        r = pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403


class TestLockedCaseGuard:
    """A signed-out case must reject every image write, not just hide the
    buttons — see app/utils/case_lock.py."""

    def _upload(self, client, specimen_id):
        return client.post(
            f"/surgical-specimens/{specimen_id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Gross photo"},
        ).json()

    def test_every_write_is_rejected_once_the_case_is_signed_out(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "signed out"
        db.commit()

        assert pathologist_client.post(
            f"/surgical-specimens/{specimen.id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Gross photo"},
        ).status_code == 423
        assert pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        ).status_code == 423
        assert pathologist_client.patch(f"/surgical-specimens/images/{created['id']}", json={"show_in_report": False}).status_code == 423
        assert pathologist_client.delete(f"/surgical-specimens/images/{created['id']}").status_code == 423

        # reads are unaffected — the report still has to be viewable
        assert pathologist_client.get(f"/surgical-specimens/{specimen.id}/images/").status_code == 200

    def test_an_open_addendum_draft_unlocks_writes_again(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        # A draft diagnosis on a signed-out case is the addendum flow; the
        # frontend re-enables editing there, so the backend must too.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "signed out"
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="draft"))
        db.commit()

        assert pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        ).status_code == 200
        assert pathologist_client.patch(f"/surgical-specimens/images/{created['id']}", json={"show_in_report": False}).status_code == 200

    def test_a_cancelled_case_is_locked_even_with_a_draft(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, specimen.id)

        case.status = "cancelled"
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="draft"))
        db.commit()

        assert pathologist_client.delete(f"/surgical-specimens/images/{created['id']}").status_code == 423
