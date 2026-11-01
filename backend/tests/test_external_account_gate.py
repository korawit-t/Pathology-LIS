"""Clinician and hospital accounts reach only the results portal.

Found in the 2026-11-01 security review: about 70 routes needed nothing but a
login, so every referring-side account could read the audit trail, any
hospital's billing summary, out-lab registration info, the HOSxP patient
search (CID, name, date of birth), storage lists, and could record block and
slide disposal. InternalStaffOnly now closes every router to accounts holding
only external roles, except the endpoints a router names in
open_to_external.

The same review found two smaller holes, also covered here:
- Anyone who could PATCH a surgical case could set consult_pdf_approved_by_id
  to a pathologist, whose name the consult cover prints as its signature, and
  POST .../consult-pdf/approve had no role gate at all.
- A lab manager could reset an admin's second factor, though editing or
  deleting an admin was already refused.
"""

import re
import uuid

import pytest
from fastapi.routing import APIRoute, iter_route_contexts

from app.dependencies.auth import InternalStaffOnly
from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport
from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.surgical_case import SurgicalCase
from app.models.system_setting import SystemSetting
from main import app
from tests.conftest import _make_user
from tests.factories import make_bare_case, make_hospital

# Routes without InternalStaffOnly, each for a reason: they work before login
# (auth, /public, /public-assets, /version), they act on the caller's own
# account (MFA), they carry an internal-only role gate of their own
# (settings admin), or they scope by role themselves (/storage). A new route
# outside every gated router has to be added here on purpose.
UNGATED = {
    ("POST", "/auth/login"),
    ("POST", "/auth/login/mfa"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
    ("GET", "/auth/mfa/server-time"),
    ("GET", "/auth/mfa/status"),
    ("POST", "/auth/mfa/setup"),
    ("POST", "/auth/mfa/confirm"),
    ("POST", "/auth/mfa/disable"),
    ("GET", "/auth/mfa/devices"),
    ("DELETE", "/auth/mfa/devices/{device_id}"),
    ("DELETE", "/auth/mfa/devices"),
    ("POST", "/auth/mfa/step-up"),
    ("GET", "/system-settings/all"),
    ("GET", "/system-settings/public"),
    ("PATCH", "/system-settings/update"),
    ("POST", "/system-settings/upload-logo"),
    ("PATCH", "/system-settings/report-templates"),
    ("GET", "/system-settings/{setting_id}"),
    ("DELETE", "/system-settings/{setting_id}"),
    ("GET", "/storage/{file_path:path}"),
    ("GET", "/public-assets/{file_path:path}"),
    ("GET", "/version"),
    ("GET", "/"),
}

# What the results portal (ResultPage, HospitalResultPage) calls.
OPEN_TO_EXTERNAL = {
    ("GET", "/users/me"),
    ("PUT", "/users/me/password"),
    ("PATCH", "/users/me/preferences"),
    ("GET", "/surgical-cases/search-public-all"),
    ("GET", "/surgical-cases/hospital-cases"),
    ("GET", "/surgical-cases/hospital-cases/unread-count"),
    ("GET", "/surgical-reports/archive"),
    ("GET", "/surgical-reports/{report_id}/pdf"),
    ("POST", "/surgical-reports/{report_id}/mark-read"),
    ("GET", "/gyne-cytology/{case_id}/outlab-test-result"),
    ("GET", "/gyne-cyto-reports/archive"),
    ("GET", "/gyne-cyto-reports/{report_id}/pdf"),
    ("POST", "/gyne-cyto-reports/{report_id}/mark-read"),
    ("GET", "/nongyne-cyto-reports/archive"),
    ("GET", "/nongyne-cyto-reports/{report_id}/pdf"),
    ("POST", "/nongyne-cyto-reports/{report_id}/mark-read"),
    ("GET", "/molecular-cases"),
    ("GET", "/molecular-cases/{case_id}/outlab-pdf"),
    ("GET", "/molecular-cases/{case_id}/result-pdf"),
    ("GET", "/legacy-reports/surgical/{report_id}/pdf"),
    ("POST", "/legacy-reports/surgical/{report_id}/mark-read"),
    ("GET", "/legacy-reports/gyne/{report_id}/pdf"),
    ("POST", "/legacy-reports/gyne/{report_id}/mark-read"),
    ("GET", "/legacy-reports/nongyne/{report_id}/pdf"),
    ("POST", "/legacy-reports/nongyne/{report_id}/mark-read"),
}


def _gates(dependant, found):
    if isinstance(dependant.call, InternalStaffOnly):
        found.append(dependant.call)
    for sub in dependant.dependencies:
        _gates(sub, found)
    return found


def _routes():
    """(method, path, endpoint name, [InternalStaffOnly]) for every route."""
    for rc in iter_route_contexts(app.routes):
        if not isinstance(rc.original_route, APIRoute):
            continue
        gates = _gates(rc.dependant, [])
        for method in rc.methods:
            yield method, rc.path, rc.original_route.name, gates


def _closed_routes():
    return sorted(
        (method, path)
        for method, path, _, gates in _routes()
        if gates and (method, path) not in OPEN_TO_EXTERNAL
    )


def _user(db, roles, hospital=None):
    user, pwd = _make_user(db, f"u_{uuid.uuid4().hex[:10]}", "TestPass1!", roles)
    if hospital is not None:
        user.hospitals = [hospital]
        db.commit()
    return user, pwd


def _login(client, user, pwd):
    r = client.post("/auth/login", data={"username": user.username, "password": pwd})
    assert r.status_code == 200, r.text
    return client


class TestEveryRouteIsCovered:
    def test_no_route_is_left_without_a_decision(self):
        uncovered = sorted(
            (method, path) for method, path, _, gates in _routes()
            if not gates and (method, path) not in UNGATED
        )
        assert uncovered == [], (
            "These routes answer clinician/hospital accounts. Put their router "
            "behind INTERNAL_STAFF_ONLY in main.py, or add them to UNGATED "
            f"with a reason: {uncovered}"
        )

    def test_routes_left_open_are_exactly_the_portals(self):
        opened = {
            (method, path) for method, path, name, gates in _routes()
            if gates and all(name in g.open_to_external for g in gates)
        }
        assert opened == OPEN_TO_EXTERNAL

    def test_every_name_in_an_allowlist_is_a_real_endpoint(self):
        # A misspelt name fails closed (the portal breaks), but say so here
        # rather than in a bug report.
        names_by_gate = {}
        for _, _, name, gates in _routes():
            for gate in gates:
                names_by_gate.setdefault(id(gate), (gate, set()))[1].add(name)
        for gate, names in names_by_gate.values():
            assert gate.open_to_external <= names, gate.open_to_external - names


class TestExternalAccountsAreRefused:
    @pytest.mark.parametrize("role", ["clinician", "hospital"])
    def test_every_closed_route_refuses_them(self, client, db, role):
        _login(client, *_user(db, [role], make_hospital(db)))

        answered = {}
        for method, path in _closed_routes():
            url = re.sub(r"\{[^}]+\}", "1", path)
            r = client.request(method, url)
            if r.status_code != 403 or r.json().get("detail") != "Access denied.":
                answered[f"{method} {path}"] = r.status_code

        assert answered == {}

    @pytest.mark.parametrize("url", [
        "/audit-logs",
        "/his/patients?hn=1",
        "/his/visits-today",
        "/surgical-cases/hospital-billing-summary",
        "/outlab-consult-runs/registration-info/surgical/1",
        "/cyto-histo-correlations/surgical-context/1",
        "/critical-notification-logs",
        "/ihc/case-list",
        "/block-storage/disposed-blocks",
        "/users",
        "/surgical-cases/dashboard-summary",
        "/surgical-reports/statistics",
        "/legacy-reports/search?q=abc",
    ])
    def test_the_reported_leaks_are_closed(self, client, db, url):
        _login(client, *_user(db, ["clinician"], make_hospital(db)))

        assert client.get(url).status_code == 403

    def test_disposal_cannot_be_recorded(self, client, db):
        _login(client, *_user(db, ["hospital"], make_hospital(db)))

        assert client.post("/block-storage/dispose-blocks", json={}).status_code == 403
        assert client.post("/slide-storage/dispose-slides", json={}).status_code == 403


class TestThePortalStillWorks:
    @pytest.mark.parametrize("role", ["clinician", "hospital"])
    def test_portal_reads_answer(self, client, db, role):
        _login(client, *_user(db, [role], make_hospital(db)))

        for url in [
            "/users/me",
            "/system-settings/1",
            "/surgical-cases/hospital-cases",
            "/surgical-cases/hospital-cases/unread-count",
            "/surgical-cases/search-public-all?q=abcd",
            "/surgical-reports/archive",
            "/gyne-cyto-reports/archive",
            "/nongyne-cyto-reports/archive",
            "/molecular-cases",
        ]:
            assert client.get(url).status_code == 200, url

    @pytest.mark.parametrize("model, kind", [
        (LegacySurgicalReport, "surgical"),
        (LegacyGyneCytoReport, "gyne"),
        (LegacyNongyneCytoReport, "nongyne"),
    ])
    def test_mark_read_is_hospital_scoped(self, client, db, model, kind):
        own, other = make_hospital(db), make_hospital(db)
        mine, theirs = model(hospital_id=own.id), model(hospital_id=other.id)
        db.add_all([mine, theirs])
        db.commit()
        _login(client, *_user(db, ["clinician"], own))

        assert client.post(f"/legacy-reports/{kind}/{theirs.id}/mark-read").status_code == 403
        assert client.post(f"/legacy-reports/{kind}/{mine.id}/mark-read").status_code == 200
        db.expire_all()
        assert db.get(model, mine.id).is_read is True
        assert not db.get(model, theirs.id).is_read

    def test_an_account_with_an_internal_role_too_is_staff(self, client, db):
        _login(client, *_user(db, ["clinician", "register"], make_hospital(db)))

        assert client.get("/patients").status_code == 200

    def test_internal_staff_are_not_affected(self, admin_client):
        assert admin_client.get("/audit-logs").status_code == 200
        assert admin_client.get("/users").status_code == 200


class TestConsultPdfApproval:
    @pytest.fixture
    def case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id, hospital=make_hospital(db))
        case.consult_pdf_path = "uploads/consult/test.pdf"
        db.commit()
        return case

    def test_patch_cannot_name_an_approver(self, client, db, case, pathologist_user):
        pathologist, _ = pathologist_user
        _login(client, *_user(db, ["register"]))

        r = client.patch(f"/surgical-cases/{case.id}", json={
            "consult_pdf_approved_by_id": pathologist.id,
            "consult_pdf_approved_at": "2026-11-01T10:00:00",
        })

        assert r.status_code == 200, r.text
        db.expire_all()
        stored = db.get(SurgicalCase, case.id)
        assert stored.consult_pdf_approved_by_id is None
        assert stored.consult_pdf_approved_at is None

    @pytest.mark.parametrize("role", ["register", "gross", "lab_manager", "histo"])
    def test_non_pathologists_cannot_approve(self, client, db, case, role):
        _login(client, *_user(db, [role]))

        assert client.post(f"/surgical-cases/{case.id}/consult-pdf/approve").status_code == 403

    def test_own_hospital_account_cannot_approve(self, client, db, case):
        hospital = db.get(SurgicalCase, case.id).hospital
        _login(client, *_user(db, ["hospital"], hospital))

        assert client.post(f"/surgical-cases/{case.id}/consult-pdf/approve").status_code == 403

    def test_pathologist_approves_as_themselves(self, client, db, case, pathologist_user):
        pathologist, pwd = pathologist_user
        _login(client, pathologist, pwd)

        r = client.post(f"/surgical-cases/{case.id}/consult-pdf/approve")

        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.get(SurgicalCase, case.id).consult_pdf_approved_by_id == pathologist.id


