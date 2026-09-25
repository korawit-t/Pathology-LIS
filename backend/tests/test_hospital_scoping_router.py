"""Regression tests for hospital-scoped access control.

Originally covered only the request-files/consult-pdf endpoints in
surgical_case.py/gyne_cyto_case.py/nongyne_cyto_case.py. Extended to cover
a broader OWASP #1 (Broken Access Control) follow-up pass: the *primary*
read paths (report-by-id/pdf/history, case detail, case list's hospital_id
filter, legacy reports) never got the same treatment as the sub-resource
endpoints above, even though clinician/hospital roles can reach all of
them via their normal role gates. Internal lab staff (pathologist, admin,
etc.) are intentionally NOT hospital-scoped, since one lab commonly serves
multiple hospitals -- see app.dependencies.auth.assert_hospital_scoped_access.
"""

import uuid

from app.models.gyne_cyto_request_file import GyneCytoRequestFile
from app.models.nongyne_request_file import NongyneRequestFile
from app.models.surgical_request_file import SurgicalRequestFile
from app.models.surgical_report import SurgicalReport
from app.models.gyne_cyto_report import GyneCytoReport
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport
from app.models.molecular_case import MolecularCase
from app.utils.time import local_now
from tests.conftest import _make_user
from tests.factories import (
    make_hospital,
    make_patient,
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_signable_case,
    make_anatomical_pathology_test,
)


def _make_clinician_at_hospitals(db, hospital_ids):
    from app.models.organization import Hospital

    user, pwd = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
    user.hospitals = db.query(Hospital).filter(Hospital.id.in_(hospital_ids)).all()
    db.commit()
    return user, pwd


def _make_clinician_at_hospital(db, hospital_id):
    return _make_clinician_at_hospitals(db, [hospital_id])


def _login(client, username, password):
    r = client.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


