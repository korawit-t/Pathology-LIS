"""Router-level tests for app/routers/wsi_links.py. The crud layer
(app/crud/wsi_slide_link.py) already has coverage in test_wsi_slide_link.py
— this is RBAC (a real per-route mix: CAN_VIEW_WSI for list,
get_current_active_user for create/update, CAN_MANAGE_SYSTEM_SETTINGS for
delete — documented as-is, not assumed to be a bug) + wiring."""

import uuid

from app.models.wsi_file import WsiFile

from tests.factories import make_signable_case, make_block


def _wsi_file(db, **overrides) -> WsiFile:
    f = WsiFile(file_path=f"/data/{uuid.uuid4().hex}.svs", filename="slide.svs", **overrides)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/wsi-links").status_code == 403

    def test_pathologist_can_list(self, pathologist_client):
        assert pathologist_client.get("/wsi-links").status_code == 200

    def test_clinician_can_create(self, db, clinician_client, admin_user):
        # create only needs get_current_active_user, not CAN_VIEW_WSI.
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)

        r = clinician_client.post(
            "/wsi-links", json={"wsi_file_id": wsi_file.id, "surgical_block_id": block.id}
        )

        assert r.status_code == 201

    def test_clinician_cannot_delete(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        created = clinician_client.post(
            "/wsi-links", json={"wsi_file_id": wsi_file.id, "surgical_block_id": block.id}
        ).json()

        r = clinician_client.delete(f"/wsi-links/{created['id']}")

        assert r.status_code == 403


class TestCrudWiring:
    def test_create_update_and_list_filters(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)

        created = pathologist_client.post(
            "/wsi-links", json={"wsi_file_id": wsi_file.id, "surgical_block_id": block.id}
        )
        assert created.status_code == 201
        link = created.json()
        assert link["status"] == "pending"

        updated = pathologist_client.patch(f"/wsi-links/{link['id']}", json={"status": "confirmed"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "confirmed"
        assert updated.json()["confirmed_at"] is not None

        filtered = pathologist_client.get("/wsi-links", params={"surgical_block_id": block.id})
        assert filtered.status_code == 200
        assert any(item["id"] == link["id"] for item in filtered.json())

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/wsi-links/999999", json={"status": "rejected"}).status_code == 404

    def test_delete_missing_returns_404(self, admin_client):
        assert admin_client.delete("/wsi-links/999999").status_code == 404

    def test_delete_existing(self, db, admin_client, admin_user):
        # admin_client for both create and delete — CAN_MANAGE_SYSTEM_SETTINGS
        # gates delete, and admin also satisfies create's
        # get_current_active_user, so one client covers the whole flow.
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        created = admin_client.post(
            "/wsi-links", json={"wsi_file_id": wsi_file.id, "surgical_block_id": block.id}
        ).json()

        r = admin_client.delete(f"/wsi-links/{created['id']}")

        assert r.status_code == 204


def test_requires_authentication(client):
    assert client.get("/wsi-links").status_code == 401
