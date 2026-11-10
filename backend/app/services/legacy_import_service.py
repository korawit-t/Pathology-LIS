"""Reading a report export from an old system and turning its rows into
legacy report rows, by the column mapping chosen on the import page.

Everything here works on the file alone. app/crud/legacy_import.py does what
needs the database: matching hospitals, finding rows already imported, and
writing.

The target fields per report type are declared once in FIELDS. A field's
kind decides how a cell is read: dates take ISO, d/m/yyyy, Thai or English
month names and Buddhist-era years; a "full_name" cell is split into title,
first name and surname; a "hospital" cell is matched to a hospital later.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any, Iterable, Literal, Optional

from app.schemas.legacy_import import ImportMapping

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ROWS = 50_000

FieldKind = Literal["text", "longtext", "date", "int", "bool", "full_name", "hospital"]


class ImportFileError(ValueError):
    """The file, or the mapping as a whole, cannot be used. The message is
    shown to the user as is."""


# ── Target fields ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TargetField:
    key: str
    label: str
    kind: FieldKind = "text"
    required: bool = False
    group: str = "report"
    aliases: tuple[str, ...] = ()
    help: Optional[str] = None


SOURCE_REF = "source_ref"
FULL_NAME = "patient_full_name"
HOSPITAL = "hospital"

_KEY_FIELDS = [
    TargetField(
        SOURCE_REF, "รหัสอ้างอิงในระบบเดิม", required=True, group="key",
        help="ค่าที่ไม่ซ้ำกันในระบบเดิม ใช้จำว่าแถวไหนนำเข้าไปแล้ว ส่วนใหญ่ใช้คอลัมน์เดียวกับ Accession No.",
    ),
    TargetField(
        "accession_no", "Accession No.", required=True, group="key",
        aliases=("accession", "accessionno", "accno", "labno", "pathno", "surgicalno", "cytono", "เลขที่", "เลขที่รายงาน", "เลขพยาธิ"),
    ),
]

_PATIENT_FIELDS = [
    TargetField(
        FULL_NAME, "ชื่อ-นามสกุล (ทั้งชื่อในช่องเดียว)", kind="full_name", group="patient",
        aliases=("fullname", "patientname", "name", "ชื่อสกุล", "ชื่อนามสกุล", "ชื่อผู้ป่วย"),
        help="แยกเป็นคำนำหน้า ชื่อ นามสกุลให้ ถ้าจับคู่ช่องคำนำหน้า/ชื่อ/นามสกุลแยกไว้ด้วย ช่องที่แยกจะถูกใช้ก่อน",
    ),
    TargetField("patient_title", "คำนำหน้า", group="patient", aliases=("title", "prefix", "pname", "คำนำหน้า", "คำนำหน้าชื่อ")),
    TargetField(
        "patient_name", "ชื่อ", group="patient", aliases=("firstname", "fname", "ชื่อ", "ชื่อจริง"),
        help="ต้องมีชื่อผู้ป่วย จากช่องนี้หรือจากช่องชื่อ-นามสกุล",
    ),
    TargetField("patient_ln", "นามสกุล", group="patient", aliases=("lastname", "lname", "surname", "นามสกุล")),
    TargetField("patient_hn", "HN", group="patient", aliases=("hn", "hospitalnumber")),
    TargetField("patient_cid", "เลขบัตรประชาชน", group="patient", aliases=("cid", "idcard", "citizenid", "เลขบัตรประชาชน", "เลขประจำตัวประชาชน")),
    TargetField("patient_birth_date", "วันเกิด", kind="date", group="patient", aliases=("birthdate", "dob", "birthday", "วันเกิด", "วันเดือนปีเกิด")),
    TargetField("patient_age", "อายุ (ปี)", kind="int", group="patient", aliases=("age", "อายุ")),
    TargetField("patient_gender", "เพศ", group="patient", aliases=("sex", "gender", "เพศ")),
]

_SOURCE_FIELDS = [
    TargetField(
        HOSPITAL, "โรงพยาบาลผู้ส่ง", kind="hospital", group="source",
        aliases=("hospital", "hospcode", "hospitalname", "hcode", "โรงพยาบาล", "รพ", "หน่วยงาน", "หน่วยงานที่ส่ง"),
        help="จับคู่กับรายชื่อโรงพยาบาลในระบบ รายงานที่ไม่มีโรงพยาบาล บัญชีฝั่งโรงพยาบาลและแพทย์ผู้ส่งจะมองไม่เห็น",
    ),
    TargetField("department_name", "แผนก/หอผู้ป่วย", group="source", aliases=("department", "ward", "dept", "แผนก", "หอผู้ป่วย")),
    TargetField("clinician_name", "แพทย์ผู้ส่ง", group="source", aliases=("clinician", "doctor", "physician", "แพทย์ผู้ส่ง", "แพทย์")),
]

_META_FIELDS = [
    TargetField("pathologist_name", "พยาธิแพทย์", group="meta", aliases=("pathologist", "พยาธิแพทย์", "แพทย์ผู้รายงาน")),
    TargetField(
        "reported_at", "วันที่ออกรายงาน", kind="date", required=True, group="meta",
        aliases=("reportdate", "reported", "reportedat", "signdate", "signoutdate", "วันที่รายงาน", "วันที่ออกผล", "วันที่ออกรายงาน"),
    ),
    TargetField("approved_at", "วันที่อนุมัติ", kind="date", group="meta", aliases=("approvedate", "approvedat", "วันที่อนุมัติ")),
    TargetField(
        "published_at", "วันที่เผยแพร่", kind="date", group="meta", aliases=("publishdate", "publishedat"),
        help="ว่างไว้ได้ ระบบใช้วันที่ออกรายงานแทน",
    ),
    TargetField("report_type", "ประเภทรายงาน", group="meta", help="เช่น Final, Addendum ว่างไว้ = Final"),
]

_SURGICAL_FIELDS = [
    TargetField("collect_at", "วันที่เก็บสิ่งส่งตรวจ", kind="date", group="source", aliases=("collectdate", "collectedat", "วันที่เก็บ")),
    TargetField("registered_at", "วันที่ลงทะเบียน", kind="date", group="source", aliases=("registerdate", "receivedate", "receiveddate", "วันที่รับ", "วันที่ลงทะเบียน")),
    TargetField("clinical_history_snapshot", "Clinical history", kind="longtext", group="diagnosis", aliases=("clinicalhistory", "history", "clinicalinfo", "ประวัติ")),
    TargetField("specimen_summary", "Specimen", kind="longtext", group="diagnosis", aliases=("specimen", "specimens", "สิ่งส่งตรวจ")),
    TargetField("gross_description_summary", "Gross description", kind="longtext", group="diagnosis", aliases=("gross", "grossdescription")),
    TargetField("microscopic_summary", "Microscopic description", kind="longtext", group="diagnosis", aliases=("microscopic", "microscopicdescription", "micro")),
    TargetField("diagnosis_summary", "Diagnosis", kind="longtext", group="diagnosis", aliases=("diagnosis", "finaldiagnosis", "dx", "ผลวินิจฉัย")),
    TargetField("comment_summary", "Comment", kind="longtext", group="diagnosis", aliases=("comment", "comments", "note", "หมายเหตุ")),
    TargetField("has_malignancy", "มะเร็ง (ใช่/ไม่ใช่)", kind="bool", group="diagnosis", aliases=("malignancy", "malignant", "hasmalignancy")),
    TargetField("has_critical", "ค่าวิกฤต (ใช่/ไม่ใช่)", kind="bool", group="diagnosis", aliases=("critical", "hascritical")),
    TargetField("is_pending", "รอผลเพิ่มเติม (ใช่/ไม่ใช่)", kind="bool", group="diagnosis"),
    TargetField("pending_reason", "เหตุผลที่รอผล", kind="longtext", group="diagnosis"),
    TargetField("approver_name_snapshot", "ผู้อนุมัติ", group="meta", aliases=("approver", "approvedby")),
]

_GYNE_FIELDS = [
    TargetField("adequacy_text", "Specimen adequacy", group="diagnosis", aliases=("adequacy", "specimenadequacy")),
    TargetField("endocervical_status_text", "Endocervical component", group="diagnosis", aliases=("endocervical", "endocervicalcomponent", "tz")),
    TargetField("quality_text", "Quality indicator", group="diagnosis", aliases=("quality",)),
    TargetField("category_1_text", "General categorization", group="diagnosis", aliases=("category", "category1", "generalcategorization", "result")),
    TargetField("category_2_text", "Interpretation category", group="diagnosis", aliases=("category2", "bethesda", "tbs")),
    TargetField("interpretation", "Interpretation / Result", kind="longtext", group="diagnosis", aliases=("interpretation", "diagnosis", "ผลตรวจ")),
    TargetField("note", "Note", kind="longtext", group="diagnosis", aliases=("note", "comment", "remark", "หมายเหตุ")),
    TargetField("cytotechnologist_name", "Cytotechnologist", group="meta", aliases=("cytotechnologist", "cytotech", "screener")),
]

_NONGYNE_FIELDS = [
    TargetField("clinical_history_snapshot", "Clinical history", kind="longtext", group="diagnosis", aliases=("clinicalhistory", "history", "ประวัติ")),
    TargetField("clinical_diagnosis_snapshot", "Clinical diagnosis", kind="longtext", group="diagnosis", aliases=("clinicaldiagnosis", "provisionaldiagnosis")),
    TargetField("specimen_type", "Specimen type", group="diagnosis", aliases=("specimen", "specimentype", "สิ่งส่งตรวจ")),
    TargetField("collection_site", "Collection site", group="diagnosis", aliases=("site", "collectionsite", "ตำแหน่ง")),
    TargetField("gross_description", "Gross description", kind="longtext", group="diagnosis", aliases=("gross", "grossdescription")),
    TargetField("microscopic_description", "Microscopic description", kind="longtext", group="diagnosis", aliases=("microscopic", "microscopicdescription", "micro")),
    TargetField("diagnosis", "Diagnosis", kind="longtext", group="diagnosis", aliases=("diagnosis", "dx", "ผลวินิจฉัย")),
    TargetField("comment", "Comment", kind="longtext", group="diagnosis", aliases=("comment", "comments", "note", "หมายเหตุ")),
    TargetField("has_malignancy", "มะเร็ง (ใช่/ไม่ใช่)", kind="bool", group="diagnosis", aliases=("malignancy", "malignant")),
    TargetField("is_pending", "รอผลเพิ่มเติม (ใช่/ไม่ใช่)", kind="bool", group="diagnosis"),
    TargetField("pending_reason", "เหตุผลที่รอผล", kind="longtext", group="diagnosis"),
    TargetField("cytotechnologist_name", "Cytotechnologist", group="meta", aliases=("cytotechnologist", "cytotech", "screener")),
]

FIELDS: dict[str, list[TargetField]] = {
    "surgical": _KEY_FIELDS + _PATIENT_FIELDS + _SOURCE_FIELDS + _SURGICAL_FIELDS + _META_FIELDS,
    "gyne": _KEY_FIELDS + _PATIENT_FIELDS + _SOURCE_FIELDS + _GYNE_FIELDS + _META_FIELDS,
    "nongyne": _KEY_FIELDS + _PATIENT_FIELDS + _SOURCE_FIELDS + _NONGYNE_FIELDS + _META_FIELDS,
}


def fields_by_key(report_type: str) -> dict[str, TargetField]:
    return {f.key: f for f in FIELDS[report_type]}


# ── Reading the file ──────────────────────────────────────────────────────────

@dataclass
class Table:
    sheets: list[str]
    sheet: Optional[str]
    headers: list[str]
    # (row number as the user sees it in the file, cells aligned to headers)
    rows: list[tuple[int, list[Any]]]


def read_table(data: bytes, sheet: Optional[str] = None, header_row: int = 1) -> Table:
    if not data:
        raise ImportFileError("ไฟล์ว่าง")
    if len(data) > MAX_FILE_BYTES:
        raise ImportFileError(f"ไฟล์ใหญ่เกิน {MAX_FILE_BYTES // (1024 * 1024)} MB แบ่งไฟล์ก่อนนำเข้า")
    if data[:4] == b"PK\x03\x04":
        return _read_xlsx(data, sheet, header_row)
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        raise ImportFileError("ยังไม่รองรับไฟล์ .xls แบบเก่า เปิดใน Excel แล้ว Save As เป็น .xlsx หรือ .csv ก่อน")
    return _read_csv(data, header_row)


def _read_xlsx(data: bytes, sheet: Optional[str], header_row: int) -> Table:
    from openpyxl import load_workbook

    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # zip without a workbook, corrupt file, ...
        raise ImportFileError("อ่านไฟล์ Excel ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ .xlsx") from exc
    try:
        names = list(wb.sheetnames)
        if not names:
            raise ImportFileError("ไฟล์ Excel ไม่มีชีต")
        if sheet is None:
            sheet = names[0]
        elif sheet not in names:
            raise ImportFileError(f"ไม่พบชีต “{sheet}” ในไฟล์")
        headers, rows = _split_rows(wb[sheet].iter_rows(values_only=True), header_row)
    finally:
        wb.close()
    return Table(sheets=names, sheet=sheet, headers=headers, rows=rows)


def _read_csv(data: bytes, header_row: int) -> Table:
    text = None
    # Thai Excel saves "CSV" as Windows-874 unless told to use UTF-8.
    for encoding in ("utf-8-sig", "cp874"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None or "\x00" in text:
        raise ImportFileError("อ่านไฟล์ไม่ได้ รองรับ .xlsx และ .csv (UTF-8 หรือ Windows-874)")
    try:
        delimiter = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|").delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    headers, rows = _split_rows(reader, header_row)
    return Table(sheets=[], sheet=None, headers=headers, rows=rows)


def _split_rows(raw_rows: Iterable[Iterable[Any]], header_row: int) -> tuple[list[str], list[tuple[int, list[Any]]]]:
    it = iter(raw_rows)
    header: Optional[list[Any]] = None
    for number, row in enumerate(it, start=1):
        if number == header_row:
            header = list(row)
            break
    if header is None or all(_blank(c) for c in header):
        raise ImportFileError(f"แถวที่ {header_row} ไม่มีหัวคอลัมน์")

    # Excel often reports trailing columns that only ever held formatting.
    while header and _blank(header[-1]):
        header.pop()
    headers = _clean_headers(header)
    width = len(headers)

    rows: list[tuple[int, list[Any]]] = []
    for number, row in enumerate(it, start=header_row + 1):
        cells = list(row)[:width]
        if len(cells) < width:
            cells.extend([None] * (width - len(cells)))
        if all(_blank(c) for c in cells):
            continue
        if len(rows) >= MAX_ROWS:
            raise ImportFileError(f"ไฟล์มีเกิน {MAX_ROWS:,} แถว แบ่งไฟล์ก่อนนำเข้า")
        rows.append((number, cells))
    return headers, rows


def _column_letter(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def _clean_headers(header: list[Any]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for i, cell in enumerate(header):
        name = " ".join(str(cell).split()) if not _blank(cell) else ""
        if not name:
            name = f"คอลัมน์ {_column_letter(i)}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        out.append(name)
    return out


# ── Mapping suggestions ───────────────────────────────────────────────────────

def _norm_header(s: str) -> str:
    return re.sub(r"[\s_\-./()#:]+", "", s).casefold()


def suggest_fields(report_type: str, headers: list[str]) -> dict[str, str]:
    """Guess a column for each target field from the header names. Each
    column is suggested once, except that source_ref follows accession_no
    (the usual choice of key)."""
    by_norm = {}
    for h in headers:
        by_norm.setdefault(_norm_header(h), h)
    used: set[str] = set()
    out: dict[str, str] = {}
    for f in FIELDS[report_type]:
        if f.key == SOURCE_REF:
            continue
        for candidate in (f.key, f.label, *f.aliases):
            header = by_norm.get(_norm_header(candidate))
            if header and header not in used:
                out[f.key] = header
                used.add(header)
                break
    if "accession_no" in out:
        out[SOURCE_REF] = out["accession_no"]
    return out


# ── Reading one cell ──────────────────────────────────────────────────────────

def _blank(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def cell_text(v: Any) -> Optional[str]:
    """A cell as the text a person would read in it."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else str(v)
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M") if (v.hour or v.minute) else v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, time):
        return v.strftime("%H:%M")
    s = str(v).replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ").replace("​", "")
    return s.strip() or None


