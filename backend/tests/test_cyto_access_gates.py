"""Regression tests for gates that were missing on cyto (and surgical preview)
routes, found in the 2026-11-01 security review.

- The gyne / non-gyne statistics routes needed no login at all, and two of
  them list cases with HN and patient name. They now take
  CAN_READ_CYTO_STATISTICS (the Report Analytics page's internal-staff roles).
- Gyne / non-gyne cancel and delete needed only a login — a clinician could
  cancel another hospital's published report. They now take CAN_CANCEL_CASE /
  CAN_DELETE_CASE, the same roles surgical always used.
- The cyto diagnosis reads and every preview (gyne, non-gyne, surgical) let a
  clinician / hospital account read any hospital's draft by case id. They now
  need the domain's read role and are hospital-scoped, like the published
  report reads already were.
"""

import uuid
from datetime import timedelta

import pytest

from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.utils.time import local_now
from tests.conftest import _make_user
from tests.factories import (
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_hospital,
    make_patient,
)


def _user(db, role, hospital=None):
    user, pwd = _make_user(db, f"u_{uuid.uuid4().hex[:10]}", "TestPass1!", [role])
    if hospital is not None:
        user.hospitals = [hospital]
        db.commit()
    return user, pwd


def _login(client, user, pwd):
    r = client.post("/auth/login", data={"username": user.username, "password": pwd})
    assert r.status_code == 200, r.text
    return client


def _dates():
    today = local_now().date()
    return {"start_date": str(today - timedelta(days=1)), "end_date": str(today + timedelta(days=1))}


STATS_ROUTES = [
    "/gyne-cytology/statistics",
    "/gyne-cytology/summary-table",
    "/gyne-cytology/summary-table/cases?metric=total",
    "/gyne-cytology/slide-quality-stats",
    "/gyne-cytology/qc-statistics",
    "/gyne-cytology/qc-cases",
    "/nongyne-cytology/statistics",
    "/nongyne-cytology/slide-quality-stats",
]


class TestStatisticsNeedAnInternalRole:
    @pytest.mark.parametrize("route", STATS_ROUTES)
    def test_anonymous_caller_is_refused(self, client, route):
        client.cookies.clear()
        r = client.get(route, params=_dates())
        assert r.status_code == 401, r.text

    @pytest.mark.parametrize("route", STATS_ROUTES)
    def test_clinician_is_refused(self, client, db, route):
        _login(client, *_user(db, "clinician", make_hospital(db)))
        r = client.get(route, params=_dates())
        assert r.status_code == 403, r.text

    def test_cytotechnologist_still_gets_the_case_list(self, client, db, admin_user):
        registrar, _ = admin_user
        patient = make_patient(db, name=f"Stat{uuid.uuid4().hex[:6]}")
        make_bare_gyne_case(db, registrar_id=registrar.id, patient=patient)
        _login(client, *_user(db, "cytotechnologist"))

        r = client.get("/gyne-cytology/summary-table/cases", params={**_dates(), "metric": "total"})

        assert r.status_code == 200, r.text
        assert patient.name in r.text


CYTO_PREFIXES = [
    pytest.param("/gyne-cytology", make_bare_gyne_case, id="gyne"),
    pytest.param("/nongyne-cytology", make_bare_nongyne_case, id="nongyne"),
]


class TestCancelAndDelete:
    @pytest.mark.parametrize("prefix, make_case", CYTO_PREFIXES)
    @pytest.mark.parametrize("role", ["clinician", "hospital", "cytotechnologist", "pathologist"])
    def test_cancel_refused_without_cancel_role(self, client, db, admin_user, prefix, make_case, role):
        registrar, _ = admin_user
        hospital = make_hospital(db)
        case = make_case(db, registrar_id=registrar.id, hospital=hospital)
        _login(client, *_user(db, role, hospital))

        r = client.post(f"{prefix}/{case.id}/cancel", json={"reason": "x"})

        assert r.status_code == 403, r.text
        db.refresh(case)
        assert case.status != "cancelled"

    @pytest.mark.parametrize("prefix, make_case", CYTO_PREFIXES)
    def test_lab_manager_can_cancel(self, client, db, admin_user, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)
        _login(client, *_user(db, "lab_manager"))

        r = client.post(f"{prefix}/{case.id}/cancel", json={"reason": "x"})

        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"

    @pytest.mark.parametrize("prefix, make_case", CYTO_PREFIXES)
    @pytest.mark.parametrize("role", ["clinician", "cytotechnologist", "lab_manager"])
    def test_delete_refused_for_non_admin(self, client, db, admin_user, prefix, make_case, role):
        registrar, _ = admin_user
        hospital = make_hospital(db)
        case = make_case(db, registrar_id=registrar.id, hospital=hospital)
        _login(client, *_user(db, role, hospital))

        r = client.delete(f"{prefix}/{case.id}")

        assert r.status_code == 403, r.text

    @pytest.mark.parametrize("prefix, make_case", CYTO_PREFIXES)
    def test_admin_can_delete_a_registered_case(self, admin_client, db, admin_user, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)

        r = admin_client.delete(f"{prefix}/{case.id}")

        assert r.status_code == 204, r.text


