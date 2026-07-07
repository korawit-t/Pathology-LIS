"""Router-level tests for app/routers/surgical_block_stain.py. The crud
layer (app/crud/surgical_block_stain.py) already has thorough coverage —
this focuses on logic that lives only in the router: the recut
auto-fill-test_id-from-HE_RECUT-system_code behavior, and the
print-stickers/mark-printed endpoints (which call the already-tested
generate_slide_sticker_pdf directly, so only smoke-tested here, not
re-verifying PDF layout)."""

from app.crud.surgical_block import create_block
from app.schemas.surgical_block import SurgicalBlockCreate

from tests.factories import make_signable_case, make_anatomical_pathology_test, make_system_setting


def _make_block(db, specimen_id):
    return create_block(db, SurgicalBlockCreate(specimen_id=specimen_id, block_no=1))


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/surgical-block-stains").status_code == 403

    def test_pathologist_can_list(self, pathologist_client):
        assert pathologist_client.get("/surgical-block-stains").status_code == 200


class TestCreateStain:
    def test_recut_with_no_test_id_auto_fills_from_he_recut_system_code(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        he_recut = make_anatomical_pathology_test(db, system_code="HE_RECUT", name="H&E Recut")

        r = pathologist_client.post(
            "/surgical-block-stains",
            json={"block_id": block.id, "is_recut": True, "slide_no": 1},
        )

        assert r.status_code == 200
        assert r.json()["test_id"] == he_recut.id

    def test_non_recut_requires_an_explicit_test_id(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db, category="IHC", system_code="ROUTER_STAIN_TEST")

        r = pathologist_client.post(
            "/surgical-block-stains",
            json={"block_id": block.id, "test_id": test.id, "slide_no": 1},
        )

        assert r.status_code == 200
        assert r.json()["test_id"] == test.id


class TestUpdateAndDelete:
    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.put("/surgical-block-stains/999999", json={"status": "stained"}).status_code == 404

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/surgical-block-stains/999999").status_code == 404

    def test_update_and_delete_an_existing_stain(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db, category="IHC", system_code="ROUTER_STAIN_TEST_2")
        created = pathologist_client.post(
            "/surgical-block-stains", json={"block_id": block.id, "test_id": test.id, "slide_no": 1},
        ).json()

        updated = pathologist_client.put(f"/surgical-block-stains/{created['id']}", json={"status": "stained"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "stained"

        deleted = pathologist_client.delete(f"/surgical-block-stains/{created['id']}")
        assert deleted.status_code == 200


class TestMarkPrinted:
    def test_marks_the_given_ids_as_printed(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db, category="IHC", system_code="ROUTER_STAIN_TEST_3")
        created = pathologist_client.post(
            "/surgical-block-stains", json={"block_id": block.id, "test_id": test.id, "slide_no": 1},
        ).json()

        r = pathologist_client.post("/surgical-block-stains/mark-printed", json={"stain_ids": [created["id"]]})

        assert r.status_code == 200
        assert r.json()["updated"] == 1


class TestPrintHeQuick:
    def test_generates_a_pdf_for_the_given_stain_ids(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db, category="IHC", system_code="ROUTER_STAIN_TEST_4")
        make_system_setting(db)
        created = pathologist_client.post(
            "/surgical-block-stains", json={"block_id": block.id, "test_id": test.id, "slide_no": 1},
        ).json()

        r = pathologist_client.post("/surgical-block-stains/print-he-quick", json={"stain_ids": [created["id"]]})

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_missing_stain_ids_returns_404(self, pathologist_client):
        r = pathologist_client.post("/surgical-block-stains/print-he-quick", json={"stain_ids": [999999]})
        assert r.status_code == 404


def test_requires_authentication(client):
    assert client.get("/surgical-block-stains").status_code == 401