def _short_text(v: Any) -> Optional[str]:
    s = cell_text(v)
    return " ".join(s.split()) if s else None


def _long_text(v: Any) -> Optional[str]:
    s = cell_text(v)
    if not s:
        return None
    lines = [line.rstrip() for line in s.split("\n")]
    return "\n".join(lines).strip() or None


_TH_MONTHS = [
    ("มกราคม", "มค"), ("กุมภาพันธ์", "กพ"), ("มีนาคม", "มีค"), ("เมษายน", "เมย"),
    ("พฤษภาคม", "พค"), ("มิถุนายน", "มิย"), ("กรกฎาคม", "กค"), ("สิงหาคม", "สค"),
    ("กันยายน", "กย"), ("ตุลาคม", "ตค"), ("พฤศจิกายน", "พย"), ("ธันวาคม", "ธค"),
]
_EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july",
              "august", "september", "october", "november", "december"]
_MONTHS: dict[str, int] = {}
for _i, (_full, _short) in enumerate(_TH_MONTHS, start=1):
    _MONTHS[_full] = _i
    _MONTHS[_short] = _i
for _i, _name in enumerate(_EN_MONTHS, start=1):
    _MONTHS[_name] = _i
    _MONTHS[_name[:3]] = _i
_MONTHS["sept"] = 9

