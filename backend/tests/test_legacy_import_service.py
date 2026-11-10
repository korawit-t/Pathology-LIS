"""Reading an old system's export: file formats, cell conversion and the
per-row mapping in app/services/legacy_import_service.py. No database."""

import io
from datetime import datetime

import pytest
from openpyxl import Workbook

from app.schemas.legacy_import import ImportMapping
from app.services import legacy_import_service as svc


def _xlsx(rows, sheet="Sheet1", extra_sheet=None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    for r in rows:
        ws.append(r)
    if extra_sheet:
        ws2 = wb.create_sheet(extra_sheet[0])
        for r in extra_sheet[1]:
            ws2.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _mapping(**overrides) -> ImportMapping:
    body = {
        "report_type": "surgical",
        "source_system": "old",
        "fields": {
            "source_ref": {"column": "No"},
            "accession_no": {"column": "No"},
            "patient_full_name": {"column": "Name"},
            "reported_at": {"column": "Date"},
        },
    }
    body.update(overrides)
    return ImportMapping.model_validate(body)


class TestReadTable:
    def test_xlsx_rows_keep_their_sheet_row_numbers_and_skip_blank_rows(self):
        data = _xlsx([["No", "Name"], ["S1", "A"], [None, None], ["S2", "B"]])
        t = svc.read_table(data)
        assert t.sheets == ["Sheet1"]
        assert t.headers == ["No", "Name"]
        assert [n for n, _ in t.rows] == [2, 4]

    def test_xlsx_picks_the_named_sheet_and_header_row(self):
        data = _xlsx([["x"]], extra_sheet=("Reports", [["title line"], ["No", "Name"], ["S1", "A"]]))
        t = svc.read_table(data, sheet="Reports", header_row=2)
        assert t.sheet == "Reports"
        assert t.headers == ["No", "Name"]
        assert t.rows == [(3, ["S1", "A"])]

    def test_unknown_sheet_is_refused(self):
        with pytest.raises(svc.ImportFileError):
            svc.read_table(_xlsx([["No"]]), sheet="Nope")

    def test_blank_and_repeated_headers_get_distinct_names(self):
        t = svc.read_table(_xlsx([["No", None, "No", "Name"], ["1", "x", "2", "A"]]))
        assert t.headers == ["No", "คอลัมน์ B", "No (2)", "Name"]

    def test_csv_utf8_with_bom(self):
        t = svc.read_table("﻿No,ชื่อ\nS1,สมชาย\n".encode("utf-8"))
        assert t.headers == ["No", "ชื่อ"]
        assert t.rows == [(2, ["S1", "สมชาย"])]

    def test_csv_saved_by_thai_excel_as_windows_874(self):
        t = svc.read_table("No;ชื่อ\r\nS1;สมหญิง\r\n".encode("cp874"))
        assert t.headers == ["No", "ชื่อ"]
        assert t.rows[0][1] == ["S1", "สมหญิง"]

    def test_old_binary_xls_is_refused_with_a_way_out(self):
        with pytest.raises(svc.ImportFileError, match="Save As"):
            svc.read_table(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 100)

    def test_empty_file_is_refused(self):
        with pytest.raises(svc.ImportFileError):
            svc.read_table(b"")

    def test_too_many_rows_is_refused(self, monkeypatch):
        monkeypatch.setattr(svc, "MAX_ROWS", 2)
        with pytest.raises(svc.ImportFileError):
            svc.read_table(b"No\n1\n2\n3\n")


class TestParseDate:
    @pytest.mark.parametrize("raw, expected", [
        ("31/12/2567", datetime(2024, 12, 31)),
        ("31/12/2024", datetime(2024, 12, 31)),
        ("2024-12-31", datetime(2024, 12, 31)),
        ("2024-12-31T08:15:00", datetime(2024, 12, 31, 8, 15)),
        ("2567/01/15", datetime(2024, 1, 15)),
        ("25670115", datetime(2024, 1, 15)),
        (25670115, datetime(2024, 1, 15)),
        ("31 ธ.ค. 2567", datetime(2024, 12, 31)),
        ("5 มกราคม 2566 เวลา 10.30 น.", datetime(2023, 1, 5, 10, 30)),
        ("12 Jan 2024 10:30", datetime(2024, 1, 12, 10, 30)),
        (datetime(2567, 3, 1), datetime(2024, 3, 1)),  # BE year typed into an Excel date cell
        (datetime(2024, 3, 1, 9, 0), datetime(2024, 3, 1, 9, 0)),
        (45321, datetime(2024, 1, 30)),  # Excel serial in a cell not formatted as a date
    ])
    def test_accepted_forms(self, raw, expected):
        assert svc.parse_date(raw) == expected

    @pytest.mark.parametrize("raw", ["31/12/67", "2024-02-30", "1 xyz 2024", "yesterday", "31/12/1700"])
    def test_refused_forms(self, raw):
        with pytest.raises(ValueError):
            svc.parse_date(raw)


class TestSplitFullName:
    @pytest.mark.parametrize("raw, expected", [
        ("นางสาวสมหญิง ใจดี", ("นางสาว", "สมหญิง", "ใจดี")),
        ("นาย สมชาย  ใจดี", ("นาย", "สมชาย", "ใจดี")),
        ("น.ส.มาลี ศรี สุข", ("น.ส.", "มาลี", "ศรี สุข")),
        ("Mr.John Smith", ("Mr.", "John", "Smith")),
        ("Mrs Jane Doe", ("Mrs", "Jane", "Doe")),
        ("สมศรี", (None, "สมศรี", None)),
    ])
    def test_split(self, raw, expected):
        assert svc.split_full_name(raw, svc.BUILTIN_TITLES) == expected

    def test_a_title_match_that_would_cut_a_thai_name_in_half_is_not_a_title(self):
        # "นาย" + "ิกา": the remainder would start with a vowel mark
        assert svc.split_full_name("นายิกา ใจดี", svc.BUILTIN_TITLES) == (None, "นายิกา", "ใจดี")

    def test_a_latin_title_needs_a_space_or_a_dot(self):
        assert svc.split_full_name("Missy Elliott", svc.BUILTIN_TITLES) == (None, "Missy", "Elliott")

    def test_a_title_from_the_labs_own_titles_table(self):
        assert svc.split_full_name("ร.ต.อ.สมชาย กล้าหาญ", ["ร.ต.อ."]) == ("ร.ต.อ.", "สมชาย", "กล้าหาญ")


class TestOtherConversions:
    @pytest.mark.parametrize("raw, expected", [("45", 45), ("45 ปี 3 เดือน", 45), (45.0, 45), (7, 7)])
    def test_age(self, raw, expected):
        assert svc.parse_int(raw) == expected

    @pytest.mark.parametrize("raw", ["ไม่ทราบ", "200"])
    def test_bad_age(self, raw):
        with pytest.raises(ValueError):
            svc.parse_int(raw)

    @pytest.mark.parametrize("raw, expected", [("Y", True), ("ใช่", True), ("1", True), (1, True), ("N", False), ("ไม่ใช่", False), (0, False)])
    def test_bool(self, raw, expected):
        assert svc.parse_bool(raw) is expected

    def test_bool_refuses_what_it_cannot_read(self):
        with pytest.raises(ValueError):
            svc.parse_bool("maybe")

    def test_whole_numbers_from_excel_lose_the_trailing_zero(self):
        assert svc.cell_text(1234.0) == "1234"


class TestSuggestFields:
    def test_headers_are_matched_loosely_and_source_ref_follows_accession(self):
        s = svc.suggest_fields("surgical", ["HN", "ชื่อ-นามสกุล", "Surgical No.", "Report Date", "Diagnosis", "Hospital"])
        assert s["patient_hn"] == "HN"
        assert s["patient_full_name"] == "ชื่อ-นามสกุล"
        assert s["accession_no"] == "Surgical No."
        assert s["source_ref"] == "Surgical No."
        assert s["reported_at"] == "Report Date"
        assert s["diagnosis_summary"] == "Diagnosis"
        assert s["hospital"] == "Hospital"

    def test_each_column_is_suggested_once(self):
        s = svc.suggest_fields("nongyne", ["Diagnosis"])
        assert list(s.values()).count("Diagnosis") == 1


class TestCheckMapping:
    def test_unknown_field_is_refused(self):
        m = _mapping()
        m.fields["no_such_field"] = m.fields["accession_no"]
        with pytest.raises(svc.ImportFileError, match="no_such_field"):
            svc.check_mapping(m, ["No", "Name", "Date"])

    def test_a_column_the_file_does_not_have_is_refused(self):
        with pytest.raises(svc.ImportFileError, match="Date"):
            svc.check_mapping(_mapping(), ["No", "Name"])

    def test_required_fields_must_be_mapped(self):
        m = _mapping(fields={"source_ref": {"column": "No"}})
        with pytest.raises(svc.ImportFileError) as exc:
            svc.check_mapping(m, ["No"])
        assert "Accession" in str(exc.value)
        assert "ชื่อผู้ป่วย" in str(exc.value)

    def test_a_gyne_only_field_is_unknown_on_surgical(self):
        m = _mapping()
        m.fields["category_1_text"] = m.fields["accession_no"]
        with pytest.raises(svc.ImportFileError):
            svc.check_mapping(m, ["No", "Name", "Date"])


class TestMapRow:
    headers = ["No", "Name", "Date", "Title", "Age", "CID", "Malignant"]

    def _row(self, cells, **mapping_overrides):
        m = _mapping(**mapping_overrides)
        return svc.map_row(5, cells, self.headers, m, svc.BUILTIN_TITLES)

    def test_a_good_row(self):
        r = self._row(["S1", "นางสมศรี มีสุข", "1/2/2567", None, None, None, None])
        assert r.errors == []
        assert r.values["accession_no"] == "S1"
        assert r.values["source_ref"] == "S1"
        assert (r.values["patient_title"], r.values["patient_name"], r.values["patient_ln"]) == ("นาง", "สมศรี", "มีสุข")
        assert r.values["reported_at"] == datetime(2024, 2, 1)
        assert r.values["published_at"] == datetime(2024, 2, 1)
        assert r.values["report_type"] == "Final"

    def test_a_separate_title_column_wins_over_the_split_name(self):
        fields = {**_mapping().model_dump()["fields"], "patient_title": {"column": "Title"}}
        r = self._row(["S1", "นางสมศรี มีสุข", "1/2/2567", "Mrs.", None, None, None], fields=fields)
        assert r.values["patient_title"] == "Mrs."
        assert r.values["patient_name"] == "สมศรี"

    def test_a_fixed_value(self):
        fields = {**_mapping().model_dump()["fields"], "pathologist_name": {"value": "นพ. ก"}}
        r = self._row(["S1", "A B", "1/2/2567", None, None, None, None], fields=fields)
        assert r.values["pathologist_name"] == "นพ. ก"

    def test_missing_required_values_are_row_errors(self):
        r = self._row([None, None, None, None, None, None, None])
        assert {f for f, _ in r.errors} == {"source_ref", "accession_no", "patient_name", "reported_at"}

    def test_an_unreadable_date_is_reported_once(self):
        r = self._row(["S1", "A B", "เมื่อวาน", None, None, None, None])
        assert [f for f, _ in r.errors] == ["reported_at"]

    def test_cid_keeps_digits_and_warns_when_not_13(self):
        fields = {**_mapping().model_dump()["fields"], "patient_cid": {"column": "CID"}}
        r = self._row(["S1", "A B", "1/2/2567", None, None, "1-2345-67890-12-3", None], fields=fields)
        assert r.values["patient_cid"] == "1234567890123"
        assert r.warnings == []
        r = self._row(["S1", "A B", "1/2/2567", None, None, "12345", None], fields=fields)
        assert [f for f, _ in r.warnings] == ["patient_cid"]

    def test_bool_and_int_fields(self):
        fields = {**_mapping().model_dump()["fields"], "patient_age": {"column": "Age"}, "has_malignancy": {"column": "Malignant"}}
        r = self._row(["S1", "A B", "1/2/2567", None, "61 ปี", None, "Y"], fields=fields)
        assert r.values["patient_age"] == 61
        assert r.values["has_malignancy"] is True

    def test_long_text_keeps_its_lines(self):
        m = _mapping(fields={**_mapping().model_dump()["fields"], "diagnosis_summary": {"column": "Title"}})
        r = svc.map_row(2, ["S1", "A B", "1/2/2567", "Line 1  \r\nLine 2", None, None, None], self.headers, m, [])
        assert r.values["diagnosis_summary"] == "Line 1\nLine 2"


class TestImportMappingSchema:
    def test_a_field_needs_a_column_or_a_value_not_both(self):
        with pytest.raises(ValueError):
            ImportMapping.model_validate({"report_type": "gyne", "source_system": "x", "fields": {"accession_no": {"column": "A", "value": "B"}}})
        with pytest.raises(ValueError):
            ImportMapping.model_validate({"report_type": "gyne", "source_system": "x", "fields": {"accession_no": {}}})

    def test_source_system_is_required(self):
        with pytest.raises(ValueError):
            ImportMapping.model_validate({"report_type": "gyne", "source_system": "   "})
