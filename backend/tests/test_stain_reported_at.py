"""
SurgicalBlockStain.reported_at — the "result is out" cut-off for additional
stains (IHC / special stains), stamped at the pathologist's sign-off rather
than by the IHC panel, because some pathologists type IHC results straight
into the diagnosis text.

Covers mark_case_stains_reported through the real finalize path, and the
backfill in alembic revision 54bbe1c9fc1f run against seeded rows.
"""

import importlib.util
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app.crud.surgical_block_stain import get_case_signoff_stains
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.models.surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalOutlabRun,
    SurgicalOutlabRunDetail,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import ReportStatus, SurgicalReport

from tests.factories import (
    build_bulk_save_payload,
    make_anatomical_pathology_test,
    make_block,
    make_block_stain,
    make_signable_case,
    make_system_setting,
)


@pytest.fixture(autouse=True)
def _plain_signoff_settings(db):
    # SystemSetting is a singleton other tests rewrite; pin the branch the
    # tests below expect (one signer publishes, no approval step).
    make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=False)


def _ihc_test(db, **kw):
    return make_anatomical_pathology_test(
        db, category="IHC", name=f"IHC-{uuid.uuid4().hex[:8]}", is_external=True, **kw
    )


def _signed_at(db, case_id, order=1):
    diag = (
        db.query(SurgicalDiagnosis)
        .filter(
            SurgicalDiagnosis.case_id == case_id,
            SurgicalDiagnosis.diagnosis_order == order,
            SurgicalDiagnosis.status == "signed",
        )
        .one()
    )
    return diag.diagnosis_at


def _reload(db, *stains):
    db.expire_all()
    return [db.get(SurgicalBlockStain, s.id) for s in stains]


class TestStampAtSignOff:
    def test_complete_signoff_reports_every_ready_slide(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc = _ihc_test(db)
        he = make_anatomical_pathology_test(db, category="Histochem", system_code="HE_ROUTINE", name="H&E")
        molecular = make_anatomical_pathology_test(db, category="Molecular", name=f"MOL-{uuid.uuid4().hex[:8]}")

        typed_in_text = make_block_stain(db, block.id, ihc.id, slide_no=1, status="stained")
        via_panel = make_block_stain(db, block.id, ihc.id, slide_no=2, status="completed")
        still_at_outlab = make_block_stain(db, block.id, ihc.id, slide_no=3, status="sent")
        not_ordered_yet = make_block_stain(db, block.id, ihc.id, slide_no=4, status="pending")
        routine_he = make_block_stain(db, block.id, he.id, slide_no=5, status="stained")
        molecular_order = make_block_stain(db, block.id, molecular.id, slide_no=6, status="stained")
        recut = make_block_stain(db, block.id, ihc.id, slide_no=7, status="stained", is_recut=True)

        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )
        signed_at = _signed_at(db, case.id)

        typed_in_text, via_panel, still_at_outlab, not_ordered_yet, routine_he, molecular_order, recut = _reload(
            db, typed_in_text, via_panel, still_at_outlab, not_ordered_yet, routine_he, molecular_order, recut
        )
        for s in (typed_in_text, via_panel):
            assert s.status == "completed"
            assert s.reported_at == signed_at
        assert (still_at_outlab.status, still_at_outlab.reported_at) == ("sent", None)
        assert (not_ordered_yet.status, not_ordered_yet.reported_at) == ("pending", None)
        for s in (routine_he, molecular_order, recut):
            assert (s.status, s.reported_at) == ("stained", None)

    def test_pending_signoff_reports_only_reviewed_slides(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc = _ihc_test(db)
        unreviewed = make_block_stain(db, block.id, ihc.id, slide_no=1, status="stained")
        reviewed = make_block_stain(db, block.id, ihc.id, slide_no=2, status="completed")

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id, is_pending=True, pending_reason="Awaiting IHC"
        )
        finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        unreviewed, reviewed = _reload(db, unreviewed, reviewed)
        assert (unreviewed.status, unreviewed.reported_at) == ("stained", None)
        assert reviewed.status == "completed"
        assert reviewed.reported_at == _signed_at(db, case.id)

    def test_addendum_keeps_first_time_out_and_stamps_new_arrivals(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc = _ihc_test(db)
        first_round = make_block_stain(db, block.id, ihc.id, slide_no=1, status="stained")
        came_back_later = make_block_stain(db, block.id, ihc.id, slide_no=2, status="sent")

        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )
        first_signed_at = _signed_at(db, case.id, order=1)

        # The outlab slide comes back; an Addendum carries it.
        came_back_later = db.get(SurgicalBlockStain, came_back_later.id)
        came_back_later.status = "stained"
        db.commit()
        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )
        addendum_signed_at = _signed_at(db, case.id, order=2)

        first_round, came_back_later = _reload(db, first_round, came_back_later)
        assert first_round.reported_at == first_signed_at
        assert came_back_later.status == "completed"
        assert came_back_later.reported_at == addendum_signed_at
        assert first_signed_at <= addendum_signed_at

    def test_unfinished_cosign_reports_nothing(self, db, admin_user, two_pathologists):
        make_system_setting(db, require_all_pathologists_sign=True)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ready = make_block_stain(db, block.id, _ihc_test(db).id, status="stained")

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        report = finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        assert report.status == ReportStatus.DRAFT
        (ready,) = _reload(db, ready)
        assert (ready.status, ready.reported_at) == ("stained", None)

    def test_approve_system_counts_the_pathologist_sign_not_the_approval(self, db, admin_user, two_pathologists):
        make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=True)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ready = make_block_stain(db, block.id, _ihc_test(db).id, status="stained")

        report = finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )

        assert report.status == ReportStatus.PENDING_APPROVAL
        (ready,) = _reload(db, ready)
        assert ready.status == "completed"
        assert ready.reported_at == _signed_at(db, case.id)


