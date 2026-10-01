"""Diagnosis-search report: find cases by specimen text + diagnosis text.

Thin HTTP glue over `crud.diagnosis_search` — one JSON endpoint for the
on-screen table, and one .xlsx endpoint that re-runs the same query and renders
it to a spreadsheet. The export is built server-side rather than from the rows
already in the browser because an HN like "0012345" only survives in a format
that can declare the cell as text; see app/services/xlsx_service.py.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.roles import CAN_READ_DIAGNOSIS_SEARCH
from app.crud import diagnosis_search as crud
from app.db.database import get_db
from app.dependencies.auth import (
    check_password_status,
    get_current_user,
    get_scoped_hospital_ids,
)
from app.models.user import User
from app.schemas.diagnosis_search import DiagnosisSearchResponse
from app.utils.time import local_now

router = APIRouter(
    prefix="/diagnosis-search",
    tags=["Diagnosis Search Report"],
    dependencies=[Depends(check_password_status), Depends(CAN_READ_DIAGNOSIS_SEARCH)],
)

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


class SearchQuery:
    """The query-string contract, shared by the JSON and .xlsx endpoints so the
    two can never drift into answering different questions."""

    def __init__(
        self,
        specimen_terms: List[str] = Query(default=[]),
        diagnosis_terms: List[str] = Query(default=[]),
        match_mode: str = Query("all", pattern="^(all|any)$"),
        include_gross: bool = Query(False),
        include_microscopic: bool = Query(False),
        date_field: str = Query("registered", pattern="^(registered|reported)$"),
        date_from: Optional[date] = Query(None),
        date_to: Optional[date] = Query(None),
        hospital_id: Optional[int] = Query(None),
        only_reported: bool = Query(True),
        limit: int = Query(crud.MAX_ROWS, ge=1, le=crud.MAX_ROWS),
    ):
        self.specimen_terms = crud.normalize_terms(specimen_terms)
        self.diagnosis_terms = crud.normalize_terms(diagnosis_terms)
        if not self.specimen_terms and not self.diagnosis_terms:
            # An unconstrained query would just dump every reported case, which
            # is what the case list page is for — make the caller name a term.
            raise HTTPException(
                status_code=400,
                detail="At least one specimen term or diagnosis term is required.",
            )
        self.match_mode = match_mode
        self.include_gross = include_gross
        self.include_microscopic = include_microscopic
        self.date_field = date_field
        self.date_from = date_from
        self.date_to = date_to
        self.hospital_id = hospital_id
        self.only_reported = only_reported
        self.limit = limit

    def run(self, db: Session, current_user: User) -> dict:
        return crud.search_cases(
            db,
            specimen_terms=self.specimen_terms,
            diagnosis_terms=self.diagnosis_terms,
            match_mode=self.match_mode,
            include_gross=self.include_gross,
            include_microscopic=self.include_microscopic,
            date_field=self.date_field,
            date_from=self.date_from,
            date_to=self.date_to,
            hospital_id=self.hospital_id,
            only_reported=self.only_reported,
            scoped_hospital_ids=get_scoped_hospital_ids(current_user),
            limit=self.limit,
        )

    def as_criteria(self, db: Session) -> dict:
        return {
            "specimen_terms": self.specimen_terms,
            "diagnosis_terms": self.diagnosis_terms,
            "match_mode": self.match_mode,
            "include_gross": self.include_gross,
            "include_microscopic": self.include_microscopic,
            "date_field": self.date_field,
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "hospital_name": crud.resolve_hospital_name(db, self.hospital_id),
            "only_reported": self.only_reported,
        }


@router.get("", response_model=DiagnosisSearchResponse)
def search_cases(
    q: SearchQuery = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = q.run(db, current_user)
    return {**result, "criteria": q.as_criteria(db)}


@router.get("/xlsx")
def export_xlsx(
    q: SearchQuery = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.xlsx_service import Column, build_table_workbook

    result = q.run(db, current_user)
    criteria = q.as_criteria(db)

    joiner = " และ " if q.match_mode == "all" else " หรือ "
    extras = [
        label
        for label, on in (
            ("รวม gross description", q.include_gross),
            ("รวม microscopic description", q.include_microscopic),
            ("เฉพาะเคสที่ออกรายงานแล้ว", q.only_reported),
        )
        if on
    ]
    date_label = (
        "วันที่ออกรายงาน" if q.date_field == "reported" else "วันที่รับสิ่งส่งตรวจ"
    )

    criteria_block = [
        ("Specimen มีคำว่า", joiner.join(q.specimen_terms) or "-"),
        ("Diagnosis มีคำว่า", joiner.join(q.diagnosis_terms) or "-"),
        (
            "เงื่อนไขคำค้น",
            "ครบทุกคำ (AND)" if q.match_mode == "all" else "คำใดคำหนึ่ง (OR)",
        ),
        (
            "ช่วงวันที่",
            f"{criteria['date_from'] or '-'} ถึง {criteria['date_to'] or '-'} ({date_label})",
        ),
        ("โรงพยาบาล", criteria["hospital_name"] or "ทั้งหมด"),
        ("ตัวเลือกเพิ่มเติม", " · ".join(extras) or "-"),
        ("เคสที่เข้าเงื่อนไข", str(result["total"])),
        ("ติดธง Malignancy", str(result["malignant_count"])),
        ("ออกไฟล์เมื่อ", local_now().strftime("%d/%m/%Y %H:%M")),
        ("ออกไฟล์โดย", current_user.full_name or current_user.username),
    ]

    def _date(key):
        return lambda row: row[key].strftime("%d/%m/%Y") if row.get(key) else ""

    columns = [
        Column("ลำดับ", lambda row: row["_no"], width=7),
        # as_text on both identifier columns: an accession number is
        # "S26-00001" today but an HN is digits, and Excel strips the leading
        # zeros off "0012345" the moment it decides the column is numeric.
        Column("Accession No.", lambda row: row["accession_no"], width=15, as_text=True),
        Column("HN", lambda row: row["hn"] or "", width=13, as_text=True),
        Column("ชื่อผู้ป่วย", lambda row: row["patient_name"], width=26),
        Column("เพศ", lambda row: row["gender"] or "", width=7),
        Column("โรงพยาบาล", lambda row: row["hospital_name"] or "", width=22),
        Column(
            "ชิ้นเนื้อที่ตรงเงื่อนไข",
            lambda row: "; ".join(row["matched_specimens"]),
            width=34,
            wrap=True,
        ),
        Column("วันที่รับ", _date("registered_at"), width=12, as_text=True),
        Column("วันที่รายงาน", _date("report_at"), width=12, as_text=True),
        Column("พยาธิแพทย์", lambda row: row["pathologist_name"] or "", width=20),
        Column(
            "Malignancy",
            lambda row: "Yes"
            if row["has_malignancy"] is True
            else ("No" if row["has_malignancy"] is False else ""),
            width=11,
        ),
        Column(
            "ข้อความวินิจฉัยที่ตรงเงื่อนไข",
            lambda row: " | ".join(row["matched_diagnoses"]),
            width=60,
            wrap=True,
        ),
    ]

    rows = [{**item, "_no": i} for i, item in enumerate(result["items"], start=1)]

    footnotes = [
        "เงื่อนไขการจับคู่: นับเป็นเคสที่เข้าเงื่อนไขเมื่อเคสนั้นมีชิ้นเนื้ออย่างน้อยหนึ่งชิ้นที่ตรงคำค้นฝั่ง specimen "
        "และมีการวินิจฉัยอย่างน้อยหนึ่งรายการที่ตรงคำค้นฝั่ง diagnosis (ไม่นับรายการที่ยกเลิก) "
        "ทั้งสองฝั่งอาจมาจากชิ้นเนื้อต่างชิ้นกันในเคสเดียวได้ จึงแสดงชิ้นเนื้อและข้อความวินิจฉัยที่ตรงเงื่อนไขไว้ให้ตรวจทาน"
    ]
    if result["total"] > len(rows):
        footnotes.insert(
            0,
            f"* ไฟล์นี้มี {len(rows)} เคสแรกจากทั้งหมด {result['total']} เคส "
            "— แบ่งช่วงวันที่ให้แคบลงเพื่อออกให้ครบ",
        )

    blob = build_table_workbook(
        title="รายงานค้นหาเคสตามชิ้นเนื้อและการวินิจฉัย (Diagnosis Search Report)",
        sheet_title="Diagnosis Search",
        criteria=criteria_block,
        columns=columns,
        rows=rows,
        footnotes=footnotes,
    )

    filename = f"diagnosis_search_{local_now().strftime('%Y%m%d%H%M')}.xlsx"
    return Response(
        content=blob,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
