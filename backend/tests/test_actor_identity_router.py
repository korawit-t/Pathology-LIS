"""HTTP-level regression tests: two endpoints used to trust an actor-identity
field from the request body instead of deriving it from the authenticated
JWT, letting any caller attribute an action to a different user (forgeable
audit trail) — the same class of bug already fixed once in stain_run.py.

- POST /embedding/runs used payload.user_id.
- PATCH /tissue-processing/{run_id}/status used status_update.completed_by_id.

Both now always use current_user.id, ignoring whatever the client sends.
"""

from datetime import datetime

from app.models.tissue_processing import TissueProcessingRun
from app.models.embedding import EmbeddingRun
from tests.factories import make_signable_case, make_block


class TestEmbeddingRunActorIdentity:
    def test_forged_user_id_in_body_is_ignored(self, admin_client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        other_user, _ = pathologist_user

        response = admin_client.post(
            "/embedding/runs",
            json={"user_id": other_user.id, "station_id": "ST-1"},
        )

        assert response.status_code == 200
        run = db.query(EmbeddingRun).filter(EmbeddingRun.id == response.json()["id"]).first()
        assert run is not None
        assert run.user_id == registrar.id
        assert run.user_id != other_user.id


class TestTissueProcessingRunActorIdentity:
    def test_forged_completed_by_id_in_body_is_ignored(
        self, admin_client, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        other_user, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")

        create_resp = admin_client.post(
            "/tissue-processing",
            json={
                "processor_name": "Machine-1",
                "program_name": "Program-1",
                "start_at": datetime.now().isoformat(),
                "block_ids": [block.id],
                "created_by_id": registrar.id,
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        run_id = create_resp.json()["id"]

        status_resp = admin_client.patch(
            f"/tissue-processing/{run_id}/status",
            json={"status": "completed", "completed_by_id": other_user.id},
        )
        assert status_resp.status_code == 200, status_resp.text

        run = db.query(TissueProcessingRun).filter(TissueProcessingRun.id == run_id).first()
        assert run.completed_by_id == registrar.id
        assert run.completed_by_id != other_user.id