class TestSignOffList:
    """GET /surgical-block-stains/sign-off/{case_id} — what the sign-off page
    lists. It must be exactly the set a sign-off can stamp, so the page never
    promises to record a slide that signing then skips (or the reverse)."""

    def _case(self, db, registrar_id):
        case, specimen = make_signable_case(db, registrar_id=registrar_id)
        return case, make_block(db, specimen.id)

    def test_lists_the_stains_a_signoff_can_report(self, db, admin_user):
        registrar, _ = admin_user
        case, block = self._case(db, registrar.id)
        ihc = _ihc_test(db)
        he = make_anatomical_pathology_test(db, category="Histochem", system_code="HE_ROUTINE", name="H&E")
        molecular = make_anatomical_pathology_test(db, category="Molecular", name=f"MOL-{uuid.uuid4().hex[:8]}")

        ready = make_block_stain(db, block.id, ihc.id, slide_no=1, status="stained")
        at_outlab = make_block_stain(db, block.id, ihc.id, slide_no=2, status="sent")
        reported = make_block_stain(db, block.id, ihc.id, slide_no=3, status="completed")
        reported.reported_at = datetime(2026, 11, 1, 10, 0)
        db.commit()
        make_block_stain(db, block.id, he.id, slide_no=4, status="stained")
        make_block_stain(db, block.id, molecular.id, slide_no=5, status="pending")
        make_block_stain(db, block.id, ihc.id, slide_no=6, status="stained", is_recut=True)

        rows = get_case_signoff_stains(db, case.id)

        assert [r["stain_id"] for r in rows] == [ready.id, at_outlab.id, reported.id]
        assert rows[0] == {
            "stain_id": ready.id,
            "block_code": "A1",
            "test_name": ihc.name,
            "category": "IHC",
            "status": "stained",
            "is_external": True,
            "reported_at": None,
        }
        assert rows[2]["reported_at"] == datetime(2026, 11, 1, 10, 0)

    def test_route_serves_the_list(self, db, admin_user, pathologist_client):
        registrar, _ = admin_user
        case, block = self._case(db, registrar.id)
        ready = make_block_stain(db, block.id, _ihc_test(db).id, status="stained")

        r = pathologist_client.get(f"/surgical-block-stains/sign-off/{case.id}")

        assert r.status_code == 200, r.text
        assert [(s["stain_id"], s["status"], s["reported_at"]) for s in r.json()] == [(ready.id, "stained", None)]


