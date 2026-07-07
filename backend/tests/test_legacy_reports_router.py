"""Router-level tests for app/routers/legacy_reports.py.
test_legacy_reports.py already covers _build_legacy_pdf_data's logo-snapshot
logic directly — this is the HTTP surface.

REGRESSION TEST for a real fix: this whole router previously had NO
authentication anywhere (no router-level dependencies=[], no per-route
get_current_user) — every endpoint was reachable by anyone with no login,
exposing historical patient report data. Fixed by adding CAN_READ_REPORT/
CAN_READ_GYNE_CYTO_REPORT/CAN_READ_NONGYNE_CYTO_REPORT per case-type group
(matching each type's live-report router) and get_current_user on the
mark-read routes (matching how the live-report routers' own mark-read is
intentionally looser than their read-gate). pathologist_client satisfies
all three read-role lists, so it's used uniformly below."""

import uuid

from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport

from tests.factories import make_system_setting


def _legacy(db, model, **overrides):
    fields = dict(
        accession_no=f"LEG-{uuid.uuid4().hex[:8]}",
        patient_hn=f"HN{uuid.uuid4().hex[:6]}",
        patient_name="Legacy",
        patient_ln="Patient",
        status="published",
    )
    fields.update(overrides)
    row = model(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestRequiresAuthentication:
    def test_search_requires_authentication(self, client):
        assert client.get("/legacy-reports/search").status_code == 401

    def test_surgical_list_requires_authentication(self, client):
        assert client.get("/legacy-reports/surgical").status_code == 401

    def test_gyne_list_requires_authentication(self, client):
        assert client.get("/legacy-reports/gyne").status_code == 401

    def test_nongyne_list_requires_authentication(self, client):
        assert client.get("/legacy-reports/nongyne").status_code == 401

    def test_pathologist_can_reach_all_three(self, pathologist_client):
        assert pathologist_client.get("/legacy-reports/search").status_code == 200
        assert pathologist_client.get("/legacy-reports/surgical").status_code == 200
        assert pathologist_client.get("/legacy-reports/gyne").status_code == 200
        assert pathologist_client.get("/legacy-reports/nongyne").status_code == 200


class TestSearch:
    def test_short_query_returns_empty(self, pathologist_client):
        r = pathologist_client.get("/legacy-reports/search", params={"q": "ab"})
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    def test_finds_across_all_three_case_types(self, db, pathologist_client):
        surgical = _legacy(db, LegacySurgicalReport, patient_name="Zzuniquesearchname")
        gyne = _legacy(db, LegacyGyneCytoReport, patient_name="Zzuniquesearchname")
        nongyne = _legacy(db, LegacyNongyneCytoReport, patient_name="Zzuniquesearchname")

        r = pathologist_client.get("/legacy-reports/search", params={"q": "Zzuniquesearchname"})

        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        case_types = {item["case_type"] for item in body["items"]}
        assert case_types == {"SURGICAL", "GYNE", "NONGYNE"}

    def test_unpublished_rows_are_excluded(self, db, pathologist_client):
        _legacy(db, LegacySurgicalReport, patient_name="Zzdraftonlysearch", status="draft")

        r = pathologist_client.get("/legacy-reports/search", params={"q": "Zzdraftonlysearch"})

        assert r.json()["total"] == 0


class TestSurgicalDetailAndPdf:
    def test_get_by_id(self, db, pathologist_client):
        report = _legacy(db, LegacySurgicalReport)
        r = pathologist_client.get(f"/legacy-reports/surgical/{report.id}")
        assert r.status_code == 200
        assert r.json()["accession_no"] == report.accession_no

    def test_get_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/legacy-reports/surgical/999999").status_code == 404

    def test_pdf_generates_real_bytes(self, db, pathologist_client):
        make_system_setting(db)
        report = _legacy(db, LegacySurgicalReport)

        r = pathologist_client.get(f"/legacy-reports/surgical/{report.id}/pdf")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_pdf_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/legacy-reports/surgical/999999/pdf").status_code == 404

    def test_mark_read(self, db, pathologist_client):
        report = _legacy(db, LegacySurgicalReport)

        r = pathologist_client.post(f"/legacy-reports/surgical/{report.id}/mark-read")

        assert r.status_code == 200
        db.refresh(report)
        assert report.is_read is True

    def test_mark_read_requires_authentication(self, client):
        assert client.post("/legacy-reports/surgical/1/mark-read").status_code == 401


class TestGyneAndNongyneMirrorTheSameEndpoints:
    def test_gyne_pdf(self, db, pathologist_client):
        make_system_setting(db)
        report = _legacy(db, LegacyGyneCytoReport)

        r = pathologist_client.get(f"/legacy-reports/gyne/{report.id}/pdf")

        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_nongyne_pdf(self, db, pathologist_client):
        make_system_setting(db)
        report = _legacy(db, LegacyNongyneCytoReport)

        r = pathologist_client.get(f"/legacy-reports/nongyne/{report.id}/pdf")

        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_gyne_mark_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.post("/legacy-reports/gyne/999999/mark-read").status_code == 404

    def test_nongyne_mark_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.post("/legacy-reports/nongyne/999999/mark-read").status_code == 404
