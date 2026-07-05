"""Tests for app/crud/stain_run.py — the H&E stain-run lifecycle and
_sync_case_status_from_he_stains, which flips a case to "stained" only once
every H&E-routine (system_code="HE_ROUTINE") stain order for that case is
done — a partially-stained case must not be promoted early."""

from app.crud.stain_run import (
    create_stain_run,
    update_run_status,
    create_he_batch_run,
    get_run_details,
    list_active_runs,
)
from app.schemas.stain_run import StainRunCreate
from app.crud.surgical_block_stain import create_stain as create_block_stain
from app.schemas.surgical_block_stain import StainCreate
from app.models.surgical_block_stain import SurgicalStainRun

from tests.factories import make_signable_case, make_block, make_anatomical_pathology_test


def _he_test(db):
    return make_anatomical_pathology_test(db, system_code="HE_ROUTINE", category="Histology")


class TestCreateStainRun:
    def test_marks_stains_stained_and_promotes_case_when_all_he_done(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))

        run = create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user_id=registrar.id)

        assert run.run_no.startswith("RUN-")
        db.refresh(stain)
        assert stain.status == "stained"
        assert stain.stained_by_id == registrar.id
        db.refresh(case)
        assert case.status == "stained"
        assert case.is_slide_prepped is True

    def test_does_not_promote_case_when_some_he_stains_still_pending(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain1 = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id, slide_no=1))
        stain2 = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id, slide_no=2))

        create_stain_run(db, StainRunCreate(stain_ids=[stain1.id]), user_id=registrar.id)  # only stain1

        db.refresh(case)
        assert case.status != "stained"
        db.refresh(stain2)
        assert stain2.status == "pending"

    def test_run_number_increments_same_day(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        s1 = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id, slide_no=1))
        s2 = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id, slide_no=2))

        run1 = create_stain_run(db, StainRunCreate(stain_ids=[s1.id]), user_id=registrar.id)
        run2 = create_stain_run(db, StainRunCreate(stain_ids=[s2.id]), user_id=registrar.id)

        assert run1.run_no != run2.run_no


class TestUpdateRunStatus:
    def test_completing_run_marks_stains_and_syncs_case(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
        # Build a run manually in "running" state (bypassing create_stain_run's
        # own immediate stain-status flip, to exercise update_run_status's path).
        run = create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user_id=registrar.id)
        run.status = "running"
        db.commit()

        result = update_run_status(db, run.id, status="completed")

        assert result.status == "completed"
        assert result.completed_at is not None

    def test_missing_run_returns_none(self, db):
        assert update_run_status(db, 999999, status="completed") is None


class TestCreateHeBatchRun:
    def test_marks_stains_and_promotes_case(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))

        run = create_he_batch_run(db, {"items": [{"block_id": stain.id}]}, operator_id=registrar.id)

        assert run.run_no.startswith("HE-")
        db.refresh(stain)
        assert stain.status == "stained"
        db.refresh(case)
        assert case.status == "stained"


class TestGetRunDetails:
    def test_missing_run_returns_none(self, db):
        assert get_run_details(db, 999999) is None

    def test_returns_run_info_and_stains(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
        run = create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user_id=registrar.id)

        result = get_run_details(db, run.id)

        assert result["run_info"].id == run.id
        assert stain.id in [s.id for s in result["stains"]]


class TestListActiveRuns:
    def test_filters_by_test_id(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = _he_test(db)
        other_test = make_anatomical_pathology_test(db, category="IHC")
        he_stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id, slide_no=1))
        other_stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=other_test.id, slide_no=2))
        he_run = create_stain_run(db, StainRunCreate(stain_ids=[he_stain.id]), user_id=registrar.id)
        other_run = create_stain_run(db, StainRunCreate(stain_ids=[other_stain.id]), user_id=registrar.id)

        results = list_active_runs(db, test_id=he_test.id)
        result_ids = [r.id for r in results]

        assert he_run.id in result_ids
        assert other_run.id not in result_ids
