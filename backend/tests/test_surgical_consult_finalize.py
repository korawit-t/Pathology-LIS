"""
Core regression suite for the Surgical Out-Lab Consult finalize lifecycle:
sign off -> flag for consult -> dispatch -> upload PDF -> a *different*
pathologist finalizes the consult round.

Covers three bugs found and fixed by manual testing (none were caught by an
existing test before this file):
  - Fix 1  : Sign-off stayed locked forever after the consult PDF was
             uploaded, for a case already signed out in a prior round
             (frontend-only fix, not exercised here — see consultLockState.test.ts).
  - Fix 1b : Round 2's report pulled in round 1's signer name too, because the
             "who signed this report" query was scoped by case_id+diagnosis_order
             instead of the specific report_id (a second consult round reuses
             the same diagnosis_order — no new SurgicalDiagnosis row is created).
  - Fix 2  : the is_consult_dispatched branch never applied is_pending/
             pending_reason from the finalize payload at all, so even a
             correctly-submitted `is_pending=False` (from Fix 2b's frontend
             default) had no effect — the case kept the stale True forever.
  - Also a regression test for the SQLAlchemy identity-map crash that first
    surfaced when round 2 became reachable (redundant db.add(db_case) calls
    conflicting with a freshly-flushed report row in the same transaction).
"""

import pytest

from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.crud.outlab_consult import create_consult_run
from app.schemas.outlab_consult import OutlabConsultRunCreate, CaseSelection
from app.models.surgical_report import ReportStatus

from tests.factories import make_signable_case, build_bulk_save_payload as _build_payload, clear_system_settings


class TestRoundOneFinalize:
    def test_publishes_report_and_signs_out_case(self, db, admin_user, two_pathologists):
        # This test assumes the default (no approval gate) — don't let a
        # SystemSetting row left over from another test file (e.g.
        # enable_approve_system=True) route this straight to PENDING_APPROVAL.
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = _build_payload(case.id, specimen.id, path1.id)
        report = finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        assert report.status == ReportStatus.PUBLISHED
        db.refresh(case)
        assert case.status == "signed out"


class TestConsultRoundTrip:
    def test_flag_dispatch_upload_and_second_finalize(self, db, admin_user, two_pathologists):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        # --- Round 1: sign off, flagging the case for out-lab consult ---
        round1_payload = _build_payload(
            case.id, specimen.id, path1.id,
            is_out_lab_consult=True,
            consult_reason="Need subspecialty opinion",
            is_pending=True,
            pending_reason="Out-Lab Consult — awaiting results",
        )
        report1 = finalize_and_snapshot_orchestrator(db, case.id, round1_payload, path1.id)
        assert report1.status == ReportStatus.PUBLISHED

        db.refresh(case)
        assert case.is_out_lab_consult is True
        assert case.consult_status == "pending"   # flagged only, not dispatched yet
        assert case.is_pending is True

        # --- Dispatch: create a consult run ---
        run_payload = OutlabConsultRunCreate(
            destination_lab="Reference Lab",
            cases=[CaseSelection(case_type="surgical", case_id=case.id, accession_no=case.accession_no)],
        )
        create_consult_run(db, run_payload, operator_id=registrar.id)
        db.refresh(case)
        assert case.consult_status == "processing"

        # --- Upload the returned consult PDF (direct field set — upload
        # endpoint itself is covered by test_consult_pdf.py) ---
        case.consult_pdf_path = "/tmp/fake_consult.pdf"
        db.commit()

        # --- Round 2: a DIFFERENT pathologist finalizes the consult round ---
        # is_pending=False here mirrors what the real Finalize modal now submits
        # by default once the consult round is resolved (Fix 2b, frontend).
        # Before Fix 2 (backend), this whole is_consult_dispatched branch never
        # applied is_pending/pending_reason at all, so submitting False here
        # would have silently had no effect — the case would keep the stale
        # True from round 1 forever. That's what this test guards against.
        round2_payload = _build_payload(
            case.id, specimen.id, path2.id,
            is_pending=False,
            pending_reason=None,
        )
        report2 = finalize_and_snapshot_orchestrator(db, case.id, round2_payload, path2.id)  # must not raise

        assert report2.status == ReportStatus.PUBLISHED
        assert report2.id != report1.id

        # Fix 1b: round 2's signer attribution must not leak round 1's signer.
        assert path2.full_name in report2.pathologist_name
        assert path1.full_name not in report2.pathologist_name

        # Fix 2: pending flag clears once the consult round is finalized.
        db.refresh(case)
        assert case.is_pending is False
        assert case.pending_reason is None
        assert case.consult_status == "received"
