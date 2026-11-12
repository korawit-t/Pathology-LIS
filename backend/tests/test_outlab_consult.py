"""
Unit tests for app/crud/outlab_consult.py — the shipment-run (OutlabConsultRun)
lifecycle for Surgical cases, including the deliberate decoupling between a
run's own status ("sent"/"received") and the underlying case's consult_status
("pending"/"processing"/"received"), and the live-status enrichment added for
the Case Tracking "Result Status" column.
"""

import pytest

from app.crud.outlab_consult import (
    create_consult_run,
    receive_consult_run,
    delete_consult_run,
    get_consult_runs,
)
from app.schemas.outlab_consult import OutlabConsultRunCreate, CaseSelection
from app.models.outlab_consult import OutlabConsultRun
from app.models.surgical_case import SurgicalCase
from tests.factories import make_bare_case


@pytest.fixture
def surgical_case(db, admin_user):
    user, _ = admin_user
    return make_bare_case(db, registrar_id=user.id)


def _create_run_for(db, operator_id, case):
    payload = OutlabConsultRunCreate(
        destination_lab="Test Reference Lab",
        cases=[
            CaseSelection(
                case_type="surgical",
                case_id=case.id,
                accession_no=case.accession_no,
                patient_name="Test Patient",
            )
        ],
    )
    return create_consult_run(db, payload, operator_id=operator_id)


class TestCreateConsultRun:
    def test_sets_case_consult_status_processing_and_creates_detail(self, db, admin_user, surgical_case):
        user, _ = admin_user
        run = _create_run_for(db, user.id, surgical_case)

        assert run.status == "sent"
        assert len(run.details) == 1
        assert run.details[0].case_id == surgical_case.id

        db.refresh(surgical_case)
        assert surgical_case.consult_status == "processing"


class TestDeleteConsultRun:
    def test_reverts_case_to_pending_and_removes_run(self, db, admin_user, surgical_case):
        user, _ = admin_user
        run = _create_run_for(db, user.id, surgical_case)
        run_id = run.id

        delete_consult_run(db, run_id)

        db.refresh(surgical_case)
        assert surgical_case.consult_status == "pending"
        assert db.query(OutlabConsultRun).filter(OutlabConsultRun.id == run_id).first() is None

    def test_missing_run_raises_404(self, db):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            delete_consult_run(db, 999999)
        assert exc.value.status_code == 404


class TestReceiveConsultRun:
    def test_marks_run_received_without_touching_case_consult_status(self, db, admin_user, surgical_case):
        user, _ = admin_user
        run = _create_run_for(db, user.id, surgical_case)

        updated = receive_consult_run(db, run.id, user_id=user.id)

        assert updated.status == "received"
        assert updated.received_at is not None

        # Regression test: marking the *run* received must not advance the
        # case's own consult_status — that only happens when the pathologist
        # actually signs off the report (finalize_and_snapshot_orchestrator).
        db.refresh(surgical_case)
        assert surgical_case.consult_status == "processing"

    def test_missing_run_raises_404(self, db, admin_user):
        from fastapi import HTTPException
        user, _ = admin_user
        with pytest.raises(HTTPException) as exc:
            receive_consult_run(db, 999999, user_id=user.id)
        assert exc.value.status_code == 404


class TestGetConsultRunsLiveStatus:
    def test_detail_status_follows_its_own_consult_round(self, db, admin_user, surgical_case):
        """A run line belongs to one consult round. Once that round is
        released and the case opens the next one, the case-level status
        describes the new round — the old run's line must still read received."""
        from app.crud import outlab_consult_request as consult_crud
        from app.models.outlab_consult_request import OutlabConsultRequest

        user, _ = admin_user
        run = _create_run_for(db, user.id, surgical_case)

        first = db.query(OutlabConsultRequest).filter_by(case_type="surgical", case_id=surgical_case.id).one()
        first.status = "reported"
        consult_crud.open_consult(db, "surgical", surgical_case, reason="Second opinion", user_id=user.id)
        db.commit()
        db.refresh(surgical_case)
        assert surgical_case.consult_status == "pending"  # the case is on round 2 now

        runs = get_consult_runs(db, skip=0, limit=500)
        matching = next(r for r in runs if r.id == run.id)
        detail = next(d for d in matching.details if d.case_id == surgical_case.id)

        assert detail.case_consult_status == "received"
        assert detail.consult_no == f"{surgical_case.accession_no}-C1"
        # The run's own status is untouched by the case-level change.
        assert matching.status == "sent"

    def test_consult_pdf_uploaded_reflects_the_rounds_result(self, db, admin_user, surgical_case):
        from app.models.outlab_consult_request import OutlabConsultRequest

        user, _ = admin_user
        run = _create_run_for(db, user.id, surgical_case)

        runs = get_consult_runs(db, skip=0, limit=500)
        matching = next(r for r in runs if r.id == run.id)
        detail = next(d for d in matching.details if d.case_id == surgical_case.id)
        assert detail.consult_pdf_uploaded is False

        consult = db.query(OutlabConsultRequest).filter_by(case_type="surgical", case_id=surgical_case.id).one()
        consult.result_pdf_path = "/tmp/fake-consult.pdf"
        db.commit()

        runs = get_consult_runs(db, skip=0, limit=500)
        matching = next(r for r in runs if r.id == run.id)
        detail = next(d for d in matching.details if d.case_id == surgical_case.id)
        assert detail.consult_pdf_uploaded is True
