"""Router-level tests for app/routers/block_storage.py. Mirrors
test_slide_storage_router.py's approach — the crud layer
(app/crud/block_storage.py) already has thorough coverage in
test_block_storage.py, so this is auth/wiring only."""

from tests.factories import make_signable_case, make_block


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/block-storage/runs").status_code == 401

    def test_any_authenticated_role_can_read(self, clinician_client):
        assert clinician_client.get("/block-storage/runs").status_code == 200


class TestBatchStorageAndDispose:
    def test_create_batch_store_and_dispose(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")

        created = pathologist_client.post(
            "/block-storage/batch",
            json={"user_id": pathologist.id, "items": [{"block_id": block.id}]},
        )
        assert created.status_code == 200
        run = created.json()
        assert len(run["details"]) == 1

        detail = pathologist_client.get(f"/block-storage/runs/{run['id']}")
        assert detail.status_code == 200

        disposed = pathologist_client.post("/block-storage/dispose-blocks", json={"detail_ids": [run["details"][0]["id"]]})
        assert disposed.status_code == 200
        assert disposed.json()[0]["discard_status"] is True

    def test_read_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/block-storage/runs/999999").status_code == 404

    def test_search_by_accession(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")
        pathologist_client.post(
            "/block-storage/batch", json={"user_id": pathologist.id, "items": [{"block_id": block.id}]}
        )

        r = pathologist_client.get("/block-storage/search", params={"accession_no": case.accession_no})

        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_pending_tree_reachable(self, pathologist_client):
        assert pathologist_client.get("/block-storage/pending-tree").status_code == 200

    def test_delete_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/block-storage/runs/999999").status_code == 404