_TIME = r"(?:\s+(?:เวลา\s*)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\.\d+)?\s*(?:น\.?)?)?"
_ISO_RE = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?")
_YMD_RE = re.compile(r"(\d{4})[/.](\d{1,2})[/.](\d{1,2})" + _TIME)
_DMY_RE = re.compile(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})" + _TIME)
_DMONY_RE = re.compile(r"(\d{1,2})\s*([^\d\s][^\d]*?)\s*(\d{2,4})" + _TIME)
_YMD8_RE = re.compile(r"(\d{4})(\d{2})(\d{2})")


def _year(y: int) -> int:
    if y < 100:
        raise ValueError("ปีต้องเป็นตัวเลข 4 หลัก")
    # Buddhist era: no Gregorian year in these reports comes near 2400.
    if y >= 2400:
        y -= 543
    if not 1850 <= y <= datetime.now().year + 1:
        raise ValueError(f"ปี {y} อยู่นอกช่วงที่เป็นไปได้")
    return y


def _make_dt(y, mo, d, h=None, mi=None, s=None) -> datetime:
    try:
        return datetime(_year(int(y)), int(mo), int(d), int(h or 0), int(mi or 0), int(s or 0))
    except ValueError as exc:
        if "ปี" in str(exc):
            raise
        raise ValueError("วันที่ไม่ถูกต้อง") from exc


