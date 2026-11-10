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
from datetime import datetime

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


def _keys(items):
    # ids repeat across the three tables, so a row is (case_type, id).
    return [(i["case_type"], i["id"]) for i in items]


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

    def test_rows_with_and_without_dates_sort_together(self, db, pathologist_client):
        # REGRESSION: the sort key fell back to "" for a row with neither
        # published_at nor reported_at, and comparing it with a dated row's
        # datetime raised TypeError — the whole search answered 500. Imported
        # rows always carry dates and hand-typed ones often don't, so the two
        # meet as soon as anything is imported.
        name = f"Zzmixeddates{uuid.uuid4().hex[:6]}"
        dated = _legacy(db, LegacySurgicalReport, patient_name=name, reported_at=datetime(2024, 1, 2))
        undated = _legacy(db, LegacyGyneCytoReport, patient_name=name)

        r = pathologist_client.get("/legacy-reports/search", params={"q": name})

        assert r.status_code == 200
        assert [i["id"] for i in r.json()["items"]] == [dated.id, undated.id]

    def test_unpublished_rows_are_excluded(self, db, pathologist_client):
        _legacy(db, LegacySurgicalReport, patient_name="Zzdraftonlysearch", status="draft")

        r = pathologist_client.get("/legacy-reports/search", params={"q": "Zzdraftonlysearch"})

        assert r.json()["total"] == 0

    def test_newest_first_across_all_three_tables(self, db, pathologist_client):
        # published_at wins over reported_at; a row with neither comes last.
        name = f"Zzorder{uuid.uuid4().hex[:6]}"
        surgical = _legacy(db, LegacySurgicalReport, patient_name=name, published_at=datetime(2024, 3, 1))
        gyne = _legacy(db, LegacyGyneCytoReport, patient_name=name, reported_at=datetime(2024, 5, 1))
        nongyne = _legacy(
            db, LegacyNongyneCytoReport, patient_name=name,
            published_at=datetime(2024, 4, 1), reported_at=datetime(2024, 6, 1),
        )
        undated = _legacy(db, LegacyNongyneCytoReport, patient_name=name)

        r = pathologist_client.get("/legacy-reports/search", params={"q": name})

        assert r.status_code == 200
        assert _keys(r.json()["items"]) == [
            ("GYNE", gyne.id),
            ("NONGYNE", nongyne.id),
            ("SURGICAL", surgical.id),
            ("NONGYNE", undated.id),
        ]

    def test_skip_and_limit_page_through_the_union(self, db, pathologist_client):
        name = f"Zzpaging{uuid.uuid4().hex[:6]}"
        models = [LegacySurgicalReport, LegacyGyneCytoReport, LegacyNongyneCytoReport,
                  LegacySurgicalReport, LegacyGyneCytoReport]
        rows = [
            _legacy(db, model, patient_name=name, published_at=datetime(2023, 1, day))
            for day, model in enumerate(models, start=1)
        ]
        type_of = {LegacySurgicalReport: "SURGICAL", LegacyGyneCytoReport: "GYNE",
                   LegacyNongyneCytoReport: "NONGYNE"}
        expected = [(type_of[type(row)], row.id) for row in reversed(rows)]

        pages = []
        for skip in (0, 2, 4):
            r = pathologist_client.get(
                "/legacy-reports/search", params={"q": name, "skip": skip, "limit": 2},
            )
            assert r.status_code == 200
            assert r.json()["total"] == 5
            pages.append(_keys(r.json()["items"]))

        assert pages == [expected[0:2], expected[2:4], expected[4:5]]

        past_the_end = pathologist_client.get(
            "/legacy-reports/search", params={"q": name, "skip": 10, "limit": 2},
        ).json()
        assert past_the_end == {"items": [], "total": 5}

    def test_hospital_filter(self, db, pathologist_client):
        name = f"Zzhospital{uuid.uuid4().hex[:6]}"
        mine = [
            _legacy(db, LegacySurgicalReport, patient_name=name, hospital_id=901),
            _legacy(db, LegacyGyneCytoReport, patient_name=name, hospital_id=901),
            _legacy(db, LegacyNongyneCytoReport, patient_name=name, hospital_id=901),
        ]
        _legacy(db, LegacySurgicalReport, patient_name=name, hospital_id=902)
        _legacy(db, LegacyGyneCytoReport, patient_name=name)

        r = pathologist_client.get("/legacy-reports/search", params={"q": name, "hospital_id": 901})

        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        assert {i["id"] for i in body["items"]} == {row.id for row in mine}
        assert pathologist_client.get(
            "/legacy-reports/search", params={"q": name},
        ).json()["total"] == 5

    def test_response_shape_is_unchanged(self, db, pathologist_client):
        # The results portal's LegacySearchItem reads these keys. Gyne and
        # non-gyne have no registered_at column and have always shown
        # reported_at there; gyne has no is_pending.
        name = f"Zzshape{uuid.uuid4().hex[:6]}"
        surgical = _legacy(
            db, LegacySurgicalReport, patient_name=name, is_pending=True,
            registered_at=datetime(2024, 2, 1), reported_at=datetime(2024, 2, 3),
        )
        gyne = _legacy(db, LegacyGyneCytoReport, patient_name=name, reported_at=datetime(2024, 2, 2))
        nongyne = _legacy(db, LegacyNongyneCytoReport, patient_name=name, reported_at=datetime(2024, 1, 31))

        items = pathologist_client.get("/legacy-reports/search", params={"q": name}).json()["items"]

        assert set(items[0]) == {
            "id", "case_type", "accession_no", "patient_hn", "patient_title",
            "patient_name", "patient_ln", "status", "published_at", "reported_at",
            "registered_at", "clinician_name", "pathologist_name", "hospital_name",
            "is_read", "read_at", "report_id", "is_pending",
        }
        by_type = {i["case_type"]: i for i in items}
        assert by_type["SURGICAL"]["report_id"] == surgical.id
        assert by_type["SURGICAL"]["status"] == "published"
        assert by_type["SURGICAL"]["registered_at"] == "2024-02-01T00:00:00"
        assert by_type["SURGICAL"]["is_pending"] is True
        assert by_type["GYNE"]["id"] == gyne.id
        assert by_type["GYNE"]["registered_at"] == "2024-02-02T00:00:00"
        assert by_type["GYNE"]["is_pending"] is False
        assert by_type["NONGYNE"]["id"] == nongyne.id
        assert by_type["NONGYNE"]["registered_at"] == "2024-01-31T00:00:00"
        assert by_type["NONGYNE"]["is_pending"] is False

    def test_negative_skip_is_rejected(self, pathologist_client):
        r = pathologist_client.get("/legacy-reports/search", params={"skip": -1})
        assert r.status_code == 422


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
