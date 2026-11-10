"""HTTP surface of the legacy report import (app/routers/legacy_import.py):
admin only, preview shows what commit will do, a second import of the same
rows does not duplicate them, and rolling a batch back removes what it
inserted.

Every test uses its own source_system and accession numbers: commits in this
suite are real and stay visible to later tests."""

import io
import json
import uuid

from openpyxl import Workbook

from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_import import LegacyImportBatch
from app.models.legacy_surgical_report import LegacySurgicalReport
from tests.factories import make_hospital


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _csv(rows) -> bytes:
    return "\n".join(",".join(r) for r in rows).encode("utf-8")


def _xlsx(rows) -> bytes:
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _mapping(source, **overrides):
    body = {
        "report_type": "surgical",
        "source_system": source,
        "fields": {
            "source_ref": {"column": "No"},
            "accession_no": {"column": "No"},
            "patient_full_name": {"column": "Name"},
            "patient_hn": {"column": "HN"},
            "reported_at": {"column": "Date"},
            "diagnosis_summary": {"column": "Dx"},
            "hospital": {"column": "Hosp"},
        },
    }
    body.update(overrides)
    return body


def _post(client, path, data: bytes, mapping=None, name="export.csv", **form):
    payload = {k: (json.dumps(v) if k == "mapping" else str(v)) for k, v in form.items()}
    if mapping is not None:
        payload["mapping"] = json.dumps(mapping)
    return client.post(path, files={"file": (name, data, "application/octet-stream")}, data=payload)


class TestAccess:
    def test_requires_login(self, client):
        assert client.get("/legacy-imports/fields").status_code == 401

    def test_pathologist_is_refused(self, pathologist_client):
        assert pathologist_client.get("/legacy-imports/fields").status_code == 403
        assert pathologist_client.get("/legacy-imports/batches").status_code == 403

    def test_lab_manager_is_refused(self, lab_manager_client):
        assert lab_manager_client.get("/legacy-imports/profiles").status_code == 403

    def test_clinician_is_refused(self, clinician_client):
        assert clinician_client.get("/legacy-imports/fields").status_code == 403

    def test_admin_gets_the_fields_of_all_three_types(self, admin_client):
        r = admin_client.get("/legacy-imports/fields")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"surgical", "gyne", "nongyne"}
        keys = {f["key"] for f in body["gyne"]}
        assert {"source_ref", "accession_no", "category_1_text", "hospital"} <= keys
        assert "diagnosis_summary" not in keys


class TestInspect:
    def test_headers_sample_and_suggestions(self, admin_client):
        data = _xlsx([["Surgical No", "HN", "ชื่อ-นามสกุล", "Report Date"], ["S1", 1234.0, "นายก ข", "1/1/2567"]])
        r = _post(admin_client, "/legacy-imports/inspect", data, name="old.xlsx", report_type="surgical")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["headers"] == ["Surgical No", "HN", "ชื่อ-นามสกุล", "Report Date"]
        assert body["sample_rows"] == [["S1", "1234", "นายก ข", "1/1/2567"]]
        assert body["total_rows"] == 1
        assert body["sheets"] == ["Sheet"]
        assert body["suggested_fields"]["accession_no"] == "Surgical No"
        assert body["suggested_fields"]["source_ref"] == "Surgical No"
        assert body["suggested_fields"]["patient_full_name"] == "ชื่อ-นามสกุล"

    def test_a_file_that_cannot_be_read_is_a_400(self, admin_client):
        r = _post(admin_client, "/legacy-imports/inspect", b"", report_type="surgical")
        assert r.status_code == 400

    def test_too_large_is_a_413(self, admin_client, monkeypatch):
        from app.services import legacy_import_service as svc
        monkeypatch.setattr(svc, "MAX_FILE_BYTES", 10)
        r = _post(admin_client, "/legacy-imports/inspect", b"No\n" + b"1\n" * 20, report_type="surgical")
        assert r.status_code == 413