def parse_date(v: Any) -> datetime:
    if isinstance(v, datetime):
        if v.year >= 2400:
            return _make_dt(v.year, v.month, v.day, v.hour, v.minute, v.second)
        return v
    if isinstance(v, date):
        return _make_dt(v.year, v.month, v.day)
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if isinstance(v, int) or float(v).is_integer():
            m = _YMD8_RE.fullmatch(str(int(v)))
            if m:
                return _make_dt(*m.groups())
        if 1 <= v < 2958466:
            from openpyxl.utils.datetime import from_excel
            return parse_date(from_excel(v))
        raise ValueError("อ่านวันที่ไม่ได้")

    s = " ".join(str(v).split())
    m = _ISO_RE.fullmatch(s)
    if m:
        return _make_dt(*m.groups())
    m = _YMD8_RE.fullmatch(s) or _YMD_RE.fullmatch(s)
    if m:
        return _make_dt(*m.groups())
    m = _DMY_RE.fullmatch(s)
    if m:
        d, mo, y, h, mi, sec = m.groups()
        return _make_dt(y, mo, d, h, mi, sec)
    m = _DMONY_RE.fullmatch(s)
    if m:
        d, month_word, y, h, mi, sec = m.groups()
        month = _MONTHS.get(re.sub(r"[\s.]", "", month_word).casefold())
        if month is None:
            raise ValueError(f"ไม่รู้จักชื่อเดือน “{month_word.strip()}”")
        return _make_dt(y, month, d, h, mi, sec)
    raise ValueError("อ่านวันที่ไม่ได้ ใช้รูปแบบ 31/12/2567, 2024-12-31 หรือ 31 ธ.ค. 2567")


