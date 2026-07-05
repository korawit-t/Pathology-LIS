"""Tests for app/crud/surgical_block_stain.py — case-status derivation from
pending IHC/Histochem stains, the terminal-status guard, and the outlab-run
receive/status-recompute lifecycle (mirrors app/crud/outlab_consult.py's
already-tested pattern for the case-level consult flow)."""

import uuid

from app.crud.surgical_block_stain import (
    create_stain,
    update_stain,
    delete_stain,
    create_outlab_run,
    receive_outlab_run,
    receive_outlab_run_details,
    delete_outlab_run,
    get_additional_stains_by_case,
    _recompute_outlab_run_status,
)
from app.schemas.surgical_block_stain import StainCreate, StainUpdate, OutlabRunCreate
from app.schemas.ihc import IHCResultUpsert
from app.crud.ihc import upsert_result
from app.models.surgical_block_stain import SurgicalBlockStain, SurgicalOutlabRun, SurgicalOutlabRunDetail

from tests.factories import make_signable_case, make_block, make_block_stain, make_anatomical_pathology_test


class TestCreateStainCaseStatusUpdate:
    def test_ihc_test_sets_case_pending_immuno(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC")

        create_stain(db, StainCreate(block_id=block.id, test_id=ihc_test.id))

        db.refresh(case)
        assert case.status == "pending immuno"

    def test_histochem_test_sets_case_pending_special_stains(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        histo_test = make_anatomical_pathology_test(db, category="Histochem")

        create_stain(db, StainCreate(block_id=block.id, test_id=histo_test.id))

        db.refresh(case)
        assert case.status == "pending special stains"

    def test_terminal_status_case_is_not_overwritten(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        db.commit()
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC")

        create_stain(db, StainCreate(block_id=block.id, test_id=ihc_test.id))

        db.refresh(case)
        assert case.status == "signed out"

    def test_recut_order_does_not_change_case_status(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "grossed"
        db.commit()
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC")

        create_stain(db, StainCreate(block_id=block.id, test_id=ihc_test.id, is_recut=True))

        db.refresh(case)
        assert case.status == "grossed"


class TestUpdateStain:
    def test_marking_stained_stamps_stained_by(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = create_stain(db, StainCreate(block_id=block.id))

        updated = update_stain(db, stain.id, StainUpdate(status="stained"), user_id=registrar.id)

        assert updated.stained_by_id == registrar.id

    def test_missing_stain_returns_none(self, db):
        assert update_stain(db, 999999, StainUpdate(status="stained")) is None


class TestDeleteStain:
    def test_recomputes_case_status_after_deletion(self, db, admin_user):
        """Regression test: _update_case_status_from_block_stains used to only
        ever SET the pending-immuno/pending-special-stains flag, never clear
        it — deleting the last pending IHC stain left the case stuck forever.
        Fixed to revert to "stained" once no pending IHC/Histochem remain."""
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC")
        stain = create_stain(db, StainCreate(block_id=block.id, test_id=ihc_test.id))
        db.refresh(case)
        assert case.status == "pending immuno"

        result = delete_stain(db, stain.id)

        assert result is True
        db.refresh(case)
        assert case.status == "stained"

    def test_missing_stain_returns_false(self, db):
        assert delete_stain(db, 999999) is False


class TestOutlabRunLifecycle:
    def test_create_run_marks_stains_sent(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = create_stain(db, StainCreate(block_id=block.id))

        run = create_outlab_run(
            db, OutlabRunCreate(destination_lab="Reference Lab", stain_ids=[stain.id]), user_id=registrar.id
        )

        assert run.status == "sent"
        db.refresh(stain)
        assert stain.status == "sent"

    def test_receive_all_flips_run_and_stains_to_received(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = create_stain(db, StainCreate(block_id=block.id))
        run = create_outlab_run(
            db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user_id=registrar.id
        )

        result = receive_outlab_run(db, run.id, user_id=registrar.id)

        assert result.status == "received"
        assert result.received_at is not None
        db.refresh(stain)
        assert stain.status == "stained"

    def test_partial_receive_sets_run_status_partial(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain1 = create_stain(db, StainCreate(block_id=block.id, slide_no=1))
        stain2 = create_stain(db, StainCreate(block_id=block.id, slide_no=2))
        run = create_outlab_run(
            db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain1.id, stain2.id]), user_id=registrar.id
        )
        detail1 = db.query(SurgicalOutlabRunDetail).filter(
            SurgicalOutlabRunDetail.outlab_run_id == run.id, SurgicalOutlabRunDetail.stain_id == stain1.id
        ).first()

        result = receive_outlab_run_details(db, run.id, user_id=registrar.id, detail_ids=[detail1.id])

        assert result.status == "partial"

    def test_receiving_already_received_detail_is_idempotent(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = create_stain(db, StainCreate(block_id=block.id))
        run = create_outlab_run(
            db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user_id=registrar.id
        )
        receive_outlab_run(db, run.id, user_id=registrar.id)
        db.refresh(run)
        first_received_at = run.received_at

        receive_outlab_run(db, run.id, user_id=registrar.id)  # receive again

        db.refresh(run)
        assert run.received_at == first_received_at  # untouched, not re-stamped

    def test_delete_run_reverts_stains_to_pending(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = create_stain(db, StainCreate(block_id=block.id))
        run = create_outlab_run(
            db, OutlabRunCreate(destination_lab="Lab", stain_ids=[stain.id]), user_id=registrar.id
        )

        result = delete_outlab_run(db, run.id)

        assert result is True
        db.refresh(stain)
        assert stain.status == "pending"

    def test_delete_missing_run_returns_false(self, db):
        assert delete_outlab_run(db, 999999) is False


class TestRecomputeOutlabRunStatus:
    def test_no_details_leaves_status_untouched(self):
        class FakeRun:
            details = []
            status = "sent"
        run = FakeRun()
        _recompute_outlab_run_status(run)
        assert run.status == "sent"


class TestGetAdditionalStainsByCaseIHCInterpreted:
    def test_case_with_no_ihc_stains_is_not_applicable(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        histo_test = make_anatomical_pathology_test(db, category="Histochem", name="PAS")
        make_block_stain(db, block.id, test_id=histo_test.id, status="stained")

        groups = get_additional_stains_by_case(db)

        group = next(g for g in groups if g["case_id"] == case.id)
        assert group["ihc_interpreted"] is None

    def test_case_with_all_ihc_markers_selected_is_true(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="CK7")
        make_block_stain(db, block.id, test_id=ihc_test.id, status="stained")

        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))

        groups = get_additional_stains_by_case(db)

        group = next(g for g in groups if g["case_id"] == case.id)
        assert group["ihc_interpreted"] is True

    def test_case_with_some_ihc_markers_unselected_is_false(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ck7_test = make_anatomical_pathology_test(db, category="IHC", name="CK7")
        ck20_test = make_anatomical_pathology_test(db, category="IHC", name="CK20")
        make_block_stain(db, block.id, test_id=ck7_test.id, status="stained")
        make_block_stain(db, block.id, test_id=ck20_test.id, status="stained")

        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ck7_test.id, selected_option="positive",
        ))

        groups = get_additional_stains_by_case(db)

        group = next(g for g in groups if g["case_id"] == case.id)
        assert group["ihc_interpreted"] is False
