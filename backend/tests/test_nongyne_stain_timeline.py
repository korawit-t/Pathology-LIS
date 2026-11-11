"""
Non-gyne IHC / special stains get the surgical result timeline
(app/crud/stain_signoff.py): ready_at when the slide is stained, reported_at
at the pathologist's sign-off (publish_nongyne_report), released_at when that
report is published; plus the sign-off page's list, the IHC TAT dashboard
(case_type=nongyne) and the backfill in alembic revision 4ce1135497ee.
"""

import importlib.util
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app.crud import nongyne_cyto_stain as stain_crud
from app.crud.ihc_tat import get_ihc_outstanding, get_ihc_tat
from app.crud.nongyne_cyto_report import process_nongyne_report_approval, publish_nongyne_report
from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.models.nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus
from app.models.nongyne_cyto_stain import NongyneCytologyStain, NongyneStainRun, NongyneStainRunDetail
from app.schemas.nongyne_cyto_stain import NongyneStainUpdate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.schemas.report_approval import ReportApproveRequest

from tests.factories import make_anatomical_pathology_test, make_bare_nongyne_case, make_system_setting


@pytest.fixture(autouse=True)
def _publish_on_signing(db):
    make_system_setting(db, enable_non_gyne_approve_system=False, require_all_non_gyne_sign=False)


def _test(db, category="IHC"):
    return make_anatomical_pathology_test(db, category=category, name=f"{category}-{uuid.uuid4().hex[:6]}")


def _stain(db, case, test, status="pending", slide_no=1):
    s = NongyneCytologyStain(case_id=case.id, test_id=test.id, status=status, slide_no=slide_no)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _case(db, registrar_id):
    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))
    return case


def _sign(db, case, pathologist, **kw):
    return publish_nongyne_report(
        db, case.id, signers=[{"user_id": pathologist.id, "role": "primary"}],
        current_user_id=pathologist.id, **kw,
    )


def _fresh(db, *stains):
    db.expire_all()
    return [db.get(NongyneCytologyStain, s.id) for s in stains]


class TestReady:
    def test_stain_run_stamps_it_and_patch_follows_status(self, db, admin_user):
        user, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=user.id)
        a = _stain(db, case, _test(db), slide_no=1)
        b = _stain(db, case, _test(db), slide_no=2)

        stain_crud.create_stain_run(db, "S1", [a.id], f"NR-{uuid.uuid4().hex[:8]}", user.id)
        (a,) = _fresh(db, a)
        assert (a.status, a.ready_at is not None) == ("stained", True)

        stain_crud.update_stain(db, b.id, NongyneStainUpdate(status="stained"))
        (b,) = _fresh(db, b)
        assert b.ready_at is not None
        stain_crud.update_stain(db, b.id, NongyneStainUpdate(status="pending"))
        (b,) = _fresh(db, b)
        assert b.ready_at is None


