"""
IHC TAT dashboard (crud.ihc_tat): an IHC request is a case's IHC slides that
went out at one sign-off (same reported_at), measured in working days.

Each test seeds its own calendar month in 2021, because rows committed here
stay in the test DB for the rest of the run and get_ihc_tat summarises a whole
period. 2021-03-01 is a Monday.
"""

import uuid
from datetime import datetime

from app.crud.ihc_tat import get_ihc_outstanding, get_ihc_tat
from app.models.surgical_block_stain import (
    SurgicalOutlabRun,
    SurgicalOutlabRunDetail,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)

from tests.factories import (
    clear_system_settings,
    make_anatomical_pathology_test,
    make_block,
    make_block_stain,
    make_signable_case,
    make_system_setting,
)


def _test(db, category="IHC", is_external=True):
    return make_anatomical_pathology_test(
        db, category=category, name=f"{category}-{uuid.uuid4().hex[:6]}", is_external=is_external
    )


def _stain(db, block, test, *, status, ordered_at, reported_at=None, is_recut=False, slide_no=1):
    s = make_block_stain(db, block.id, test.id, slide_no=slide_no, status=status, is_recut=is_recut)
    s.created_at = ordered_at
    s.reported_at = reported_at
    db.commit()
    return s


def _outlab(db, stains, sent_at, received_at, lab):
    run = SurgicalOutlabRun(run_no=f"OUTLAB-{uuid.uuid4().hex[:8]}", destination_lab=lab, sent_at=sent_at)
    db.add(run)
    db.flush()
    for s in stains:
        db.add(SurgicalOutlabRunDetail(outlab_run_id=run.id, stain_id=s.id, received_at=received_at))
        if received_at:
            s.ready_at = received_at  # as _receive_outlab_run_details does
    db.commit()


def _inhouse(db, stains, started_at, completed_at):
    run = SurgicalStainRun(
        run_no=f"RUN-{uuid.uuid4().hex[:8]}", status="completed",
        started_at=started_at, completed_at=completed_at,
    )
    db.add(run)
    db.flush()
    for s in stains:
        db.add(SurgicalStainRunDetail(stain_run_id=run.id, stain_id=s.id))
        s.ready_at = completed_at or started_at  # as crud.stain_run does
    db.commit()


def _case(db, registrar_id):
    case, specimen = make_signable_case(db, registrar_id=registrar_id)
    return case, make_block(db, specimen.id)


