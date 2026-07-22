"""Tests for the gyne cytology outlab-test-result pathologist sign-off gate:
uploading a result no longer makes it visible to clinicians immediately — a
pathologist (or senior_pathologist/admin) must approve it first. Mirrors the
consult_pdf approve/clear pattern (see test_consult_pdf.py) but this is
gyne-only, since only GyneCytologyCase has the outlab-test-result feature
actually wired up (NonGyneCytologyCase has the same column but no endpoints).

Note: admin_client/pathologist_client/clinician_client all share ONE
underlying TestClient (see conftest.py's `client` + `_login`) — using more
than one of those fixtures in a single test just re-authenticates the same
client, so the LAST one to log in silently wins for the whole test body.
Tests here that need more than one identity re-login that single `client`
fixture sequentially via `_login_as` instead of combining `*_client` fixtures.
"""

import io

import pytest
from pypdf import PdfReader

from app.crud.gyne_cyto_case import get_gyne_cases
from app.crud.report_archive import get_gyne_archive
from tests.factories import make_bare_gyne_case

VALID_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< >>\nendobj\n%%EOF"


def _make_valid_pdf_bytes() -> bytes:
    """A minimal but genuinely parseable one-page PDF — VALID_PDF above is
    enough to satisfy the upload's magic-byte check but not enough for pypdf
    to actually parse/merge (no xref/trailer), so it can't exercise the
    cover-sheet merge path. Mirrors test_molecular_case.py's helper of the
    same name for the same reason."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _login_as(client, user_and_password):
    user, password = user_and_password
    r = client.post("/auth/login", data={"username": user.username, "password": password})
    assert r.status_code == 200, f"Login failed ({r.status_code}): {r.text}"
    return client


def _upload(client, case_id, filename="result.pdf", content=VALID_PDF):
    return client.post(
        f"/gyne-cytology/{case_id}/outlab-test-result",
        files={"file": (filename, content, "application/pdf")},
    )


@pytest.fixture
def outlab_case(db, admin_user):
    user, _ = admin_user
    case = make_bare_gyne_case(db, registrar_id=user.id)
    case.is_out_lab = True
    db.commit()
    db.refresh(case)
    return case


class TestUploadOutlabTestResult:
    def test_upload_does_not_set_approval_fields(self, admin_client, db, outlab_case):
        r = _upload(admin_client, outlab_case.id)
        assert r.status_code == 200

        db.refresh(outlab_case)
        assert outlab_case.out_lab_result_pdf_path
        assert outlab_case.outlab_result_approved_at is None
        assert outlab_case.outlab_result_approved_by_id is None

    def test_reupload_clears_prior_approval(self, client, db, admin_user, pathologist_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        _login_as(client, pathologist_user)
        approve_r = client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")
        assert approve_r.status_code == 200

        db.refresh(outlab_case)
        assert outlab_case.outlab_result_approved_at is not None

        _login_as(client, admin_user)
        _upload(client, outlab_case.id, filename="result2.pdf")

        db.refresh(outlab_case)
        assert outlab_case.outlab_result_approved_at is None
        assert outlab_case.outlab_result_approved_by_id is None


class TestApproveOutlabTestResult:
    def test_requires_uploaded_pdf(self, pathologist_client, outlab_case):
        r = pathologist_client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")
        assert r.status_code == 400

    def test_clinician_cannot_approve(self, client, admin_user, clinician_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        _login_as(client, clinician_user)
        r = client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")
        assert r.status_code == 403

    def test_pathologist_can_approve(self, client, db, admin_user, pathologist_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        _login_as(client, pathologist_user)
        r = client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")
        assert r.status_code == 200

        db.refresh(outlab_case)
        assert outlab_case.outlab_result_approved_by_id is not None
        assert outlab_case.outlab_result_approved_at is not None


class TestCoverSheet:
    """View PDF should match Surgical's external-consult / Molecular's
    out-lab-pdf cover sheet: lab header + patient/accession info + who
    signed off, prepended in front of the original uploaded PDF."""

    def test_download_prepends_cover_sheet_with_accession(self, client, admin_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id, content=_make_valid_pdf_bytes())

        r = client.get(f"/gyne-cytology/{outlab_case.id}/outlab-test-result")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"

        reader = PdfReader(io.BytesIO(r.content))
        assert len(reader.pages) >= 2  # cover page + original upload
        cover_text = reader.pages[0].extract_text()
        assert outlab_case.accession_no in cover_text

    def test_cover_shows_approver_once_signed_off(self, client, admin_user, pathologist_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id, content=_make_valid_pdf_bytes())

        _login_as(client, pathologist_user)
        client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")

        r = client.get(f"/gyne-cytology/{outlab_case.id}/outlab-test-result")
        assert r.status_code == 200
        reader = PdfReader(io.BytesIO(r.content))
        cover_text = reader.pages[0].extract_text()
        assert "digitally signed by" in cover_text.lower()


class TestClinicianVisibilityGate:
    def test_clinician_cannot_download_before_approval(self, client, admin_user, clinician_user, outlab_case):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        _login_as(client, clinician_user)
        r = client.get(f"/gyne-cytology/{outlab_case.id}/outlab-test-result")
        assert r.status_code == 403

    def test_clinician_can_download_after_approval(
        self, client, admin_user, pathologist_user, clinician_user, outlab_case
    ):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        _login_as(client, pathologist_user)
        approve_r = client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")
        assert approve_r.status_code == 200

        _login_as(client, clinician_user)
        r = client.get(f"/gyne-cytology/{outlab_case.id}/outlab-test-result")
        assert r.status_code == 200

    def test_staff_can_preview_before_approval(self, admin_client, outlab_case):
        _upload(admin_client, outlab_case.id)
        r = admin_client.get(f"/gyne-cytology/{outlab_case.id}/outlab-test-result")
        assert r.status_code == 200

    def test_report_archive_has_outlab_result_false_until_approved(
        self, db, client, admin_user, pathologist_user, outlab_case
    ):
        _login_as(client, admin_user)
        _upload(client, outlab_case.id)

        result = get_gyne_archive(db, search=outlab_case.accession_no)
        row = next(r for r in result["items"] if r["case_id"] == outlab_case.id)
        assert row["has_outlab_result"] is False

        _login_as(client, pathologist_user)
        client.post(f"/gyne-cytology/{outlab_case.id}/outlab-test-result/approve")

        result = get_gyne_archive(db, search=outlab_case.accession_no)
        row = next(r for r in result["items"] if r["case_id"] == outlab_case.id)
        assert row["has_outlab_result"] is True


class TestOutlabResultApprovedFilter:
    def test_get_gyne_cases_filters_by_approval_state(self, db, client, admin_user, pathologist_user):
        user, _ = admin_user
        _login_as(client, admin_user)

        pending_case = make_bare_gyne_case(db, registrar_id=user.id)
        pending_case.is_out_lab = True
        db.commit()
        _upload(client, pending_case.id)

        approved_case = make_bare_gyne_case(db, registrar_id=user.id)
        approved_case.is_out_lab = True
        db.commit()
        _upload(client, approved_case.id)

        _login_as(client, pathologist_user)
        client.post(f"/gyne-cytology/{approved_case.id}/outlab-test-result/approve")

        pending_ids = [
            c.id for c in
            get_gyne_cases(db, is_out_lab=True, has_out_lab_result=True, outlab_result_approved=False, limit=500)["items"]
        ]
        approved_ids = [
            c.id for c in
            get_gyne_cases(db, is_out_lab=True, has_out_lab_result=True, outlab_result_approved=True, limit=500)["items"]
        ]

        assert pending_case.id in pending_ids
        assert pending_case.id not in approved_ids
        assert approved_case.id in approved_ids
        assert approved_case.id not in pending_ids
