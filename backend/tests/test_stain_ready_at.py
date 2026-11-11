"""
SurgicalBlockStain.ready_at — when a slide became readable. Set wherever the
status turns "stained", cleared when it goes back to pending/sent; backfilled
by alembic revision 1e7d68d4be84.
"""

import importlib.util
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import text

from app.crud import stain_run as stain_run_crud
from app.crud import surgical_block_stain as stain_crud
from app.models.surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalOutlabRun,
    SurgicalOutlabRunDetail,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)
from app.schemas.stain_run import StainRunCreate
from app.schemas.surgical_block_stain import OutlabRunCreate, StainUpdate

from tests.factories import (
    make_anatomical_pathology_test,
    make_block,
    make_block_stain,
    make_signable_case,
)


def _ihc(db, is_external=True):
    return make_anatomical_pathology_test(
        db, category="IHC", name=f"IHC-{uuid.uuid4().hex[:6]}", is_external=is_external
    )


def _block(db, registrar_id):
    _, specimen = make_signable_case(db, registrar_id=registrar_id)
    return make_block(db, specimen.id, status="sectioned")


def _fresh(db, stain):
    db.expire_all()
    return db.get(SurgicalBlockStain, stain.id)


class TestOutlab:
    def test_receive_stamps_the_receive_time_and_a_redo_clears_it(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db).id)

        run = stain_crud.create_outlab_run(db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user.id)
        assert (_fresh(db, stain).status, _fresh(db, stain).ready_at) == ("sent", None)

        stain_crud.receive_outlab_run(db, run.id, user.id)
        received_at = db.query(SurgicalOutlabRunDetail.received_at).filter_by(stain_id=stain.id).scalar()
        s = _fresh(db, stain)
        assert s.status == "stained"
        assert s.ready_at == received_at

        # Sent out again for a redo: no longer readable until it's back.
        stain_crud.create_outlab_run(db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user.id)
        assert (_fresh(db, stain).status, _fresh(db, stain).ready_at) == ("sent", None)

    def test_deleting_the_run_clears_it(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db).id)
        run = stain_crud.create_outlab_run(db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user.id)
        stain_crud.receive_outlab_run(db, run.id, user.id)

        stain_crud.delete_outlab_run(db, run.id)

        assert (_fresh(db, stain).status, _fresh(db, stain).ready_at) == ("pending", None)


class TestInHouseRun:
    def test_run_start_stamps_it_and_completion_moves_it(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db, is_external=False).id)

        run = stain_run_crud.create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user.id)
        started = _fresh(db, stain).ready_at
        assert _fresh(db, stain).status == "stained"
        assert started is not None

        stain_run_crud.update_run_status(db, run.id, "completed")
        completed_at = db.get(SurgicalStainRun, run.id).completed_at
        assert _fresh(db, stain).ready_at == completed_at
        assert completed_at >= started

    def test_completion_leaves_a_slide_already_out_alone(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db, is_external=False).id)
        run = stain_run_crud.create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user.id)
        s = _fresh(db, stain)
        s.reported_at = datetime(2026, 11, 1, 10)
        ready_before = s.ready_at
        db.commit()

        stain_run_crud.update_run_status(db, run.id, "completed")

        assert _fresh(db, stain).ready_at == ready_before

    def test_deleting_the_run_clears_it(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db, is_external=False).id)
        run = stain_run_crud.create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user.id)

        stain_crud.delete_staining_run(db, run.id)

        assert (_fresh(db, stain).status, _fresh(db, stain).ready_at) == ("pending", None)


class TestManualStatus:
    def test_patch_sets_it_once_and_clears_it_on_the_way_back(self, db, admin_user):
        user, _ = admin_user
        stain = make_block_stain(db, _block(db, user.id).id, _ihc(db).id)

        stain_crud.update_stain(db, stain.id, StainUpdate(status="stained"), user.id)
        first = _fresh(db, stain).ready_at
        assert first is not None

        # stained → completed (Mark Reviewed): still the same readable slide
        stain_crud.update_stain(db, stain.id, StainUpdate(status="completed"), user.id)
        assert _fresh(db, stain).ready_at == first

        stain_crud.update_stain_status(db, stain.id, "pending")
        assert _fresh(db, stain).ready_at is None


def _load_backfill_sql() -> str:
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic" / "versions" / "1e7d68d4be84_add_ready_at_to_surgical_block_stains.py"
    )
    spec = importlib.util.spec_from_file_location("rev_1e7d68d4be84", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_SQL


class TestBackfill:
    def test_backfill_derives_it_from_the_run_tables(self, db, admin_user):
        user, _ = admin_user
        block = _block(db, user.id)
        t = _ihc(db)
        t0 = datetime(2020, 2, 3, 9)

        received = make_block_stain(db, block.id, t.id, slide_no=1, status="stained")
        out = SurgicalOutlabRun(run_no=f"OUTLAB-{uuid.uuid4().hex[:8]}", sent_at=t0)
        db.add(out)
        db.flush()
        db.add(SurgicalOutlabRunDetail(outlab_run_id=out.id, stain_id=received.id, received_at=datetime(2020, 2, 10, 9)))

        started_only = make_block_stain(db, block.id, t.id, slide_no=2, status="completed")
        completed = make_block_stain(db, block.id, t.id, slide_no=3, status="stained")
        for stain, finished in ((started_only, None), (completed, datetime(2020, 2, 4, 15))):
            run = SurgicalStainRun(run_no=f"RUN-{uuid.uuid4().hex[:8]}", started_at=t0, completed_at=finished)
            db.add(run)
            db.flush()
            db.add(SurgicalStainRunDetail(stain_run_id=run.id, stain_id=stain.id))

        by_hand = make_block_stain(db, block.id, t.id, slide_no=4, status="stained")
        not_ready = make_block_stain(db, block.id, t.id, slide_no=5, status="pending")
        already = make_block_stain(db, block.id, t.id, slide_no=6, status="stained")
        already.ready_at = datetime(2020, 3, 1, 9)
        db.commit()

        seeded = {
            "received": received.id, "started_only": started_only.id, "completed": completed.id,
            "by_hand": by_hand.id, "not_ready": not_ready.id, "already": already.id,
        }
        try:
            db.execute(text(_load_backfill_sql()))
            db.expire_all()
            got = {name: db.get(SurgicalBlockStain, i).ready_at for name, i in seeded.items()}
        finally:
            db.rollback()

        assert got == {
            "received": datetime(2020, 2, 10, 9),
            "started_only": t0,
            "completed": datetime(2020, 2, 4, 15),
            "by_hand": None,       # no record of when — left unknown
            "not_ready": None,
            "already": datetime(2020, 3, 1, 9),
        }
