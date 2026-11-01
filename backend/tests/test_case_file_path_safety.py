"""Regression tests: a case's stored PDF path must never let a request read or
delete a file outside the uploads directory.

PATCH /{surgical-cases,gyne-cytology,nongyne-cytology}/{id} used to accept
consult_pdf_path / out_lab_result_pdf_path from any authenticated user, and the
consult-PDF download, the gyne outlab-result download and the replace / clear
endpoints then opened or os.remove()d whatever the column held — an arbitrary
file read (the backend's .env, /proc/self/environ) and delete. The Update
schemas no longer carry those fields, and every sink goes through
app.utils.file_handler.resolve_stored_file, which refuses a path outside
STORAGE_ROOT, so a row already holding a bad path from before the fix is
defused too.

The PATCH routes are also hospital-scoped now, like the case reads already
were: a clinician/hospital account can't edit another hospital's case or move
one of its own cases out of its scope.
"""

import os
import uuid
from pathlib import Path

import pytest

from app.crud.consult_pdf import UPLOAD_CONSULT_DIR
from app.utils.time import local_now
from tests.conftest import _make_user
from tests.factories import (
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_hospital,
)

VALID_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< >>\nendobj\n%%EOF"
SECRET = b"SECRET_KEY=must-never-be-served\n"

CASE_TYPES = [
    pytest.param("/surgical-cases", make_bare_case, id="surgical"),
    pytest.param("/gyne-cytology", make_bare_gyne_case, id="gyne"),
    pytest.param("/nongyne-cytology", make_bare_nongyne_case, id="nongyne"),
]
CYTO_CASE_TYPES = CASE_TYPES[1:]


@pytest.fixture
def outside_file(tmp_path):
    """Stands in for the backend's .env: a readable file outside uploads/."""
    path = tmp_path / "secret.env"
    path.write_bytes(SECRET)
    return path


def _clinician_at(db, hospital):
    user, pwd = _make_user(db, f"clin_{uuid.uuid4().hex[:8]}", "ClinPass1!", ["clinician"])
    user.hospitals = [hospital]
    db.commit()
    return user, pwd


def _login(client, user, pwd):
    r = client.post("/auth/login", data={"username": user.username, "password": pwd})
    assert r.status_code == 200, r.text
    return client


class TestPatchCannotSetFilePaths:
    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_consult_pdf_path_is_ignored(self, admin_client, db, admin_user, outside_file, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)

        r = admin_client.patch(
            f"{prefix}/{case.id}",
            json={"consult_pdf_path": str(outside_file), "clinical_diagnosis": "edited"},
        )

        assert r.status_code == 200, r.text
        db.refresh(case)
        assert case.clinical_diagnosis == "edited"
        assert case.consult_pdf_path is None

    @pytest.mark.parametrize("prefix, make_case", CYTO_CASE_TYPES)
    def test_out_lab_result_pdf_path_is_ignored(self, admin_client, db, admin_user, outside_file, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)

        r = admin_client.patch(
            f"{prefix}/{case.id}",
            json={"is_out_lab": True, "out_lab_result_pdf_path": str(outside_file)},
        )

        assert r.status_code == 200, r.text
        db.refresh(case)
        assert case.is_out_lab is True
        assert case.out_lab_result_pdf_path is None


