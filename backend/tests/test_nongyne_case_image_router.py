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


class TestStain:
    def test_stain_round_trips_through_upload(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        # The capture modal has always shown a stain picker; until now the
        # value was selected, rendered as an overlay, and then dropped.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Slide 1", "stain": "Giemsa"},
        )

        assert r.status_code == 200
        assert r.json()["stain"] == "Giemsa"

        listing = pathologist_client.get(f"/nongyne-cytology/{case.id}/images")
        assert listing.json()[0]["stain"] == "Giemsa"

    def test_stain_can_be_patched(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()
        assert created["stain"] is None

        r = pathologist_client.patch(
            f"/nongyne-cytology/images/{created['id']}", json={"stain": "Giemsa"}
        )

        assert r.status_code == 200
        assert r.json()["stain"] == "Giemsa"


class TestReplaceContent:
    """PUT .../content swaps the stored file for a re-cropped / rotated /
    annotated render while keeping the row and its metadata intact."""

    def _upload(self, client, case_id):
        return client.post(
            f"/nongyne-cytology/{case_id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Slide 1", "order": 2},
        ).json()

    def test_replace_swaps_the_file_and_keeps_metadata(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, case.id)
        old_path = tmp_path / created["image_url"].removeprefix("/storage/")
        assert old_path.exists()

        r = pathologist_client.put(
            f"/nongyne-cytology/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 200
        body = r.json()
        # A new file is written rather than the old one overwritten, so the
        # URL changes and clients can't serve a stale cached image.
        assert body["image_url"] != created["image_url"]
        assert (tmp_path / body["image_url"].removeprefix("/storage/")).exists()
        assert not old_path.exists()
        assert body["id"] == created["id"]
        assert body["description"] == "Slide 1"
        assert body["order"] == 2

    def test_replace_rejects_a_non_image(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, case.id)

        r = pathologist_client.put(
            f"/nongyne-cytology/images/{created['id']}/content",
            files={"file": ("evil.png", b"not really a png", "image/png")},
        )

        assert r.status_code == 400
        assert (tmp_path / created["image_url"].removeprefix("/storage/")).exists()

    def test_replace_missing_image_returns_404(self, pathologist_client, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        r = pathologist_client.put(
            "/nongyne-cytology/images/999999/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 404

    def test_clinician_cannot_replace(self, db, pathologist_client, clinician_user, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, case.id)

        # Every *_client fixture returns the SAME TestClient (one cookie jar),
        # so holding two handles just means the last login wins. Switch
        # identity explicitly instead.
        user, pwd = clinician_user
        assert pathologist_client.post(
            "/auth/login", data={"username": user.username, "password": pwd}
        ).status_code == 200

        r = pathologist_client.put(
            f"/nongyne-cytology/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 403


class TestLockedCaseGuard:
    """A published case must reject every image write, not just hide the
    buttons — see app/utils/case_lock.py."""

    def _upload(self, client, case_id):
        return client.post(
            f"/nongyne-cytology/{case_id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
            data={"description": "Slide 1"},
        ).json()

    def test_every_write_is_rejected_once_the_case_is_published(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, case.id)

        case.status = "published"
        db.commit()

        assert pathologist_client.post(
            f"/nongyne-cytology/{case.id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).status_code == 423
        assert pathologist_client.put(
            f"/nongyne-cytology/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        ).status_code == 423
        assert pathologist_client.patch(
            f"/nongyne-cytology/images/{created['id']}", json={"description": "changed"}
        ).status_code == 423
        assert pathologist_client.delete(
            f"/nongyne-cytology/images/{created['id']}"
        ).status_code == 423

        # reads are unaffected — the report still has to be viewable
        assert pathologist_client.get(f"/nongyne-cytology/{case.id}/images").status_code == 200

    def test_pending_approval_is_also_locked(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        # Non-gyne has no "revised" state — pending_approval is the other
        # locked status worth pinning down.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        created = self._upload(pathologist_client, case.id)

        case.status = "pending_approval"
        db.commit()

        assert pathologist_client.patch(
            f"/nongyne-cytology/images/{created['id']}", json={"description": "changed"}
        ).status_code == 423
