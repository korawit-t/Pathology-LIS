"""Router-level tests for app/routers/surgical_block.py. The crud layer
(app/crud/surgical_block.py) is already covered elsewhere — this is RBAC +
wiring only."""

from tests.factories import (
    make_signable_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
)


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/surgical-blocks").status_code == 403

    def test_pathologist_can_list(self, pathologist_client):
        r = pathologist_client.get("/surgical-blocks")
        assert r.status_code == 200
        assert "items" in r.json() or "total" in r.json() or isinstance(r.json(), dict)


class TestCrudWiring:
    def test_create_list_update_delete(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        created = pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1}).json()
        assert created["block_no"] == 1

        updated = pathologist_client.put(f"/surgical-blocks/{created['id']}", json={"status": "embedded"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "embedded"

        deleted = pathologist_client.delete(f"/surgical-blocks/{created['id']}")
        assert deleted.status_code == 200

    def test_filters_by_specimen_id(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1})

        r = pathologist_client.get("/surgical-blocks", params={"specimen_id": specimen.id})

        assert r.status_code == 200
        assert all(b["specimen_id"] == specimen.id for b in r.json()["items"])


def test_requires_authentication(client):
    assert client.get("/surgical-blocks").status_code == 401


class TestPendingOutlabFilter:
    def test_finds_old_block_behind_many_newer_ones(self, db, pathologist_client, admin_user):
        """Regression: an outlab IHC ordered on a block created long ago must
        still surface in the Send-to-Outlab queue even after 200+ newer
        blocks were created since — the queue used to fetch only the most
        recent 200 blocks (by id) and filter client-side, which silently
        dropped it. has_pending_outlab now filters server-side before any
        ordering/limit is applied."""
        registrar, _ = admin_user
        external_test = make_anatomical_pathology_test(
            db, category="IHC", name="Outlab IHC", is_external=True
        )

        _, old_specimen = make_signable_case(db, registrar_id=registrar.id)
        old_block = make_block(db, specimen_id=old_specimen.id, block_no=1)
        make_block_stain(db, block_id=old_block.id, test_id=external_test.id, status="pending")

        # Simulate 200+ blocks created afterwards, on unrelated specimens,
        # none of which have any pending outlab stain.
        for _ in range(205):
            _, specimen = make_signable_case(db, registrar_id=registrar.id)
            make_block(db, specimen_id=specimen.id, block_no=1)

        r = pathologist_client.get("/surgical-blocks", params={"has_pending_outlab": True})
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()["items"]]
        assert old_block.id in ids

        # And the plain "most recent 200" query is the reproduction of the
        # original bug — old_block must NOT appear there, proving the fix
        # is genuinely filtering server-side rather than coincidentally.
        r2 = pathologist_client.get("/surgical-blocks", params={"limit": 200})
        assert old_block.id not in [b["id"] for b in r2.json()["items"]]