def _load_backfill_sql() -> str:
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic" / "versions" / "54bbe1c9fc1f_add_reported_at_to_surgical_block_stains.py"
    )
    spec = importlib.util.spec_from_file_location("rev_54bbe1c9fc1f", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_SQL


class TestBackfill:
    """Runs the migration's UPDATE against seeded history, then rolls it back
    so rows other tests committed are left as they were."""

    T0 = datetime(2020, 1, 6, 9, 0)

    def _outlab(self, db, stain, received_at):
        run = SurgicalOutlabRun(run_no=f"OUTLAB-{uuid.uuid4().hex[:8]}", status="received", sent_at=self.T0)
        db.add(run)
        db.flush()
        db.add(SurgicalOutlabRunDetail(outlab_run_id=run.id, stain_id=stain.id, received_at=received_at))

    def _internal(self, db, stain, started_at, completed_at):
        run = SurgicalStainRun(
            run_no=f"RUN-{uuid.uuid4().hex[:8]}", status="completed",
            started_at=started_at, completed_at=completed_at,
        )
        db.add(run)
        db.flush()
        db.add(SurgicalStainRunDetail(stain_run_id=run.id, stain_id=stain.id))

    def _report(self, db, case, at, status=ReportStatus.PUBLISHED, is_pending=False):
        db.add(SurgicalReport(
            case_id=case.id, hospital_id=case.hospital_id, status=status,
            is_pending=is_pending, reported_at=at,
        ))

    def test_backfill_applies_the_signoff_rule_to_history(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc = _ihc_test(db)
        he = make_anatomical_pathology_test(db, category="Histochem", system_code="HE_ROUTINE", name="H&E")
        day = timedelta(days=1)

        # Report history: a draft (never counts), a pending sign-off, then a
        # complete one.
        self._report(db, case, self.T0 + 1.5 * day, status=ReportStatus.DRAFT)
        self._report(db, case, self.T0 + 2 * day, is_pending=True)
        self._report(db, case, self.T0 + 3 * day)

        typed_in_text = make_block_stain(db, block.id, ihc.id, slide_no=1, status="stained")
        self._outlab(db, typed_in_text, self.T0 + day)
        via_panel = make_block_stain(db, block.id, ihc.id, slide_no=2, status="completed")
        self._outlab(db, via_panel, self.T0 + day)
        back_after_signoff = make_block_stain(db, block.id, ihc.id, slide_no=3, status="stained")
        self._outlab(db, back_after_signoff, self.T0 + 4 * day)
        # In-house run logged at start only → ready when it started.
        internal_started = make_block_stain(db, block.id, ihc.id, slide_no=4, status="stained")
        self._internal(db, internal_started, self.T0, None)
        # In-house run completed after the last sign-off → not out yet, even
        # though it started before.
        internal_finished_late = make_block_stain(db, block.id, ihc.id, slide_no=5, status="stained")
        self._internal(db, internal_finished_late, self.T0, self.T0 + 3.5 * day)
        # No run record at all → the order time is the only evidence.
        no_run_record = make_block_stain(db, block.id, ihc.id, slide_no=6, status="stained")
        no_run_record.created_at = self.T0
        already_stamped = make_block_stain(db, block.id, ihc.id, slide_no=7, status="completed")
        already_stamped.reported_at = self.T0 + 9 * day
        still_at_outlab = make_block_stain(db, block.id, ihc.id, slide_no=8, status="sent")
        self._outlab(db, still_at_outlab, None)
        routine_he = make_block_stain(db, block.id, he.id, slide_no=9, status="stained")
        routine_he.created_at = self.T0
        db.commit()

        seeded = {
            "typed_in_text": typed_in_text.id,
            "via_panel": via_panel.id,
            "back_after_signoff": back_after_signoff.id,
            "internal_started": internal_started.id,
            "internal_finished_late": internal_finished_late.id,
            "no_run_record": no_run_record.id,
            "already_stamped": already_stamped.id,
            "still_at_outlab": still_at_outlab.id,
            "routine_he": routine_he.id,
        }
        try:
            db.execute(text(_load_backfill_sql()))
            db.expire_all()
            got = {
                name: (stain.status, stain.reported_at)
                for name, stain in ((n, db.get(SurgicalBlockStain, i)) for n, i in seeded.items())
            }
        finally:
            db.rollback()

        assert got == {
            # pending sign-off skipped (slide not reviewed) → the complete one
            "typed_in_text": ("completed", self.T0 + 3 * day),
            # reviewed slide → the earlier pending sign-off already carried it
            "via_panel": ("completed", self.T0 + 2 * day),
            "back_after_signoff": ("stained", None),
            "internal_started": ("completed", self.T0 + 3 * day),
            "internal_finished_late": ("stained", None),
            "no_run_record": ("completed", self.T0 + 3 * day),
            "already_stamped": ("completed", self.T0 + 9 * day),
            "still_at_outlab": ("sent", None),
            "routine_he": ("stained", None),
        }
