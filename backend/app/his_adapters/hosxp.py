"""
HOSxP HIS Adapter
Queries patient/lab-order data from the HOSxP MySQL database.
Supports different case types: surgical, gyne (PAP), nongyne.
"""

import os
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.his_adapters import HisAdapterBase
from app.schemas.his import HisPatientResult


def _load_form_names() -> dict:
    """
    Load FORM_NAME_MAP from environment variables.
    Each env var is a pipe-separated (|) list of form names.
    Form names themselves may contain commas, so pipe is used as delimiter.
    Example: HOSXP_FORM_SURGICAL=Pathology
    Example: HOSXP_FORM_GYNE=PAP smear, liquid based cytology and HPV testing
    Example: HOSXP_FORM_NONGYNE=FNA|Body fluid cytology|Special stain/IHC PATHO
    """
    raw = {
        "surgical": os.getenv("HOSXP_FORM_SURGICAL", "Pathology"),
        "gyne": os.getenv(
            "HOSXP_FORM_GYNE", "PAP smear, liquid based cytology and HPV testing"
        ),
        "nongyne": os.getenv("HOSXP_FORM_NONGYNE", "FNA, Body fluid cytology"),
    }
    # Split each value by pipe and strip whitespace
    return {
        k: [name.strip() for name in v.split("|") if name.strip()]
        for k, v in raw.items()
    }


FORM_NAME_MAP = _load_form_names()


def _build_in_clause(names: List[str]) -> str:
    """Build a SQL IN clause like ('val1', 'val2') from a list of strings."""
    quoted = ", ".join(f"'{n}'" for n in names)
    return f"({quoted})"


class HOSxPAdapter(HisAdapterBase):
    """Adapter for HOSxP Hospital Information System (MySQL)."""

    @property
    def his_name(self) -> str:
        return "HOSxP"

    def search_patients(
        self,
        db: Session,
        hn: Optional[str],
        date_start: Optional[str],
        date_end: Optional[str],
        case_type: str = "surgical",
    ) -> List[HisPatientResult]:
        # Get form_name list for the case type
        form_name_list = FORM_NAME_MAP.get(case_type, FORM_NAME_MAP["surgical"])
        form_names_sql = _build_in_clause(form_name_list)

        # Build WHERE conditions
        conditions = [f"lab_head.form_name IN {form_names_sql}"]
        params = {}

        if date_start and date_end:
            conditions.append("lab_head.order_date BETWEEN :date_start AND :date_end")
            params["date_start"] = f"{date_start} 00:00:00"
            params["date_end"] = f"{date_end} 23:59:59"

        if hn and hn.strip():
            conditions.append("patient.hn = :hn")
            params["hn"] = hn.strip()

        where_clause = " AND ".join(conditions)

        sql = text(
            f"""  # nosec B608 — where_clause is built from code-controlled conditions, not raw user input
            SELECT
                lab_head.vn AS an,
                patient.hn,
                sex.name AS gender,
                sex.code AS gender_code,
                nationality.name AS nationality,
                patient.pname,
                patient.fname,
                patient.lname,
                patient.birthday,
                patient.cid,
                lab_head.lab_order_number,
                doctor.name AS doctor,
                lab_head.order_date,
                kskdepartment.department,
                lab_head.form_name,
                lab_head.ward,
                pttype.name AS pttype,
                (YEAR(CURDATE()) - YEAR(patient.birthday)) AS age
            FROM
                lab_head
                LEFT OUTER JOIN vn_stat ON lab_head.vn = vn_stat.vn
                LEFT JOIN patient ON lab_head.hn = patient.hn
                LEFT JOIN nationality ON patient.nationality = nationality.nationality
                LEFT JOIN sex ON patient.sex = sex.code
                LEFT JOIN patient_type ON patient.patient_type_id = patient_type.patient_type_id
                LEFT JOIN doctor ON lab_head.doctor_code = doctor.code
                LEFT JOIN pttype ON vn_stat.pttype = pttype.pttype
                INNER JOIN kskdepartment ON lab_head.order_department = kskdepartment.depcode
            WHERE
                {where_clause}
            ORDER BY
                lab_head.order_date, patient.hn
        """
        )

        result = db.execute(sql, params)
        rows = result.mappings().all()

        return [self._map_row(row) for row in rows]

    @staticmethod
    def _map_row(row) -> HisPatientResult:
        """Map a DB row to HisPatientResult, splitting VN/AN by length."""
        raw_vn = str(row.get("an", "") or "").strip()
        # HOSxP lab_head.vn stores both VN (9 digits) and AN (12 digits)
        if len(raw_vn) > 9:
            an_val = raw_vn
            vn_val = ""
        else:
            vn_val = raw_vn
            an_val = ""

        return HisPatientResult(
            an=an_val,
            vn=vn_val,
            hn=str(row.get("hn", "") or ""),
            gender=str(row.get("gender", "") or ""),
            gender_code=int(row["gender_code"]) if row.get("gender_code") else None,
            nationality=str(row.get("nationality", "") or ""),
            pname=str(row.get("pname", "") or ""),
            fname=str(row.get("fname", "") or ""),
            lname=str(row.get("lname", "") or ""),
            birthday=str(row.get("birthday", "") or ""),
            cid=str(row.get("cid", "") or ""),
            lab_order_number=str(row.get("lab_order_number", "") or ""),
            doctor=str(row.get("doctor", "") or ""),
            order_date=str(row.get("order_date", "") or ""),
            department=str(row.get("department", "") or ""),
            form_name=str(row.get("form_name", "") or ""),
            ward=str(row.get("ward", "") or ""),
            pttype=str(row.get("pttype", "") or ""),
            age=int(row["age"]) if row.get("age") is not None else None,
        )