def parse_int(v: Any) -> int:
    if isinstance(v, bool):
        raise ValueError("ไม่ใช่ตัวเลข")
    if isinstance(v, (int, float)):
        n = int(v)
    else:
        m = re.match(r"\s*(\d+)", str(v))
        if not m:
            raise ValueError("ไม่ใช่ตัวเลข")
        n = int(m.group(1))
    if not 0 <= n <= 150:
        raise ValueError(f"อายุ {n} อยู่นอกช่วงที่เป็นไปได้")
    return n


_TRUE = {"1", "y", "yes", "true", "t", "x", "✓", "✔", "มี", "ใช่", "positive", "pos", "+"}
_FALSE = {"0", "n", "no", "false", "f", "-", "ไม่มี", "ไม่ใช่", "negative", "neg"}


def parse_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    s = (cell_text(v) or "").strip().casefold()
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    raise ValueError(f"อ่าน “{cell_text(v)}” เป็นใช่/ไม่ใช่ไม่ได้ ใช้ Y/N, 1/0 หรือ ใช่/ไม่ใช่")


# Titles that the titles table may not list. The table is read too
# (crud passes its rows in), so a lab's own titles count as well.
BUILTIN_TITLES = (
    "นาย", "นาง", "นางสาว", "น.ส.", "ด.ช.", "ด.ญ.", "เด็กชาย", "เด็กหญิง",
    "ดร.", "นพ.", "พญ.", "ทพ.", "ทพญ.", "ภก.", "ภญ.", "พระ", "พระภิกษุ", "สามเณร", "แม่ชี",
    "Mr.", "Mrs.", "Ms.", "Miss", "Master", "Dr.", "Mr", "Mrs", "Ms", "Dr",
)
# Thai vowel and tone marks that cannot begin a name: a "title" match that
# leaves one of these first cut a name in half (นาย|ิกา).
_THAI_MARKS = re.compile(r"[ัิ-ฺ็-๎]")
_THAI = re.compile(r"[฀-๿]")


