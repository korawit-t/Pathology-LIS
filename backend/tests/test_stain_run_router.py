"""Router-level tests for app/routers/stain_run.py. The crud layer
(app/crud/stain_run.py) already has thorough coverage in test_stain_run.py
(case-status promotion once all H&E-routine stains are done) — this is
auth/wiring + the router-only "at least one slide" 400 guard.

REGRESSION TEST for a real fix: previously only POST "" (create_run)
required authentication. list_runs (GET ""), get_run (GET "/{run_id}"), and
update_status (PATCH "/{run_id}/status") had no `current_user` param and
the router declared no `dependencies=[]` either — reachable with zero
login. Fixed by adding `dependencies=[Depends(get_current_user)]` at the
router level, matching the bar `create_run` already required."""

from tests.factories import make_signable_case, make_block, make_anatomical_pathology_test
from app.crud.surgical_block_stain import create_stain as create_block_stain
from app.schemas.surgical_block_stain import StainCreate


def _he_test(db):
    return make_anatomical_pathology_test(db, system_code="HE_ROUTINE", category="Histology")


class TestAuth:
    def test_create_requires_authentication(self, client):
        assert client.post("/stain-runs", json={"stain_ids": [1]}).status_code == 401

    def test_list_get_and_update_status_require_authentication(self, client):
        assert client.get("/stain-runs").status_code == 401
        assert client.get("/stain-runs/999999").status_code == 401
        assert client.patch("/stain-runs/999999/status", params={"status": "cancelled"}).status_code == 401

    def test_pathologist_can_reach_list_get_and_update_status(self, pathologist_client):
        assert pathologist_client.get("/stain-runs").status_code == 200
        assert pathologist_client.get("/stain-runs/999999").status_code == 404
        assert pathologist_client.patch("/stain-runs/999999/status", params={"status": "cancelled"}).status_code == 404


class TestCreateRun:
    def test_no_stain_ids_returns_400(self, pathologist_client):
        r = pathologist_client.post("/stain-runs", json={"stain_ids": []})
        assert r.status_code == 400

    def test_creates_run_in_running_status(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))

        r = pathologist_client.post("/stain-runs", json={"stain_ids": [stain.id], "stainer_id": "ST-1"})

        assert r.status_code == 200
        assert r.json()["status"] == "running"


class TestReadAndUpdateStatus:
    def test_get_run_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/stain-runs/999999").status_code == 404

    def test_get_run_details(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
        created = pathologist_client.post("/stain-runs", json={"stain_ids": [stain.id]}).json()

        r = pathologist_client.get(f"/stain-runs/{created['id']}")

        # get_run_details has no response_model — it returns a raw
        # {"run_info": ..., "stains": [...]} dict, not the run object directly.
        assert r.status_code == 200
        body = r.json()
        assert body["run_info"]["id"] == created["id"]
        assert body["stains"][0]["id"] == stain.id

    def test_update_status_missing_run_returns_404(self, pathologist_client):
        r = pathologist_client.patch("/stain-runs/999999/status", params={"status": "cancelled"})
        assert r.status_code == 404

    def test_update_status(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
        created = pathologist_client.post("/stain-runs", json={"stain_ids": [stain.id]}).json()

        r = pathologist_client.patch(f"/stain-runs/{created['id']}/status", params={"status": "cancelled"})

        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"

    def test_filter_by_test_id(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
        pathologist_client.post("/stain-runs", json={"stain_ids": [stain.id]})

        r = pathologist_client.get("/stain-runs", params={"test_id": he_test.id})

        assert r.status_code == 200
        assert len(r.json()) >= 1
