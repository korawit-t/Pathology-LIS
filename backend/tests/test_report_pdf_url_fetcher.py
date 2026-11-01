"""Regression tests: a report PDF may load only the bundled fonts, the
templates, the uploaded logos and data: URIs.

Rich-text fields (clinical history, diagnosis, microscopic, comment) reach the
report templates unescaped, and WeasyPrint's default fetcher follows any URL.
A <link rel="attachment" href="file:///…/.env"> typed into a case's clinical
history therefore embedded that file in the PDF — a clinician account could
PATCH its own case and read the file back out of the preview. An
<img src="http://…"> made the server request any URL on its network.
pdf_service._ReportURLFetcher now refuses both.
"""

import io
import uuid
from pathlib import Path

import pytest
from pypdf import PdfReader
from weasyprint import HTML

from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.services import pdf_service
from tests.conftest import _make_user
from tests.factories import make_bare_nongyne_case, make_hospital

FONT_FILE = Path(pdf_service.FONT_DIR) / "Sarabun-Regular.ttf"


def _render(html: str) -> bytes:
    out = io.BytesIO()
    HTML(
        string=html, base_url=pdf_service.TEMPLATE_DIR, url_fetcher=pdf_service._ReportURLFetcher()
    ).write_pdf(out)
    return out.getvalue()


def _attachments(pdf: bytes) -> dict:
    return PdfReader(io.BytesIO(pdf)).attachments


def _font_names(pdf: bytes) -> list[str]:
    return [
        str(font.get_object().get("/BaseFont"))
        for page in PdfReader(io.BytesIO(pdf)).pages
        for font in (page["/Resources"].get("/Font") or {}).values()
    ]


@pytest.fixture
def secret_file(tmp_path):
    path = tmp_path / "fake.env"
    path.write_text(f"SECRET_KEY=canary-{uuid.uuid4().hex}")
    return path


class TestReportURLFetcher:
    def test_an_allowed_file_can_still_be_attached(self):
        # Proves the refusals below are the fetcher's doing, not WeasyPrint
        # ignoring <link rel="attachment"> altogether.
        pdf = _render(f'<link rel="attachment" href="{FONT_FILE.as_uri()}"><p>x</p>')
        assert FONT_FILE.name in _attachments(pdf)

    def test_a_file_outside_the_allowed_roots_is_not_attached(self, secret_file):
        pdf = _render(f'<link rel="attachment" href="{secret_file.as_uri()}"><p>x</p>')
        assert _attachments(pdf) == {}
        assert secret_file.read_bytes() not in pdf

    def test_dot_dot_out_of_an_allowed_root_is_refused(self):
        escaped = f"{Path(pdf_service.FONT_DIR).as_uri()}/../../app/core/config.py"
        with pytest.raises(ValueError):
            pdf_service._ReportURLFetcher().fetch(escaped)

    @pytest.mark.parametrize("url", ["http://127.0.0.1:9/x.png", "https://example.com/x.png", "ftp://127.0.0.1/x"])
    def test_network_urls_are_refused(self, url):
        with pytest.raises(ValueError):
            pdf_service._ReportURLFetcher().fetch(url)

    def test_a_file_url_naming_another_host_is_refused(self):
        with pytest.raises(ValueError):
            pdf_service._ReportURLFetcher().fetch(f"file://otherhost{FONT_FILE.as_posix()}")

    def test_data_uris_still_load(self):
        response = pdf_service._ReportURLFetcher().fetch("data:text/plain,hello")
        assert response.read() == b"hello"


def test_clinician_cannot_pull_a_server_file_through_clinical_history(client, db, admin_user, secret_file):
    registrar, _ = admin_user
    hospital = make_hospital(db)
    case = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hospital)
    create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="x"))
    clinician, pwd = _make_user(db, f"clin_{uuid.uuid4().hex[:8]}", "ClinPass1!", ["clinician"])
    clinician.hospitals = [hospital]
    db.commit()
    r = client.post("/auth/login", data={"username": clinician.username, "password": pwd})
    assert r.status_code == 200, r.text

    payload = f'<p>cough</p><link rel="attachment" href="{secret_file.as_uri()}">'
    r = client.patch(f"/nongyne-cytology/{case.id}", json={"clinical_history": payload, "clinical_diagnosis": payload})
    assert r.status_code == 200, r.text

    for url in (f"/nongyne-diagnosis/case/{case.id}/preview-pdf", f"/nongyne-cyto-reports/cases/{case.id}/preview-pdf"):
        r = client.get(url)
        assert r.status_code == 200, r.text
        assert _attachments(r.content) == {}, url
        assert secret_file.read_bytes() not in r.content
        # The report's own Thai font still comes through the same fetcher.
        assert any("Sarabun" in name for name in _font_names(r.content)), _font_names(r.content)