class TestMfaResetOfAdmins:
    @pytest.fixture(autouse=True)
    def mfa_off(self, db):
        # Settings rows outlive a test. Make sure no step-up or MFA enrolment
        # requirement left by another test stands between these calls and
        # the guard they are about.
        row = db.query(SystemSetting).first()
        saved = (row.mfa_enabled, row.mfa_step_up_minutes) if row else None
        if row:
            row.mfa_enabled, row.mfa_step_up_minutes = False, 0
            db.commit()
        yield
        if row:
            row.mfa_enabled, row.mfa_step_up_minutes = saved
            db.commit()

    def test_lab_manager_cannot_reset_an_admin(self, client, db, admin_user):
        target, _ = admin_user
        _login(client, *_user(db, ["lab_manager"]))

        assert client.post(f"/users/{target.id}/mfa/reset").status_code == 403

    def test_lab_manager_still_resets_staff(self, client, db):
        target, _ = _user(db, ["histo"])
        _login(client, *_user(db, ["lab_manager"]))

        assert client.post(f"/users/{target.id}/mfa/reset").status_code == 204

    def test_admin_resets_an_admin(self, client, db, admin_user):
        target, _ = admin_user
        _login(client, *_user(db, ["admin"]))

        assert client.post(f"/users/{target.id}/mfa/reset").status_code == 204
