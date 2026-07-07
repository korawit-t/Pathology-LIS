"""Router-level tests for app/routers/sectioning.py. The crud layer
(app/crud/sectioning.py) already has thorough coverage in
test_sectioning.py (run sequencing, pending-tree, case-promotion guard) —
this is RBAC (CAN_ACCESS_SURGICAL_BLOCK) + wiring only.

test_create_batch_and_read_run/test_read_run_missing_returns_404 are
regression tests for a real bug: the router called the nonexistent
`crud.get_sectioning_run` (should be `get_sectioning_run_detail`), so
GET /sectioning/runs/{run_id} raised an unconditional AttributeError on
every call. Fixed in app/routers/sectioning.py."""

from tests.factories import make_signable_case, make_block


class TestRbac:
    def test_clinician_cannot_list_runs(self, clinician_client):
        assert clinician_client.get("/sectioning/runs").status_code == 403

    def test_pathologist_can_list_runs(self, pathologist_client):
        assert pathologist_client.get("/sectioning/runs").status_code == 200


class TestBatchCreateAndDetails:
    def test_create_batch_and_read_run(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="embedded")

        created = pathologist_client.post(
            "/sectioning/batch",
            json={"user_id": pathologist.id, "microtome_id": "MT-1", "items": [{"block_id": block.id, "slide_count": 3}]},
        )
        assert created.status_code == 200
        run = created.json()
        assert len(run["details"]) == 1

        r = pathologist_client.get(f"/sectioning/runs/{run['id']}")
        assert r.status_code == 200

    def test_read_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/sectioning/runs/999999").status_code == 404

    def test_update_and_delete_detail(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="embedded")
        created = pathologist_client.post(
            "/sectioning/batch",
            json={"user_id": pathologist.id, "microtome_id": "MT-1", "items": [{"block_id": block.id}]},
        ).json()
        detail_id = created["details"][0]["id"]

        updated = pathologist_client.patch(f"/sectioning/details/{detail_id}", json={"slide_count": 5})
        assert updated.status_code == 200
        assert updated.json()["slide_count"] == 5

        deleted = pathologist_client.delete(f"/sectioning/details/{detail_id}")
        assert deleted.status_code == 200

    def test_update_missing_detail_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/sectioning/details/999999", json={"slide_count": 1}).status_code == 404

    def test_delete_missing_detail_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/sectioning/details/999999").status_code == 404

    def test_pending_tree_reachable(self, pathologist_client):
        assert pathologist_client.get("/sectioning/pending-tree").status_code == 200

    def test_delete_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/sectioning/runs/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/sectioning/runs").status_code == 401