class TestPreviewAndCommit:
    def _file(self, hospital, acc):
        return _csv([
            ["No", "Name", "HN", "Date", "Dx", "Hosp"],
            [acc[0], "นางสาวสมหญิง ใจดี", "HN1", "15/01/2567", "Benign", hospital.code],
            [acc[1], "นายสมชาย รักดี", "HN2", "16/01/2567", "Carcinoma", hospital.name],
            [acc[2], "", "HN3", "17/01/2567", "x", hospital.code],          # no name
            [acc[3], "ด.ญ.มาลี สุข", "HN4", "18/01/2567", "y", "รพ.ที่ไม่มีในระบบ"],
            [acc[0], "นางสาวสมหญิง ใจดี", "HN1", "15/01/2567", "dup", hospital.code],  # repeated ref
        ])

    def test_preview_reports_what_commit_will_do(self, admin_client, db):
        hospital = make_hospital(db)
        acc = [f"OLD-{_uid()}" for _ in range(4)]
        r = _post(admin_client, "/legacy-imports/preview", self._file(hospital, acc), _mapping(f"src-{_uid()}"))
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["total_rows"] == 5
        assert p["valid_rows"] == 2
        assert p["error_rows"] == 3
        assert p["new_rows"] == 2
        errors = {(i["row"], i["field"]) for i in p["issues"] if i["level"] == "error"}
        assert errors == {(4, "patient_name"), (5, "hospital"), (6, "source_ref")}
        by_value = {h["value"]: h for h in p["hospital_values"]}
        assert by_value[hospital.code]["hospital_id"] == hospital.id
        assert by_value[hospital.code]["matched_by"] == "code"
        assert by_value[hospital.name]["matched_by"] == "name"
        assert by_value["รพ.ที่ไม่มีในระบบ"]["hospital_id"] is None
        first = p["sample"][0]["values"]
        assert first["patient_title"] == "นางสาว"
        assert first["reported_at"].startswith("2024-01-15")
        assert first["hospital_id"] == hospital.id

    def test_choosing_a_hospital_on_the_page_fixes_the_row(self, admin_client, db):
        hospital = make_hospital(db)
        acc = [f"OLD-{_uid()}" for _ in range(4)]
        m = _mapping(f"src-{_uid()}", hospital_values={"รพ.ที่ไม่มีในระบบ": hospital.id})
        p = _post(admin_client, "/legacy-imports/preview", self._file(hospital, acc), m).json()
        assert p["valid_rows"] == 3
        assert {h["value"]: h["matched_by"] for h in p["hospital_values"]}["รพ.ที่ไม่มีในระบบ"] == "mapping"

    def test_commit_refuses_rows_with_errors_unless_told_to_skip_them(self, admin_client, db):
        hospital = make_hospital(db)
        acc = [f"OLD-{_uid()}" for _ in range(4)]
        source = f"src-{_uid()}"
        data = self._file(hospital, acc)
        r = _post(admin_client, "/legacy-imports/commit", data, _mapping(source))
        assert r.status_code == 422
        assert db.query(LegacySurgicalReport).filter(LegacySurgicalReport.source_system == source).count() == 0

        r = _post(admin_client, "/legacy-imports/commit", data, _mapping(source), skip_invalid="true")
        assert r.status_code == 201, r.text
        batch = r.json()
        assert (batch["inserted_count"], batch["error_count"], batch["total_rows"]) == (2, 3, 5)
        assert batch["status"] == "committed"
        assert batch["created_by_name"]

        rows = (
            db.query(LegacySurgicalReport)
            .filter(LegacySurgicalReport.source_system == source)
            .order_by(LegacySurgicalReport.accession_no)
            .all()
        )
        assert sorted(r.accession_no for r in rows) == sorted(acc[:2])
        row = next(r for r in rows if r.accession_no == acc[0])
        assert (row.patient_title, row.patient_name, row.patient_ln) == ("นางสาว", "สมหญิง", "ใจดี")
        assert row.hospital_id == hospital.id
        assert row.hospital_name == hospital.name
        assert row.status == "published"
        assert row.report_type == "Final"
        assert row.reported_at.year == 2024 and row.published_at == row.reported_at
        assert row.diagnosis_summary == "Benign"
        assert row.source_ref == acc[0]
        assert row.import_batch_id == batch["id"]
        assert row.has_malignancy is False  # column default still applies

    def test_imported_rows_show_up_in_the_legacy_report_search(self, admin_client, db):
        hospital = make_hospital(db)
        acc = f"OLD-{_uid()}"
        data = _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], [acc, "นาย ก ข", "HN9", "1/3/2567", "d", hospital.code]])
        assert _post(admin_client, "/legacy-imports/commit", data, _mapping(f"src-{_uid()}")).status_code == 201
        found = admin_client.get("/legacy-reports/search", params={"q": acc}).json()
        assert [i["accession_no"] for i in found["items"]] == [acc]

    def test_a_mapping_that_names_a_missing_column_is_a_400(self, admin_client):
        data = _csv([["No", "Name"], ["1", "A"]])
        r = _post(admin_client, "/legacy-imports/preview", data, _mapping(f"src-{_uid()}"))
        assert r.status_code == 400
        assert "Date" in r.json()["detail"]

    def test_a_malformed_mapping_is_a_422(self, admin_client):
        r = admin_client.post(
            "/legacy-imports/preview",
            files={"file": ("x.csv", b"No\n1\n", "text/csv")},
            data={"mapping": json.dumps({"report_type": "nope"})},
        )
        assert r.status_code == 422

    def test_an_unknown_default_hospital_is_a_400(self, admin_client):
        data = _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], ["1", "A", "H", "1/1/2567", "d", ""]])
        r = _post(admin_client, "/legacy-imports/preview", data, _mapping(f"src-{_uid()}", default_hospital_id=987654321))
        assert r.status_code == 400

    def test_default_hospital_fills_empty_cells_and_no_hospital_is_a_warning(self, admin_client, db):
        hospital = make_hospital(db)
        data = _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], [f"OLD-{_uid()}", "A B", "H", "1/1/2567", "d", ""]])
        source = f"src-{_uid()}"
        p = _post(admin_client, "/legacy-imports/preview", data, _mapping(source)).json()
        assert p["valid_rows"] == 1
        assert [i["field"] for i in p["issues"]] == ["hospital"]
        p = _post(admin_client, "/legacy-imports/preview", data, _mapping(source, default_hospital_id=hospital.id)).json()
        assert p["issues"] == []
        assert p["sample"][0]["values"]["hospital_id"] == hospital.id