class TestSurgicalRequestFileHospitalScoping:
    def test_clinician_cannot_download_other_hospital_request_file(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        req_file = SurgicalRequestFile(
            case_id=case_b.id, file_path="/nonexistent/path.pdf",
            file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add(req_file)
        db.commit()
        db.refresh(req_file)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        response = client.get(f"/surgical-cases/request-files/{req_file.id}")

        assert response.status_code == 403

    def test_clinician_can_download_own_hospital_request_file(self, client, db, admin_user, tmp_path):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        file_path = tmp_path / "req.pdf"
        file_path.write_bytes(b"%PDF-fake")
        req_file = SurgicalRequestFile(
            case_id=case_a.id, file_path=str(file_path),
            file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add(req_file)
        db.commit()
        db.refresh(req_file)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        response = client.get(f"/surgical-cases/request-files/{req_file.id}")

        assert response.status_code == 200

    def test_pathologist_can_reach_any_hospital_request_file(
        self, client, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        req_file = SurgicalRequestFile(
            case_id=case_b.id, file_path="/nonexistent/path.pdf",
            file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add(req_file)
        db.commit()
        db.refresh(req_file)

        _login(client, path_user.username, path_pwd)

        response = client.get(f"/surgical-cases/request-files/{req_file.id}")

        # Internal staff aren't hospital-scoped; 404 here means it cleared
        # the 403 check and failed only on the (intentionally) missing
        # physical file -- proving there's no cross-hospital block for them.
        assert response.status_code == 404


class TestGyneConsultPdfHospitalScoping:
    def test_clinician_cannot_download_other_hospital_consult_pdf(self, client, db, admin_user, tmp_path):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        file_path = tmp_path / "consult.pdf"
        file_path.write_bytes(b"%PDF-fake")
        case_b = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_b)
        case_b.consult_pdf_path = str(file_path)
        db.commit()

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        response = client.get(f"/gyne-cytology/{case_b.id}/consult-pdf")

        assert response.status_code == 403

    def test_clinician_can_download_own_hospital_consult_pdf(self, client, db, admin_user, tmp_path):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        file_path = tmp_path / "consult.pdf"
        file_path.write_bytes(b"%PDF-fake")
        case_a = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_a.consult_pdf_path = str(file_path)
        db.commit()

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        response = client.get(f"/gyne-cytology/{case_a.id}/consult-pdf")

        assert response.status_code == 200


class TestMultiHospitalScoping:
    def test_clinician_with_two_hospitals_can_reach_both_but_not_a_third(
        self, client, db, admin_user
    ):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        hosp_c = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        case_c = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_c)

        def _add_request_file(case):
            f = SurgicalRequestFile(
                case_id=case.id, file_path="/nonexistent/path.pdf",
                file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
            )
            db.add(f)
            db.commit()
            db.refresh(f)
            return f

        file_a = _add_request_file(case_a)
        file_b = _add_request_file(case_b)
        file_c = _add_request_file(case_c)

        clinician, pwd = _make_clinician_at_hospitals(db, [hosp_a.id, hosp_b.id])
        _login(client, clinician.username, pwd)

        # 404 (not 403) proves the hospital check passed and it only failed
        # on the intentionally-missing physical file.
        assert client.get(f"/surgical-cases/request-files/{file_a.id}").status_code == 404
        assert client.get(f"/surgical-cases/request-files/{file_b.id}").status_code == 404
        assert client.get(f"/surgical-cases/request-files/{file_c.id}").status_code == 403

    def test_clinician_with_no_hospitals_denied(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp = make_hospital(db)
        case = make_bare_case(db, registrar_id=registrar.id, hospital=hosp)
        req_file = SurgicalRequestFile(
            case_id=case.id, file_path="/nonexistent/path.pdf",
            file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add(req_file)
        db.commit()
        db.refresh(req_file)

        clinician, pwd = _make_clinician_at_hospitals(db, [])
        _login(client, clinician.username, pwd)

        response = client.get(f"/surgical-cases/request-files/{req_file.id}")
        assert response.status_code == 403


class TestNongyneRequestFileHospitalScoping:
    def test_clinician_cannot_delete_other_hospital_request_file(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_b)
        req_file = NongyneRequestFile(
            case_id=case_b.id, file_path="/nonexistent/path.pdf",
            file_name="req.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add(req_file)
        db.commit()
        db.refresh(req_file)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        response = client.delete(f"/nongyne-cytology/request-files/{req_file.id}")

        assert response.status_code == 403


def _make_surgical_report(db, case, **overrides):
    fields = dict(case_id=case.id, hospital_id=case.hospital_id, accession_no=case.accession_no)
    fields.update(overrides)
    report = SurgicalReport(**fields)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def _make_gyne_report(db, case, **overrides):
    fields = dict(case_id=case.id, hospital_id=case.hospital_id, accession_no=case.accession_no)
    fields.update(overrides)
    report = GyneCytoReport(**fields)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def _make_nongyne_report(db, case, **overrides):
    fields = dict(case_id=case.id, hospital_id=case.hospital_id, accession_no=case.accession_no)
    fields.update(overrides)
    report = NongyneCytoReport(**fields)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


class TestSurgicalReportHospitalScoping:
    def test_clinician_cannot_read_other_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        report_b = _make_surgical_report(db, case_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-reports/{report_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        report_a = _make_surgical_report(db, case_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-reports/{report_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_report_pdf(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        report_b = _make_surgical_report(db, case_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-reports/{report_b.id}/pdf").status_code == 403

    def test_clinician_cannot_read_other_hospital_report_history(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-reports/cases/{case_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_report_history(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-reports/cases/{case_a.id}").status_code == 200


class TestGyneReportHospitalScoping:
    def test_clinician_cannot_read_other_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_b)
        report_b = _make_gyne_report(db, case_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/gyne-cyto-reports/{report_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_a)
        report_a = _make_gyne_report(db, case_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/gyne-cyto-reports/{report_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_report_history(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/gyne-cyto-reports/cases/{case_b.id}").status_code == 403


class TestNongyneReportHospitalScoping:
    def test_clinician_cannot_read_other_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_b)
        report_b = _make_nongyne_report(db, case_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/nongyne-cyto-reports/{report_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_report_by_id(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_a)
        report_a = _make_nongyne_report(db, case_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/nongyne-cyto-reports/{report_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_report_history(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/nongyne-cyto-reports/cases/{case_b.id}").status_code == 403


class TestLegacyReportsHospitalScoping:
    def test_clinician_cannot_read_other_hospital_legacy_surgical(self, client, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        report_b = LegacySurgicalReport(hospital_id=hosp_b.id, accession_no=f"LEG-{uuid.uuid4().hex[:8]}")
        db.add(report_b)
        db.commit()
        db.refresh(report_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/legacy-reports/surgical/{report_b.id}").status_code == 403
        assert client.get(f"/legacy-reports/surgical/{report_b.id}/pdf").status_code == 403

    def test_clinician_can_read_own_hospital_legacy_surgical(self, client, db):
        hosp_a = make_hospital(db)
        report_a = LegacySurgicalReport(hospital_id=hosp_a.id, accession_no=f"LEG-{uuid.uuid4().hex[:8]}")
        db.add(report_a)
        db.commit()
        db.refresh(report_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/legacy-reports/surgical/{report_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_legacy_gyne(self, client, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        report_b = LegacyGyneCytoReport(hospital_id=hosp_b.id, accession_no=f"LEG-{uuid.uuid4().hex[:8]}")
        db.add(report_b)
        db.commit()
        db.refresh(report_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/legacy-reports/gyne/{report_b.id}").status_code == 403

    def test_clinician_cannot_read_other_hospital_legacy_nongyne(self, client, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        report_b = LegacyNongyneCytoReport(hospital_id=hosp_b.id, accession_no=f"LEG-{uuid.uuid4().hex[:8]}")
        db.add(report_b)
        db.commit()
        db.refresh(report_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/legacy-reports/nongyne/{report_b.id}").status_code == 403


class TestCaseDetailHospitalScoping:
    def test_clinician_cannot_read_other_hospital_surgical_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-cases/{case_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_surgical_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/surgical-cases/{case_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_gyne_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/gyne-cytology/{case_b.id}").status_code == 403

    def test_clinician_cannot_read_other_hospital_nongyne_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/nongyne-cytology/{case_b.id}").status_code == 403


class TestCaseListHospitalIdFilterScoping:
    def test_clinician_omitting_hospital_id_only_sees_own_hospitals(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/surgical-cases", params={"limit": 200})

        assert r.status_code == 200
        ids = {c["id"] for c in r.json()["items"]}
        assert case_a.id in ids
        assert case_b.id not in ids

    def test_clinician_requesting_other_hospital_id_explicitly_gets_403(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/surgical-cases", params={"hospital_id": hosp_b.id})

        assert r.status_code == 403

    def test_clinician_requesting_own_hospital_id_explicitly_succeeds(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/surgical-cases", params={"hospital_id": hosp_a.id})

        assert r.status_code == 200
        assert any(c["id"] == case_a.id for c in r.json()["items"])

    def test_pathologist_omitting_hospital_id_sees_all_hospitals(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)

        _login(client, path_user.username, path_pwd)

        r = client.get("/surgical-cases", params={"limit": 200})

        assert r.status_code == 200
        ids = {c["id"] for c in r.json()["items"]}
        assert case_a.id in ids
        assert case_b.id in ids


class TestAdditionalSectionsNowRequiresGrossRole:
    """set_additional_sections previously had no role gate beyond login
    (Depends(get_current_user)), unlike every sibling route in
    surgical_specimen.py (all CAN_GROSS). Fixed by adding CAN_GROSS, which
    already excludes clinician/hospital -- no hospital-scoping code needed
    in this file since the role gate alone now closes the IDOR."""

    def test_clinician_cannot_set_additional_sections(self, client, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        hosp_a = make_hospital(db)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.patch(f"/surgical-specimens/{specimen.id}/additional-sections", json={"needs": True})

        assert r.status_code == 403

    def test_gross_can_still_set_additional_sections(self, client, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        gross_user, gross_pwd = _make_user(db, f"gross_{uuid.uuid4().hex[:6]}", "GrossPass1!", ["gross"])
        _login(client, gross_user.username, gross_pwd)

        r = client.patch(f"/surgical-specimens/{specimen.id}/additional-sections", json={"needs": True})

        assert r.status_code == 200


def _add_specimen_diagnosis(db, case, specimen, text_, status="signed"):
    from app.models.surgical_diagnosis import SurgicalDiagnosis
    from app.enums.surgical_diagnosis_enums import DiagnosisLevel

    diag = SurgicalDiagnosis(
        case_id=case.id,
        surgical_specimen_id=specimen.id,
        diagnosis_level=DiagnosisLevel.SPECIMEN,
        diagnosis=text_,
        diagnosis_order=1,
        status=status,
    )
    db.add(diag)
    db.commit()
    db.refresh(diag)
    return diag


class TestSurgicalDiagnosisCaseLevelDraftDeleteGate:
    """DELETE /surgical-diagnoses/case/{case_id}/case-level-draft previously had
    NO dependency at all, and main.py adds no global auth -- so it was an
    unauthenticated destructive endpoint (delete draft diagnoses by iterating
    case_id). Now gated by CAN_WRITE_REPORT (internal write roles only)."""

    def test_unauthenticated_cannot_delete_case_level_draft(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        r = client.delete(f"/surgical-diagnoses/case/{case.id}/case-level-draft")
        assert r.status_code == 401

    def test_clinician_cannot_delete_case_level_draft(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        hosp_a = make_hospital(db)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        r = client.delete(f"/surgical-diagnoses/case/{case.id}/case-level-draft")
        assert r.status_code == 403

    def test_pathologist_can_delete_case_level_draft(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        case = make_bare_case(db, registrar_id=registrar.id)
        _login(client, path_user.username, path_pwd)
        # No draft exists -> still 200 ("No case-level draft found"), proving the
        # write-role gate lets an authorized user through.
        r = client.delete(f"/surgical-diagnoses/case/{case.id}/case-level-draft")
        assert r.status_code == 200


class TestSurgicalDiagnosisHospitalScoping:
    """The 3 GET endpoints in surgical_diagnosis.py are gated by CAN_READ_REPORT
    (which includes clinician/hospital) but were not hospital-scoped -- an
    external user could read another hospital's diagnoses by iterating ids.
    specimen/case use assert_hospital_scoped_access (403); patient history
    filters the returned rows to the caller's hospitals."""

    def test_clinician_cannot_read_other_hospital_case_diagnoses(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        assert client.get(f"/surgical-diagnoses/case/{case_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_case_diagnoses(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        assert client.get(f"/surgical-diagnoses/case/{case_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_specimen_diagnoses(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        _, specimen_b = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_b)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        assert client.get(f"/surgical-diagnoses/specimen/{specimen_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_specimen_diagnoses(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        _, specimen_a = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_a)
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        assert client.get(f"/surgical-diagnoses/specimen/{specimen_a.id}").status_code == 200

    def test_pathologist_can_read_any_hospital_case_diagnoses(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        hosp_b = make_hospital(db)
        case_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        _login(client, path_user.username, path_pwd)
        # Internal staff are not hospital-scoped.
        assert client.get(f"/surgical-diagnoses/case/{case_b.id}").status_code == 200

    def test_clinician_patient_history_excludes_other_hospital(self, client, db, admin_user):
        registrar, _ = admin_user
        patient = make_patient(db)
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a, spec_a = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_a, patient=patient)
        case_b, spec_b = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_b, patient=patient)
        diag_a = _add_specimen_diagnosis(db, case_a, spec_a, "hospA")
        diag_b = _add_specimen_diagnosis(db, case_b, spec_b, "hospB")

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get(f"/surgical-diagnoses/patient/{patient.id}")
        assert r.status_code == 200
        ids = {d["id"] for d in r.json()}
        assert diag_a.id in ids
        assert diag_b.id not in ids

    def test_internal_patient_history_sees_all_hospitals(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        patient = make_patient(db)
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a, spec_a = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_a, patient=patient)
        case_b, spec_b = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_b, patient=patient)
        diag_a = _add_specimen_diagnosis(db, case_a, spec_a, "hospA")
        diag_b = _add_specimen_diagnosis(db, case_b, spec_b, "hospB")

        _login(client, path_user.username, path_pwd)

        r = client.get(f"/surgical-diagnoses/patient/{patient.id}")
        assert r.status_code == 200
        ids = {d["id"] for d in r.json()}
        assert {diag_a.id, diag_b.id} <= ids


# --- Molecular ---------------------------------------------------------------
#
# Molecular landed after the pass above and never got the same treatment: its
# router had no scoping at all, while clinician/hospital accounts reach every
# read endpoint on it through CAN_READ_REPORT. The Result page searches
# Molecular alongside the three archives, so a referring account searching by
# patient or by another hospital's clinician name got that hospital's cases
# back, results included.
#
# Both origins are covered in each direction, because the hospital lives in a
# different place for each: on the row for a standalone case, on the parent
# Surgical case for one ordered from a block.


def _make_molecular_case(
    db,
    registrar_id: int,
    hospital=None,
    parent_case=None,
    status: str = "reported",
    clinician_name: str = None,
    outlab_pdf_path: str = None,
) -> MolecularCase:
    ap_test = make_anatomical_pathology_test(
        db, category="Molecular", system_code=None, name="EGFR Mutation Analysis"
    )
    standalone = parent_case is None
    case = MolecularCase(
        accession_no=f"M{uuid.uuid4().hex[:10]}",
        ap_test_id=ap_test.id,
        registrar_id=registrar_id,
        parent_case_id=None if standalone else parent_case.id,
        patient_id=make_patient(db).id if standalone else None,
        hospital_id=hospital.id if (standalone and hospital) else None,
        hn=f"HN{uuid.uuid4().hex[:6]}" if standalone else None,
        clinician_name=clinician_name if standalone else None,
        status=status,
        result_text="<p>No mutation detected.</p>",
        outlab_pdf_path=outlab_pdf_path,
        is_outlab=outlab_pdf_path is not None,
        registered_at=local_now(),
        reported_at=local_now() if status == "reported" else None,
        reported_by_id=registrar_id if status == "reported" else None,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


class TestMolecularCaseDetailHospitalScoping:
    def test_clinician_cannot_read_other_hospital_standalone_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_standalone_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_a.id}").status_code == 200

    def test_clinician_cannot_read_other_hospital_parent_linked_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        parent_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        case_b = _make_molecular_case(db, registrar.id, parent_case=parent_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_b.id}").status_code == 403

    def test_clinician_can_read_own_hospital_parent_linked_case(self, client, db, admin_user):
        """A parent-linked case has hospital_id NULL on its own row — scoping
        on that column instead of the parent's would deny every such case."""
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        parent_a = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_a = _make_molecular_case(db, registrar.id, parent_case=parent_a)

        assert case_a.hospital_id is None
        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_a.id}").status_code == 200

    def test_pathologist_can_read_any_hospital_case(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        hosp_b = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        _login(client, path_user.username, path_pwd)

        assert client.get(f"/molecular-cases/{case_b.id}").status_code == 200


class TestMolecularListHospitalScoping:
    def test_clinician_list_excludes_other_hospital_cases(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        own = _make_molecular_case(db, registrar.id, hospital=hosp_a)
        other = _make_molecular_case(db, registrar.id, hospital=hosp_b)
        parent_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        other_linked = _make_molecular_case(db, registrar.id, parent_case=parent_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases", params={"limit": 500})

        assert r.status_code == 200
        ids = {c["id"] for c in r.json()}
        assert own.id in ids
        assert other.id not in ids
        assert other_linked.id not in ids

    def test_clinician_searching_another_hospitals_clinician_finds_nothing(
        self, client, db, admin_user
    ):
        """The Result page's "search by ผู้ส่งตรวจ" path — the one that made
        this reachable without knowing a case id."""
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        referrer = f"Dr Somchai {uuid.uuid4().hex[:8]}"
        case_b = _make_molecular_case(
            db, registrar.id, hospital=hosp_b, clinician_name=referrer
        )

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases", params={"clinician": referrer, "limit": 500})

        assert r.status_code == 200
        assert case_b.id not in {c["id"] for c in r.json()}

    def test_clinician_search_by_patient_excludes_other_hospital(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_b = make_hospital(db)
        hosp_a = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases", params={"search": case_b.hn, "limit": 500})

        assert r.status_code == 200
        assert r.json() == []

    def test_clinician_with_two_hospitals_sees_both_but_not_a_third(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        hosp_c = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)
        parent_b = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_b)
        case_b = _make_molecular_case(db, registrar.id, parent_case=parent_b)
        case_c = _make_molecular_case(db, registrar.id, hospital=hosp_c)

        clinician, pwd = _make_clinician_at_hospitals(db, [hosp_a.id, hosp_b.id])
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases", params={"limit": 500})

        ids = {c["id"] for c in r.json()}
        assert {case_a.id, case_b.id} <= ids
        assert case_c.id not in ids

    def test_clinician_with_no_hospitals_sees_nothing(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_b = make_hospital(db)
        _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospitals(db, [])
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases", params={"limit": 500})

        assert r.status_code == 200
        assert r.json() == []

    def test_pathologist_list_sees_every_hospital(self, client, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, path_pwd = pathologist_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        _login(client, path_user.username, path_pwd)

        r = client.get("/molecular-cases", params={"limit": 500})

        ids = {c["id"] for c in r.json()}
        assert {case_a.id, case_b.id} <= ids

    def test_count_is_scoped_to_own_hospitals(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)
        before = client.get("/molecular-cases/count").json()["count"]

        _make_molecular_case(db, registrar.id, hospital=hosp_b)
        assert client.get("/molecular-cases/count").json()["count"] == before

        _make_molecular_case(db, registrar.id, hospital=hosp_a)
        assert client.get("/molecular-cases/count").json()["count"] == before + 1

    def test_print_queue_is_scoped_to_own_hospitals(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.get("/molecular-cases/print-queue", params={"size": 200})

        assert r.status_code == 200
        ids = {c["id"] for c in r.json()["items"]}
        assert case_a.id in ids
        assert case_b.id not in ids


class TestMolecularResultHospitalScoping:
    def test_clinician_cannot_download_other_hospital_result_pdf(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_b.id}/result-pdf").status_code == 403

    def test_clinician_can_download_own_hospital_result_pdf(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_a.id}/result-pdf").status_code == 200

    def test_clinician_cannot_download_other_hospital_outlab_pdf(
        self, client, db, admin_user, tmp_path
    ):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        pdf = tmp_path / "outlab.pdf"
        pdf.write_bytes(b"%PDF-1.4 test")
        case_b = _make_molecular_case(
            db, registrar.id, hospital=hosp_b, outlab_pdf_path=str(pdf)
        )

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        assert client.get(f"/molecular-cases/{case_b.id}/outlab-pdf").status_code == 403

    def test_clinician_cannot_flip_print_status_on_other_hospital_case(
        self, client, db, admin_user
    ):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.patch(
            f"/molecular-cases/{case_b.id}/print-status", json={"is_print": True}
        )

        assert r.status_code == 403
        db.refresh(case_b)
        assert case_b.is_print is False

    def test_clinician_can_flip_print_status_on_own_hospital_case(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        case_a = _make_molecular_case(db, registrar.id, hospital=hosp_a)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.patch(
            f"/molecular-cases/{case_a.id}/print-status", json={"is_print": True}
        )

        assert r.status_code == 200
        assert r.json()["is_print"] is True

    def test_barcode_sheet_skips_other_hospital_cases(self, client, db, admin_user):
        """Labels carry the patient's name and HN, and the endpoint takes
        arbitrary ids — out-of-scope ones are dropped, so a request for only
        those has nothing left to render."""
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_b = _make_molecular_case(db, registrar.id, hospital=hosp_b)

        clinician, pwd = _make_clinician_at_hospital(db, hosp_a.id)
        _login(client, clinician.username, pwd)

        r = client.post("/molecular-cases/barcode-pdf", json={"case_ids": [case_b.id]})

        assert r.status_code == 404
