"""
Custom SQL HIS Adapter
Reads SQL queries from hospital-specific files in backend/data/ (gitignored),
allowing any HIS schema without modifying Python code.

File lookup order per case_type:
  1. data/his_{case_type}.sql  (e.g. his_surgical.sql, his_gyne.sql, his_nongyne.sql)
  2. data/his_custom_query.sql  (backward-compatible fallback for all case types)

Setup:
  1. Set HIS_TYPE=custom in .env
  2. Create one or more SQL files in backend/data/ (see *.sql.example for templates)
  3. SQL must use :hn, :date_start, :date_end as bind parameters
  4. SQL must return columns matching HisPatientResult fields
"""
import os
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.his_adapters import HisAdapterBase
from app.schemas.his import HisPatientResult

_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
)

_REQUIRED_COLUMNS = (
    "an, vn, hn, gender, gender_code, nationality, pname, fname, lname, "
    "birthday, cid, lab_order_number, doctor, order_date, department, "
    "form_name, ward, pttype, age"
)


class CustomSQLAdapter(HisAdapterBase):
    """
    Adapter that loads hospital-specific SQL from gitignored files.
    No Python changes needed — configure via .env + SQL files only.
    """

    @property
    def his_name(self) -> str:
        return "Custom SQL"

    def _get_sql_path(self, case_type: str) -> str:
        """Return path to the SQL file for this case_type, with fallback."""
        specific = os.path.join(_DATA_DIR, f"his_{case_type}.sql")
        if os.path.exists(specific):
            return specific
        fallback = os.path.join(_DATA_DIR, "his_custom_query.sql")
        if os.path.exists(fallback):
            return fallback
        raise FileNotFoundError(
            f"No SQL file found for case_type='{case_type}'.\n"
            f"Create one of:\n"
            f"  • {specific}  (recommended — case-type specific)\n"
            f"  • {fallback}  (fallback — used for all case types)\n"
            f"See data/his_surgical.sql.example for the required column list.\n"
            f"Required columns: {_REQUIRED_COLUMNS}"
        )

    def _load_sql(self, case_type: str) -> str:
        path = self._get_sql_path(case_type)
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def search_patients(
        self,
        db: Session,
        hn: Optional[str],
        date_start: Optional[str],
        date_end: Optional[str],
        case_type: str = "surgical",
    ) -> List[HisPatientResult]:
        raw_sql = self._load_sql(case_type)

        params = {
            "date_start": f"{date_start} 00:00:00",
            "date_end": f"{date_end} 23:59:59",
            "hn": hn.strip() if hn and hn.strip() else "",
        }

        result = db.execute(text(raw_sql), params)
        rows = result.mappings().all()

        return [
            HisPatientResult(
                an=str(row.get("an", "") or ""),
                vn=str(row.get("vn", "") or ""),
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
            for row in rows
        ]