def split_full_name(v: Any, titles: Iterable[str]) -> tuple[Optional[str], str, Optional[str]]:
    s = _short_text(v)
    if not s:
        raise ValueError("ไม่มีชื่อ")
    title = None
    for t in sorted({t.strip() for t in titles if t and t.strip()}, key=len, reverse=True):
        if not s.casefold().startswith(t.casefold()):
            continue
        rest = s[len(t):]
        if not rest.strip():
            continue
        if _THAI.search(t) and not t.endswith(".") and _THAI_MARKS.match(rest):
            continue
        if not _THAI.search(t) and not t.endswith(".") and not rest[:1].isspace():
            continue  # "Missy" is not "Miss y"
        title, s = s[: len(t)], rest.strip()
        break
    parts = s.split(" ", 1)
    first = parts[0]
    last = parts[1].strip() if len(parts) > 1 else None
    return title, first, last


def _clean_cid(v: Any) -> tuple[Optional[str], Optional[str]]:
    s = _short_text(v)
    if not s:
        return None, None
    digits = re.sub(r"[\s\-]", "", s)
    warning = None if re.fullmatch(r"\d{13}", digits) else "เลขบัตรประชาชนไม่ใช่ตัวเลข 13 หลัก"
    return digits, warning


# ── Mapping one row ───────────────────────────────────────────────────────────