class TestSignOff:
    def test_complete_signoff_reports_and_publishes_ihc_and_special_stains(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = _case(db, registrar.id)
        ihc = _stain(db, case, _test(db), status="stained", slide_no=1)
        special = _stain(db, case, _test(db, "Histochem"), status="stained", slide_no=2)
        not_stained = _stain(db, case, _test(db), status="pending", slide_no=3)
        pap = _stain(db, case, _test(db, "Cytology"), status="stained", slide_no=4)

        report = _sign(db, case, path1)

        ihc, special, not_stained, pap = _fresh(db, ihc, special, not_stained, pap)
        for s in (ihc, special):
            assert s.status == "completed"
            assert s.reported_at == report.reported_at
            assert s.released_at == report.published_at
        assert (not_stained.status, not_stained.reported_at) == ("pending", None)
        assert (pap.status, pap.reported_at) == ("stained", None)  # routine cytology stain

    def test_provisional_signoff_reports_only_reviewed_slides(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = _case(db, registrar.id)
        unreviewed = _stain(db, case, _test(db), status="stained", slide_no=1)
        reviewed = _stain(db, case, _test(db), status="completed", slide_no=2)

        _sign(db, case, path1, is_pending=True, pending_reason="Awaiting IHC")

        unreviewed, reviewed = _fresh(db, unreviewed, reviewed)
        assert (unreviewed.status, unreviewed.reported_at) == ("stained", None)
        assert reviewed.reported_at is not None

    def test_approval_releases_and_rejection_clears(self, db, admin_user, two_pathologists):
        make_system_setting(db, enable_non_gyne_approve_system=True, require_all_non_gyne_sign=False)
        registrar, _ = admin_user
        path1, path2 = two_pathologists

        approved_case = _case(db, registrar.id)
        approved = _stain(db, approved_case, _test(db), status="stained")
        report = _sign(db, approved_case, path1)
        (approved,) = _fresh(db, approved)
        assert approved.reported_at is not None and approved.released_at is None
        process_nongyne_report_approval(db, report.id, path2, ReportApproveRequest(action="APPROVE"))
        (approved,) = _fresh(db, approved)
        assert approved.released_at == db.get(NongyneCytoReport, report.id).published_at

        rejected_case = _case(db, registrar.id)
        rejected = _stain(db, rejected_case, _test(db), status="stained")
        report = _sign(db, rejected_case, path1)
        process_nongyne_report_approval(db, report.id, path2, ReportApproveRequest(action="REJECT"))
        (rejected,) = _fresh(db, rejected)
        assert (rejected.reported_at, rejected.released_at, rejected.status) == (None, None, "completed")


class TestSignOffList:
    def test_lists_ihc_and_special_stains_only(self, db, admin_user, staff_client):
        user, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=user.id)
        ihc = _stain(db, case, _test(db), status="stained", slide_no=1)
        _stain(db, case, _test(db, "Cytology"), status="stained", slide_no=2)
        _stain(db, case, _test(db, "Molecular"), status="pending", slide_no=3)

        rows = stain_crud.get_case_signoff_stains(db, case.id)
        assert [r["stain_id"] for r in rows] == [ihc.id]
        assert rows[0]["block_code"] is None and rows[0]["category"] == "IHC"

        r = staff_client.get(f"/nongyne-stains/sign-off/{case.id}")
        assert r.status_code == 200, r.text
        assert [s["stain_id"] for s in r.json()] == [ihc.id]


class TestDashboard:
    def test_nongyne_requests_and_outstanding(self, db, admin_user, admin_client):
        make_system_setting(db, ihc_tat_days=5)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        t = _test(db)
        # Ordered Mon 4 Oct 2021, stained Tue 5, signed and published Thu 7.
        out = _stain(db, case, t, status="completed", slide_no=1)
        out.created_at = datetime(2021, 10, 4, 9)
        out.ready_at = datetime(2021, 10, 5, 9)
        out.reported_at = out.released_at = datetime(2021, 10, 7, 9)
        waiting = _stain(db, case, t, status="stained", slide_no=2)
        db.commit()

        data = get_ihc_tat(db, datetime(2021, 10, 1).date(), datetime(2021, 10, 31).date(), "nongyne")
        assert data["summary"]["requests"] == 1
        (req,) = data["requests"]
        assert (req["case_id"], req["source"], req["total_days"], req["reading_days"]) == (case.id, "in-house", 3.0, 2.0)
        assert req["accession_no"] == case.accession_no and req["on_time"] is True

        # Only the slide still stained is outstanding; the one out isn't.
        open_cases = {r["case_id"]: r for r in get_ihc_outstanding(db, "nongyne")}
        assert open_cases[case.id]["stage"] == "stained"
        assert [m["status"] for m in open_cases[case.id]["markers"]] == [waiting.status]

        # Surgical view doesn't see non-gyne stains, and the route takes case_type.
        assert case.id not in {r["case_id"] for r in get_ihc_outstanding(db, "surgical")}
        r = admin_client.get(
            "/surgical-reports/ihc-tat",
            params={"start_date": "2021-10-01", "end_date": "2021-10-31", "case_type": "nongyne"},
        )
        assert r.status_code == 200, r.text
        assert [q["case_id"] for q in r.json()["requests"]] == [case.id]
        assert admin_client.get("/surgical-reports/ihc-tat/outstanding", params={"case_type": "gyne"}).status_code == 422


def _load_backfill_sql() -> tuple:
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic" / "versions" / "4ce1135497ee_add_result_timeline_to_nongyne_cyto_.py"
    )
    spec = importlib.util.spec_from_file_location("rev_4ce1135497ee", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_SQL


class TestBackfill:
    def test_backfill_ready_reported_released(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        t0 = datetime(2020, 6, 1, 9)
        day = timedelta(days=1)

        def report(at, status=NongyneReportStatus.PUBLISHED, is_pending=False, published_at=None):
            db.add(NongyneCytoReport(
                case_id=case.id, hospital_id=case.hospital_id, status=status,
                is_pending=is_pending, reported_at=at, published_at=published_at,
            ))

        report(t0 + 2 * day, is_pending=True, published_at=t0 + 2 * day)       # provisional
        report(t0 + 4 * day, status=NongyneReportStatus.PENDING_APPROVAL)       # signed, awaiting approval
        report(t0 + 4.5 * day, status=NongyneReportStatus.DRAFT)                 # never counts
        report(t0 + 6 * day, published_at=t0 + 6 * day)                          # complete, published

        def stained(test, status, slide_no):
            s = _stain(db, case, test, status=status, slide_no=slide_no)
            run = NongyneStainRun(run_no=f"NR-{uuid.uuid4().hex[:8]}", started_at=t0 + day, completed_at=t0 + day)
            db.add(run)
            db.flush()
            db.add(NongyneStainRunDetail(stain_run_id=run.id, stain_id=s.id))
            return s

        ihc = _test(db)
        typed_in_text = stained(ihc, "stained", 1)      # → the awaiting-approval sign-off, not released
        via_panel = stained(ihc, "completed", 2)        # → the provisional sign-off, released then
        pap = stained(_test(db, "Cytology"), "stained", 3)
        not_stained = _stain(db, case, ihc, status="pending", slide_no=4)
        db.commit()

        seeded = {"typed_in_text": typed_in_text.id, "via_panel": via_panel.id, "pap": pap.id, "not_stained": not_stained.id}
        try:
            for statement in _load_backfill_sql():
                db.execute(text(statement))
            db.expire_all()
            got = {}
            for name, i in seeded.items():
                s = db.get(NongyneCytologyStain, i)
                got[name] = (s.status, s.ready_at, s.reported_at, s.released_at)
        finally:
            db.rollback()

        assert got == {
            "typed_in_text": ("completed", t0 + day, t0 + 4 * day, t0 + 6 * day),
            "via_panel": ("completed", t0 + day, t0 + 2 * day, t0 + 2 * day),
            "pap": ("stained", t0 + day, None, None),        # ready, but routine — never reported
            "not_stained": ("pending", None, None, None),
        }
