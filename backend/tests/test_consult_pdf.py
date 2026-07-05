"""
Integration tests for the consult-PDF endpoints
(.../consult-pdf — upload / delete / download), shared by Surgical, Gyne, and
NonGyne via app/crud/consult_pdf.py's save_consult_pdf/clear_consult_pdf.

The Surgical suite below is the thorough one (validation, oversized/non-PDF
rejection, reupload-replaces-file) since that behavior lives entirely in the
shared crud function — proven once, it holds for all three case types. The
Gyne/NonGyne suites deliberately only check what's specific to their own
router wiring (correct model queried, correct case_type string passed
through, case_id 404 branch, auth dependency) rather than re-proving the
shared validation logic.
"""

import os
import pytest

from tests.factories import make_bare_case, make_bare_gyne_case, make_bare_nongyne_case

VALID_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< >>\nendobj\n%%EOF"


@pytest.fixture
def surgical_case(db, admin_user):
    user, _ = admin_user
    case = make_bare_case(db, registrar_id=user.id)
    return case


class TestUploadConsultPdf:
    def test_requires_auth(self, client, surgical_case):
        r = client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 401

    def test_upload_valid_pdf_sets_case_fields(self, admin_client, db, surgical_case):
        r = admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
            data={"received_at": "2026-01-15T10:30:00"},
        )
        assert r.status_code == 200

        db.refresh(surgical_case)
        assert surgical_case.consult_pdf_path
        assert os.path.exists(surgical_case.consult_pdf_path)
        assert surgical_case.consult_pdf_received_at is not None

    def test_upload_rejects_non_pdf_content(self, admin_client, surgical_case):
        r = admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", b"not a real pdf file", "application/pdf")},
        )
        assert r.status_code == 400

    def test_upload_rejects_oversized_file(self, admin_client, surgical_case):
        oversized = VALID_PDF + b"0" * (20 * 1024 * 1024 + 10)
        r = admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", oversized, "application/pdf")},
        )
        assert r.status_code == 413

    def test_reupload_replaces_existing_file(self, admin_client, db, surgical_case):
        r1 = admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("first.pdf", VALID_PDF, "application/pdf")},
        )
        assert r1.status_code == 200
        db.refresh(surgical_case)
        first_path = surgical_case.consult_pdf_path
        assert os.path.exists(first_path)

        second_pdf = VALID_PDF + b"\n% second version"
        r2 = admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("second.pdf", second_pdf, "application/pdf")},
        )
        assert r2.status_code == 200
        db.refresh(surgical_case)
        second_path = surgical_case.consult_pdf_path

        assert second_path != first_path
        assert not os.path.exists(first_path)   # old file removed
        assert os.path.exists(second_path)

    def test_upload_nonexistent_case_returns_404(self, admin_client):
        r = admin_client.post(
            "/surgical-cases/999999/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 404


class TestDeleteConsultPdf:
    def test_delete_removes_file_and_clears_path(self, admin_client, db, surgical_case):
        admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        db.refresh(surgical_case)
        uploaded_path = surgical_case.consult_pdf_path
        assert os.path.exists(uploaded_path)

        r = admin_client.delete(f"/surgical-cases/{surgical_case.id}/consult-pdf")
        assert r.status_code == 200

        db.refresh(surgical_case)
        assert surgical_case.consult_pdf_path is None
        assert not os.path.exists(uploaded_path)

    def test_delete_nonexistent_case_returns_404(self, admin_client):
        r = admin_client.delete("/surgical-cases/999999/consult-pdf")
        assert r.status_code == 404


class TestDownloadConsultPdf:
    def test_download_404_when_no_pdf_uploaded(self, admin_client, surgical_case):
        r = admin_client.get(f"/surgical-cases/{surgical_case.id}/consult-pdf")
        assert r.status_code == 404

    def test_download_succeeds_after_upload(self, admin_client, surgical_case):
        admin_client.post(
            f"/surgical-cases/{surgical_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        r = admin_client.get(f"/surgical-cases/{surgical_case.id}/consult-pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"


@pytest.fixture
def gyne_case(db, admin_user):
    user, _ = admin_user
    return make_bare_gyne_case(db, registrar_id=user.id)


class TestGyneConsultPdfEndpoints:
    def test_requires_auth(self, client, gyne_case):
        r = client.post(
            f"/gyne-cytology/{gyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 401

    def test_upload_valid_pdf_sets_case_fields(self, admin_client, db, gyne_case):
        r = admin_client.post(
            f"/gyne-cytology/{gyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
            data={"received_at": "2026-01-15T10:30:00"},
        )
        assert r.status_code == 200

        db.refresh(gyne_case)
        assert gyne_case.consult_pdf_path
        assert os.path.exists(gyne_case.consult_pdf_path)
        assert gyne_case.consult_pdf_received_at is not None

    def test_upload_nonexistent_case_returns_404(self, admin_client):
        r = admin_client.post(
            "/gyne-cytology/999999/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 404

    def test_delete_removes_file_and_clears_path(self, admin_client, db, gyne_case):
        admin_client.post(
            f"/gyne-cytology/{gyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        db.refresh(gyne_case)
        uploaded_path = gyne_case.consult_pdf_path

        r = admin_client.delete(f"/gyne-cytology/{gyne_case.id}/consult-pdf")
        assert r.status_code == 200

        db.refresh(gyne_case)
        assert gyne_case.consult_pdf_path is None
        assert not os.path.exists(uploaded_path)

    def test_download_404_when_no_pdf_uploaded(self, admin_client, gyne_case):
        r = admin_client.get(f"/gyne-cytology/{gyne_case.id}/consult-pdf")
        assert r.status_code == 404

    def test_download_succeeds_after_upload(self, admin_client, gyne_case):
        admin_client.post(
            f"/gyne-cytology/{gyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        r = admin_client.get(f"/gyne-cytology/{gyne_case.id}/consult-pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"


@pytest.fixture
def nongyne_case(db, admin_user):
    user, _ = admin_user
    return make_bare_nongyne_case(db, registrar_id=user.id)


class TestNongyneConsultPdfEndpoints:
    def test_requires_auth(self, client, nongyne_case):
        r = client.post(
            f"/nongyne-cytology/{nongyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 401

    def test_upload_valid_pdf_sets_case_fields(self, admin_client, db, nongyne_case):
        r = admin_client.post(
            f"/nongyne-cytology/{nongyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
            data={"received_at": "2026-01-15T10:30:00"},
        )
        assert r.status_code == 200

        db.refresh(nongyne_case)
        assert nongyne_case.consult_pdf_path
        assert os.path.exists(nongyne_case.consult_pdf_path)
        assert nongyne_case.consult_pdf_received_at is not None

    def test_upload_nonexistent_case_returns_404(self, admin_client):
        r = admin_client.post(
            "/nongyne-cytology/999999/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        assert r.status_code == 404

    def test_delete_removes_file_and_clears_path(self, admin_client, db, nongyne_case):
        admin_client.post(
            f"/nongyne-cytology/{nongyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        db.refresh(nongyne_case)
        uploaded_path = nongyne_case.consult_pdf_path

        r = admin_client.delete(f"/nongyne-cytology/{nongyne_case.id}/consult-pdf")
        assert r.status_code == 200

        db.refresh(nongyne_case)
        assert nongyne_case.consult_pdf_path is None
        assert not os.path.exists(uploaded_path)

    def test_download_404_when_no_pdf_uploaded(self, admin_client, nongyne_case):
        r = admin_client.get(f"/nongyne-cytology/{nongyne_case.id}/consult-pdf")
        assert r.status_code == 404

    def test_download_succeeds_after_upload(self, admin_client, nongyne_case):
        admin_client.post(
            f"/nongyne-cytology/{nongyne_case.id}/consult-pdf",
            files={"file": ("consult.pdf", VALID_PDF, "application/pdf")},
        )
        r = admin_client.get(f"/nongyne-cytology/{nongyne_case.id}/consult-pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