class TestStoredPathOutsideUploads:
    """Rows poisoned before the fix: the column is written directly, as the old
    PATCH allowed."""

    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_consult_pdf_download_refuses_it(self, admin_client, db, admin_user, outside_file, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)
        case.consult_pdf_path = str(outside_file)
        db.commit()

        r = admin_client.get(f"{prefix}/{case.id}/consult-pdf")

        assert r.status_code == 404
        assert SECRET not in r.content

    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_consult_pdf_clear_does_not_delete_it(self, admin_client, db, admin_user, outside_file, prefix, make_case):
        registrar, _ = admin_user
        case = make_case(db, registrar_id=registrar.id)
        case.consult_pdf_path = str(outside_file)
        db.commit()

        r = admin_client.delete(f"{prefix}/{case.id}/consult-pdf")

        assert r.status_code == 200, r.text
        assert outside_file.exists()
        db.refresh(case)
        assert case.consult_pdf_path is None

    def test_consult_pdf_reupload_does_not_delete_it(self, admin_client, db, admin_user, outside_file):
        # save_consult_pdf is shared by all three case types, so one is enough.
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.consult_pdf_path = str(outside_file)
        db.commit()

        r = admin_client.post(
            f"/surgical-cases/{case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )

        assert r.status_code == 200, r.text
        assert outside_file.exists()
        db.refresh(case)
        new_path = Path(case.consult_pdf_path)
        try:
            assert new_path.resolve().is_relative_to(Path(UPLOAD_CONSULT_DIR).resolve())
        finally:
            new_path.unlink(missing_ok=True)

    def test_gyne_outlab_result_download_refuses_it(self, admin_client, db, admin_user, outside_file):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.is_out_lab = True
        case.out_lab_result_pdf_path = str(outside_file)
        db.commit()

        r = admin_client.get(f"/gyne-cytology/{case.id}/outlab-test-result")

        assert r.status_code == 404
        assert SECRET not in r.content

    def test_gyne_outlab_result_reupload_does_not_delete_it(self, admin_client, db, admin_user, outside_file):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.is_out_lab = True
        case.out_lab_result_pdf_path = str(outside_file)
        db.commit()

        r = admin_client.post(
            f"/gyne-cytology/{case.id}/outlab-test-result",
            files={"file": ("result.pdf", VALID_PDF, "application/pdf")},
        )

        assert r.status_code == 200, r.text
        assert outside_file.exists()
        db.refresh(case)
        assert case.out_lab_result_pdf_path != str(outside_file)
        os.remove(case.out_lab_result_pdf_path)


class TestPatchHospitalScoping:
    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_cannot_edit_other_hospitals_case(self, client, db, admin_user, prefix, make_case):
        registrar, _ = admin_user
        hosp_a, hosp_b = make_hospital(db), make_hospital(db)
        case_b = make_case(db, registrar_id=registrar.id, hospital=hosp_b)
        _login(client, *_clinician_at(db, hosp_a))

        r = client.patch(f"{prefix}/{case_b.id}", json={"clinical_diagnosis": "tampered"})

        assert r.status_code == 403
        db.refresh(case_b)
        assert case_b.clinical_diagnosis != "tampered"

    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_cannot_move_own_case_out_of_scope(self, client, db, admin_user, prefix, make_case):
        registrar, _ = admin_user
        hosp_a, hosp_b = make_hospital(db), make_hospital(db)
        case_a = make_case(db, registrar_id=registrar.id, hospital=hosp_a)
        _login(client, *_clinician_at(db, hosp_a))

        r = client.patch(f"{prefix}/{case_a.id}", json={"hospital_id": hosp_b.id})

        assert r.status_code == 403
        db.refresh(case_a)
        assert case_a.hospital_id == hosp_a.id

    @pytest.mark.parametrize("prefix, make_case", CASE_TYPES)
    def test_internal_staff_can_still_move_a_case(self, admin_client, db, admin_user, prefix, make_case):
        registrar, _ = admin_user
        hosp_a, hosp_b = make_hospital(db), make_hospital(db)
        case = make_case(db, registrar_id=registrar.id, hospital=hosp_a)

        r = admin_client.patch(f"{prefix}/{case.id}", json={"hospital_id": hosp_b.id})

        assert r.status_code == 200, r.text
        db.refresh(case)
        assert case.hospital_id == hosp_b.id


class TestGyneOutlabResultHospitalScoping:
    def test_clinician_cannot_read_other_hospitals_result(self, client, db, admin_user):
        registrar, _ = admin_user
        hosp_a, hosp_b = make_hospital(db), make_hospital(db)
        case_b = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_b)
        case_b.is_out_lab = True
        case_b.out_lab_result_pdf_path = "/nonexistent/result.pdf"
        # Signed off, so a 403 can only come from the hospital scope.
        case_b.outlab_result_approved_at = local_now()
        db.commit()
        _login(client, *_clinician_at(db, hosp_a))

        r = client.get(f"/gyne-cytology/{case_b.id}/outlab-test-result")

        assert r.status_code == 403