class TestIhcTat:
    def test_groups_slides_by_signoff_and_measures_working_days(self, db, admin_user):
        make_system_setting(db, ihc_tat_days=5)
        registrar, _ = admin_user
        case, block = _case(db, registrar.id)
        lab = f"Lab-{uuid.uuid4().hex[:6]}"

        # A 3-marker outlab panel, ordered Mon 1 Mar, sent Tue 2, back Fri 12,
        # signed out Mon 15 — one request, not three.
        ordered, out = datetime(2021, 3, 1, 9), datetime(2021, 3, 15, 9)
        panel = [
            _stain(db, block, _test(db), status="completed", ordered_at=ordered, reported_at=out, slide_no=i)
            for i in (1, 2, 3)
        ]
        _outlab(db, panel, sent_at=datetime(2021, 3, 2, 9), received_at=datetime(2021, 3, 12, 9), lab=lab)

        # An in-house IHC on the same case, carried by the Addendum on Wed 17.
        addendum = _stain(
            db, block, _test(db, is_external=False), status="completed",
            ordered_at=datetime(2021, 3, 15, 9), reported_at=datetime(2021, 3, 17, 9), slide_no=4,
        )
        _inhouse(db, [addendum], started_at=datetime(2021, 3, 16, 9), completed_at=datetime(2021, 3, 16, 13))

        # Not counted: a special stain, a recut, an IHC out in another month,
        # and an IHC on a cancelled case.
        _stain(db, block, _test(db, category="Histochem", is_external=False), status="completed",
               ordered_at=ordered, reported_at=out, slide_no=5)
        _stain(db, block, _test(db), status="completed", ordered_at=ordered, reported_at=out,
               is_recut=True, slide_no=6)
        _stain(db, block, _test(db), status="completed", ordered_at=ordered,
               reported_at=datetime(2021, 4, 5, 9), slide_no=7)
        cancelled_case, cancelled_block = _case(db, registrar.id)
        cancelled_case.is_cancelled = True
        db.commit()
        _stain(db, cancelled_block, _test(db), status="completed", ordered_at=ordered, reported_at=out)

        data = get_ihc_tat(db, datetime(2021, 3, 1).date(), datetime(2021, 3, 31).date())

        assert data["summary"] == {
            "requests": 2,
            "slides": 4,
            "outlab_requests": 1,
            "inhouse_requests": 1,
            "median_total_days": 6.0,    # median of 10.0 and 2.0
            "median_outlab_days": 8.0,   # Tue 2 → Fri 12
            "median_reading_days": 0.9,  # median of 1.0 and 0.8
            "target_days": 5,
            "on_time_count": 1,          # the 2-day in-house request; the panel took 10
            "on_time_pct": 50.0,
        }
        assert data["distribution"] == {"lt3": 1, "t3_5": 0, "t5_10": 1, "gt10": 0}
        assert data["monthly"] == [
            {"month": "2021-03", "requests": 2, "median_total_days": 6.0, "on_time_pct": 50.0}
        ]
        assert data["by_lab"] == [{"lab": lab, "requests": 1, "median_outlab_days": 8.0, "max_outlab_days": 8.0}]

        newest, oldest = data["requests"]
        assert (newest["source"], newest["slides"], newest["total_days"], newest["reading_days"]) == (
            "in-house", 1, 2.0, 0.8,  # run logged Tue 16 13:00 → out Wed 17 09:00
        )
        assert newest["outlab_days"] is None
        assert newest["on_time"] is True
        assert newest["ready_at"] == datetime(2021, 3, 16, 13)
        assert oldest["case_id"] == case.id
        assert oldest["accession_no"] == case.accession_no
        assert oldest["markers"] == sorted(p.test.name for p in panel)
        assert (oldest["source"], oldest["lab"], oldest["slides"]) == ("outlab", lab, 3)
        assert (oldest["total_days"], oldest["outlab_days"], oldest["reading_days"], oldest["bucket"]) == (
            10.0, 8.0, 1.0, "t5_10",
        )
        assert oldest["on_time"] is False

    def test_empty_period(self, db):
        data = get_ihc_tat(db, datetime(2021, 6, 1).date(), datetime(2021, 6, 30).date())
        assert data["summary"]["requests"] == 0
        assert data["summary"]["median_total_days"] is None
        assert data["summary"]["on_time_pct"] is None
        assert data["requests"] == [] and data["monthly"] == [] and data["by_lab"] == []