def _cases_at(db, registrar_id, hospital):
    """One case of each type at `hospital`, cyto ones with a draft diagnosis."""
    gyne = make_bare_gyne_case(db, registrar_id=registrar_id, hospital=hospital)
    create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=gyne.id, signers=[]), actor_id=registrar_id)
    nongyne = make_bare_nongyne_case(db, registrar_id=registrar_id, hospital=hospital)
    nongyne_diag = create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=nongyne.id, diagnosis="draft"))
    surgical = make_bare_case(db, registrar_id=registrar_id, hospital=hospital)
    return gyne, nongyne, nongyne_diag, surgical


def _draft_reads(gyne, nongyne, nongyne_diag, surgical):
    return [
        ("get", f"/gyne-diagnosis/case/{gyne.id}", None),
        ("get", f"/gyne-diagnosis/case/{gyne.id}/history", None),
        ("get", f"/gyne-cyto-reports/cases/{gyne.id}/preview-pdf", None),
        ("post", f"/gyne-cyto-reports/cases/{gyne.id}/preview-data", None),
        ("get", f"/nongyne-diagnosis/case/{nongyne.id}", None),
        ("get", f"/nongyne-diagnosis/case/{nongyne.id}/preview-pdf", None),
        ("get", f"/nongyne-diagnosis/{nongyne_diag.id}/pdf", None),
        ("get", f"/nongyne-cyto-reports/cases/{nongyne.id}/preview-pdf", None),
        ("post", f"/nongyne-cyto-reports/cases/{nongyne.id}/preview-data", None),
        ("post", f"/surgical-reports/cases/{surgical.id}/preview-pdf", {}),
        ("post", f"/surgical-reports/cases/{surgical.id}/preview-data", {}),
    ]


def _call(client, method, url, body):
    return client.get(url) if method == "get" else client.post(url, json=body)


class TestDraftReadsAreHospitalScoped:
    @pytest.mark.parametrize("role", ["clinician", "hospital"])
    def test_external_account_cannot_read_another_hospitals_drafts(self, client, db, admin_user, role):
        registrar, _ = admin_user
        reads = _draft_reads(*_cases_at(db, registrar.id, make_hospital(db)))
        _login(client, *_user(db, role, make_hospital(db)))

        refused = {url: _call(client, method, url, body).status_code for method, url, body in reads}

        assert set(refused.values()) == {403}, refused

    def test_external_account_reads_its_own_hospitals_diagnosis(self, client, db, admin_user):
        registrar, _ = admin_user
        hospital = make_hospital(db)
        gyne, nongyne, _, _ = _cases_at(db, registrar.id, hospital)
        _login(client, *_user(db, "clinician", hospital))

        assert client.get(f"/gyne-diagnosis/case/{gyne.id}").status_code == 200
        assert client.get(f"/nongyne-diagnosis/case/{nongyne.id}").status_code == 200

    @pytest.mark.parametrize("role", ["histo", "gross"])
    def test_internal_role_without_cyto_read_is_refused(self, client, db, admin_user, role):
        registrar, _ = admin_user
        gyne, nongyne, _, _ = _cases_at(db, registrar.id, make_hospital(db))
        _login(client, *_user(db, role))

        assert client.get(f"/gyne-diagnosis/case/{gyne.id}").status_code == 403
        assert client.get(f"/nongyne-diagnosis/case/{nongyne.id}").status_code == 403

    def test_internal_staff_read_any_hospital(self, client, db, admin_user):
        registrar, _ = admin_user
        reads = _draft_reads(*_cases_at(db, registrar.id, make_hospital(db)))
        _login(client, *_user(db, "pathologist"))

        statuses = {url: _call(client, method, url, body).status_code for method, url, body in reads}

        assert set(statuses.values()) == {200}, statuses