@dataclass
class RowResult:
    row: int
    values: dict[str, Any] = field(default_factory=dict)
    hospital_value: Optional[str] = None
    existing_id: Optional[int] = None
    errors: list[tuple[Optional[str], str]] = field(default_factory=list)
    warnings: list[tuple[Optional[str], str]] = field(default_factory=list)


def check_mapping(mapping: ImportMapping, headers: list[str]) -> None:
    """Refuse a mapping that cannot work for this file at all, before reading
    any row: an unknown field, a column the file does not have, or a
    required field left unmapped."""
    known = fields_by_key(mapping.report_type)
    unknown = [k for k in mapping.fields if k not in known]
    if unknown:
        raise ImportFileError(f"ไม่รู้จักช่อง: {', '.join(unknown)}")
    header_set = set(headers)
    missing_cols = sorted({src.column for src in mapping.fields.values() if src.column and src.column not in header_set})
    if missing_cols:
        raise ImportFileError(f"ไฟล์นี้ไม่มีคอลัมน์: {', '.join(missing_cols)}")
    unmapped = [f.label for f in known.values() if f.required and f.key not in mapping.fields]
    if "patient_name" not in mapping.fields and FULL_NAME not in mapping.fields:
        unmapped.append("ชื่อผู้ป่วย (ชื่อ หรือ ชื่อ-นามสกุล)")
    if unmapped:
        raise ImportFileError(f"ยังไม่ได้จับคู่: {', '.join(unmapped)}")


def map_row(row_no: int, cells: list[Any], headers: list[str], mapping: ImportMapping, titles: Iterable[str]) -> RowResult:
    known = fields_by_key(mapping.report_type)
    index = {h: i for i, h in enumerate(headers)}
    res = RowResult(row=row_no)
    name_parts: dict[str, Optional[str]] = {}

    for key, src in mapping.fields.items():
        f = known[key]
        raw = src.value if src.column is None else cells[index[src.column]]
        if f.kind == "hospital":
            res.hospital_value = _short_text(raw)
            continue
        if _blank(raw):
            continue
        try:
            if f.kind == "full_name":
                title, first, last = split_full_name(raw, titles)
                name_parts = {"patient_title": title, "patient_name": first, "patient_ln": last}
            elif f.kind == "date":
                res.values[key] = parse_date(raw)
            elif f.kind == "int":
                res.values[key] = parse_int(raw)
            elif f.kind == "bool":
                res.values[key] = parse_bool(raw)
            elif f.kind == "longtext":
                res.values[key] = _long_text(raw)
            elif key == "patient_cid":
                res.values[key], warning = _clean_cid(raw)
                if warning:
                    res.warnings.append((key, warning))
            else:
                res.values[key] = _short_text(raw)
        except ValueError as exc:
            res.errors.append((key, str(exc)))

    # Separate title/name/surname columns win over the split full name.
    for key, part in name_parts.items():
        if part and not res.values.get(key):
            res.values[key] = part

    if not res.values.get(SOURCE_REF):
        res.errors.append((SOURCE_REF, "ไม่มีรหัสอ้างอิง"))
    if not res.values.get("accession_no"):
        res.errors.append(("accession_no", "ไม่มี Accession No."))
    if not res.values.get("patient_name"):
        res.errors.append(("patient_name", "ไม่มีชื่อผู้ป่วย"))
    # Required, not only nice to have: the results-portal search sorts legacy
    # reports by published_at or reported_at.
    if not res.values.get("reported_at") and not any(k == "reported_at" for k, _ in res.errors):
        res.errors.append(("reported_at", "ไม่มีวันที่ออกรายงาน"))
    if res.values.get("reported_at") and not res.values.get("published_at"):
        res.values["published_at"] = res.values["reported_at"]
    if not res.values.get("report_type"):
        res.values["report_type"] = "Final"
    return res


def json_value(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat()
    return v