class TestReimport:
    def _data(self, hospital, acc, dx="Benign"):
        return _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], [acc, "นาย ก ข", "HN1", "1/2/2567", dx, hospital.code]])

    def test_the_same_rows_again_are_skipped_by_default(self, admin_client, db):
        hospital = make_hospital(db)
        acc, source = f"OLD-{_uid()}", f"src-{_uid()}"
        data = self._data(hospital, acc)
        first = _post(admin_client, "/legacy-imports/commit", data, _mapping(source)).json()

        p = _post(admin_client, "/legacy-imports/preview", data, _mapping(source)).json()
        assert (p["new_rows"], p["existing_rows"]) == (0, 1)
        assert [b["id"] for b in p["same_file_batches"]] == [first["id"]]

        second = _post(admin_client, "/legacy-imports/commit", data, _mapping(source)).json()
        assert (second["inserted_count"], second["skipped_count"], second["updated_count"]) == (0, 1, 0)
        assert db.query(LegacySurgicalReport).filter(LegacySurgicalReport.accession_no == acc).count() == 1

    def test_update_mode_overwrites_the_mapped_fields(self, admin_client, db):
        hospital = make_hospital(db)
        acc, source = f"OLD-{_uid()}", f"src-{_uid()}"
        first = _post(admin_client, "/legacy-imports/commit", self._data(hospital, acc), _mapping(source)).json()
        second = _post(
            admin_client, "/legacy-imports/commit", self._data(hospital, acc, dx="Revised"),
            _mapping(source, on_duplicate="update"),
        ).json()
        assert (second["inserted_count"], second["updated_count"]) == (0, 1)
        row = db.query(LegacySurgicalReport).filter(LegacySurgicalReport.accession_no == acc).one()
        assert row.diagnosis_summary == "Revised"
        assert row.import_batch_id == first["id"]  # still belongs to the batch that created it

    def test_another_source_with_the_same_accession_is_a_warning(self, admin_client, db):
        hospital = make_hospital(db)
        acc = f"OLD-{_uid()}"
        db.add(LegacySurgicalReport(accession_no=acc, patient_name="typed by hand", status="published"))
        db.commit()
        p = _post(admin_client, "/legacy-imports/preview", self._data(hospital, acc), _mapping(f"src-{_uid()}")).json()
        assert p["valid_rows"] == 1
        assert [i["field"] for i in p["issues"]] == ["accession_no"]


