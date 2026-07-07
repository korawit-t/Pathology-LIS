"""Router-level tests for app/routers/slide_storage.py. The crud layer
(app/crud/slide_storage.py) already has thorough coverage in
test_slide_storage.py (pending-tree grouping, batch storage, dispose
lifecycle across Surgical/Gyne/NonGyne) — this is auth/wiring only.

The router itself requires login (dependencies=[Depends(get_current_user)]
on the whole APIRouter) but has no role check anywhere — documented, not
fixed, see the consolidated RBAC report."""

from tests.factories import make_signable_case, make_block, make_block_stain, make_anatomical_pathology_test


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/slide-storage/runs").status_code == 401

    def test_any_authenticated_role_can_read(self, clinician_client):
        assert clinician_client.get("/slide-storage/runs").status_code == 200


class TestBatchStorageAndDispose:
    def test_create_batch_store_and_dispose(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db)
        stain = make_block_stain(db, block.id, test_id=test.id, status="stained")

        created = pathologist_client.post(
            "/slide-storage/batch",
            json={"user_id": pathologist.id, "items": [{"stain_id": stain.id}]},
        )
        assert created.status_code == 200
        run = created.json()
        assert len(run["details"]) == 1

        detail = pathologist_client.get(f"/slide-storage/runs/{run['id']}")
        assert detail.status_code == 200

        disposed = pathologist_client.post("/slide-storage/dispose-runs", json={"run_ids": [run["id"]]})
        assert disposed.status_code == 200
        assert disposed.json()[0]["discard_status"] is True

    def test_read_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/slide-storage/runs/999999").status_code == 404

    def test_search_by_accession(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        test = make_anatomical_pathology_test(db)
        stain = make_block_stain(db, block.id, test_id=test.id, status="stained")
        pathologist_client.post(
            "/slide-storage/batch", json={"user_id": pathologist.id, "items": [{"stain_id": stain.id}]}
        )

        r = pathologist_client.get("/slide-storage/search", params={"accession_no": case.accession_no})

        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_pending_tree_reachable(self, pathologist_client):
        assert pathologist_client.get("/slide-storage/pending-tree").status_code == 200

    def test_delete_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/slide-storage/runs/999999").status_code == 404
