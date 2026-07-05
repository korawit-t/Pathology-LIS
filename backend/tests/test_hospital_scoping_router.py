"""Regression tests for hospital-scoped access control on request-files/
consult-pdf endpoints in surgical_case.py, gyne_cyto_case.py, and
nongyne_cyto_case.py.

These endpoints previously only required login (Depends(get_current_user))
with no role or hospital check at all, so an external-facing account
(clinician, hospital role) could download/delete another hospital's request
files or consult PDFs by ID, even though search-public/hospital-cases and
storage.py's _EXTERNAL_ROLES check already restrict those same roles to
their own hospital. Internal lab staff (pathologist, admin, etc.) are
intentionally NOT hospital-scoped, since one lab commonly serves multiple
hospitals -- see app.dependencies.auth.assert_hospital_scoped_access.
"""

import uuid

from app.models.gyne_cyto_request_file import GyneCytoRequestFile
from app.models.nongyne_request_file import NongyneRequestFile
from app.models.surgical_request_file import SurgicalRequestFile
from tests.conftest import _make_user
from tests.factories import (
    make_hospital,
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
)


def _make_clinician_at_hospital(db, hospital_id):
    user, pwd = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
    user.hospital_id = hospital_id
    db.commit()
    return user, pwd


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