class TestRollback:
    def test_rollback_deletes_what_the_batch_inserted_once(self, admin_client, db):
        hospital = make_hospital(db)
        acc, source = f"OLD-{_uid()}", f"src-{_uid()}"
        data = _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], [acc, "A B", "H", "1/1/2567", "d", hospital.code]])
        batch = _post(admin_client, "/legacy-imports/commit", data, _mapping(source)).json()

        r = admin_client.post(f"/legacy-imports/batches/{batch['id']}/rollback")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "rolled_back"
        assert r.json()["rolled_back_count"] == 1
        assert r.json()["rolled_back_by_name"]
        db.expire_all()
        assert db.query(LegacySurgicalReport).filter(LegacySurgicalReport.accession_no == acc).count() == 0

        assert admin_client.post(f"/legacy-imports/batches/{batch['id']}/rollback").status_code == 409

        # A rolled-back batch does not count as "this file was imported before".
        p = _post(admin_client, "/legacy-imports/preview", data, _mapping(source)).json()
        assert p["same_file_batches"] == []
        assert p["new_rows"] == 1

    def test_rollback_of_an_unknown_batch_is_a_404(self, admin_client):
        assert admin_client.post("/legacy-imports/batches/987654321/rollback").status_code == 404

    def test_a_gyne_import_with_a_fixed_hospital_and_its_rollback(self, admin_client, db):
        hospital = make_hospital(db)
        acc, source = f"OLD-{_uid()}", f"src-{_uid()}"
        gyne = {
            "report_type": "gyne",
            "source_system": source,
            "fields": {
                "source_ref": {"column": "No"},
                "accession_no": {"column": "No"},
                "patient_name": {"column": "Name"},
                "reported_at": {"column": "Date"},
                "category_1_text": {"column": "Cat"},
                "hospital": {"value": hospital.code},
            },
        }
        data = _csv([["No", "Name", "Date", "Cat"], [acc, "A", "2024-01-01", "NILM"]])
        batch = _post(admin_client, "/legacy-imports/commit", data, gyne).json()
        assert batch["report_type"] == "gyne"
        row = db.query(LegacyGyneCytoReport).filter(LegacyGyneCytoReport.accession_no == acc).one()
        assert row.category_1_text == "NILM"
        assert row.hospital_id == hospital.id
        admin_client.post(f"/legacy-imports/batches/{batch['id']}/rollback")
        db.expire_all()
        assert db.query(LegacyGyneCytoReport).filter(LegacyGyneCytoReport.accession_no == acc).count() == 0


class TestBatchList:
    def test_newest_first(self, admin_client, db):
        hospital = make_hospital(db)
        source = f"src-{_uid()}"
        for _ in range(2):
            data = _csv([["No", "Name", "HN", "Date", "Dx", "Hosp"], [f"OLD-{_uid()}", "A B", "H", "1/1/2567", "d", hospital.code]])
            _post(admin_client, "/legacy-imports/commit", data, _mapping(source))
        body = admin_client.get("/legacy-imports/batches", params={"limit": 2}).json()
        assert body["total"] >= 2
        ids = [b["id"] for b in body["items"]]
        assert ids == sorted(ids, reverse=True)
        assert "mapping" not in body["items"][0]
        assert db.query(LegacyImportBatch).filter(LegacyImportBatch.source_system == source).count() == 2


class TestProfiles:
    def test_create_list_update_delete(self, admin_client):
        name = f"Old LIS {_uid()}"
        r = admin_client.post("/legacy-imports/profiles", json={"name": name, "mapping": _mapping("old-lis")})
        assert r.status_code == 201, r.text
        profile = r.json()
        assert profile["report_type"] == "surgical"
        assert profile["mapping"]["fields"]["accession_no"] == {"column": "No", "value": None}

        assert admin_client.post("/legacy-imports/profiles", json={"name": name, "mapping": _mapping("x")}).status_code == 409

        listed = admin_client.get("/legacy-imports/profiles", params={"report_type": "surgical"}).json()
        assert name in [p["name"] for p in listed]
        assert name not in [p["name"] for p in admin_client.get("/legacy-imports/profiles", params={"report_type": "gyne"}).json()]

        new_mapping = _mapping("old-lis", on_duplicate="update")
        r = admin_client.put(f"/legacy-imports/profiles/{profile['id']}", json={"name": name + " v2", "mapping": new_mapping})
        assert r.status_code == 200
        assert r.json()["mapping"]["on_duplicate"] == "update"

        assert admin_client.delete(f"/legacy-imports/profiles/{profile['id']}").status_code == 204
        assert admin_client.delete(f"/legacy-imports/profiles/{profile['id']}").status_code == 404