class TestIhcOutstanding:
    def test_lists_cases_not_out_yet_with_their_least_advanced_stage(self, db, admin_user):
        make_system_setting(db, ihc_tat_days=5)
        registrar, _ = admin_user
        lab = f"Lab-{uuid.uuid4().hex[:6]}"

        at_outlab_case, b1 = _case(db, registrar.id)
        sent = _stain(db, b1, _test(db), status="sent", ordered_at=datetime(2021, 5, 3, 9), slide_no=1)
        _stain(db, b1, _test(db), status="stained", ordered_at=datetime(2021, 5, 4, 9), slide_no=2)
        _outlab(db, [sent], sent_at=datetime(2021, 5, 4, 9), received_at=None, lab=lab)

        unsigned_case, b2 = _case(db, registrar.id)
        _stain(db, b2, _test(db), status="completed", ordered_at=datetime(2021, 5, 10, 9))

        signed_case, b3 = _case(db, registrar.id)
        _stain(db, b3, _test(db), status="completed", ordered_at=datetime(2021, 5, 3, 9),
               reported_at=datetime(2021, 5, 14, 9))

        cancelled_case, b4 = _case(db, registrar.id)
        cancelled_case.is_cancelled = True
        db.commit()
        _stain(db, b4, _test(db), status="pending", ordered_at=datetime(2021, 5, 3, 9))

        rows = {r["case_id"]: r for r in get_ihc_outstanding(db)}
        ids = list(rows)

        assert signed_case.id not in rows
        assert cancelled_case.id not in rows
        assert ids.index(at_outlab_case.id) < ids.index(unsigned_case.id)  # oldest order first

        r = rows[at_outlab_case.id]
        assert r["stage"] == "sent"
        assert r["ordered_at"] == datetime(2021, 5, 3, 9)
        assert (r["sent_at"], r["lab"]) == (datetime(2021, 5, 4, 9), lab)
        assert sorted(m["status"] for m in r["markers"]) == ["sent", "stained"]
        assert r["age_days"] > 5 and r["overdue"] is True
        assert rows[unsigned_case.id]["stage"] == "completed"

        # Ordered just now: within a 5-working-day target.
        fresh_case, b5 = _case(db, registrar.id)
        make_block_stain(db, b5.id, _test(db).id, status="pending")
        fresh = next(r for r in get_ihc_outstanding(db) if r["case_id"] == fresh_case.id)
        assert fresh["overdue"] is False


class TestRoutes:
    def test_routes_serve_both_views(self, db, admin_user, admin_client):
        registrar, _ = admin_user
        case, block = _case(db, registrar.id)
        _stain(db, block, _test(db), status="completed", ordered_at=datetime(2021, 7, 5, 9),
               reported_at=datetime(2021, 7, 7, 9))

        r = admin_client.get("/surgical-reports/ihc-tat", params={"start_date": "2021-07-01", "end_date": "2021-07-31"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["summary"]["requests"] == 1
        assert body["requests"][0]["case_id"] == case.id
        assert body["requests"][0]["total_days"] == 2.0

        r = admin_client.get("/surgical-reports/ihc-tat/outstanding")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_period_is_required(self, admin_client):
        assert admin_client.get("/surgical-reports/ihc-tat").status_code == 422

    def test_outside_roles_are_refused(self, clinician_client):
        # Patient names from every hospital: CAN_READ_REPORT's clinician and
        # hospital roles must not get in (CAN_READ_IHC_TAT).
        params = {"start_date": "2021-07-01", "end_date": "2021-07-31"}
        assert clinician_client.get("/surgical-reports/ihc-tat", params=params).status_code == 403
        assert clinician_client.get("/surgical-reports/ihc-tat/outstanding").status_code == 403

    def test_lab_staff_get_in(self, staff_client):
        # histo sends and receives the outlab slides; CAN_READ_REPORT left it out.
        assert staff_client.get("/surgical-reports/ihc-tat/outstanding").status_code == 200


class TestTarget:
    def test_defaults_to_ten_working_days_without_a_settings_row(self, db):
        clear_system_settings(db)
        data = get_ihc_tat(db, datetime(2021, 8, 1).date(), datetime(2021, 8, 31).date())
        assert data["summary"]["target_days"] == 10

    def test_admin_sets_it_and_zero_is_refused(self, db, admin_client):
        make_system_setting(db, hospital_slug="master")

        r = admin_client.patch("/system-settings/update", json={"ihc_tat_days": 7})
        assert r.status_code == 200, r.text
        assert r.json()["ihc_tat_days"] == 7
        data = get_ihc_tat(db, datetime(2021, 8, 1).date(), datetime(2021, 8, 31).date())
        assert data["summary"]["target_days"] == 7

        assert admin_client.patch("/system-settings/update", json={"ihc_tat_days": 0}).status_code == 422
