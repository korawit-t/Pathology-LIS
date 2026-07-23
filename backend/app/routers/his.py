"""
HIS (Hospital Information System) Integration Router
Uses the adapter pattern to support multiple HIS types (HOSxP, SSB, etc.).
Configure via HIS_TYPE in .env
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.db.his_database import get_his_db, is_his_configured
from app.schemas.his import HisPatientResult
from app.his_adapters import get_his_adapter
from app.his_adapters.hosxp import get_appointments as hosxp_get_appointments
from app.his_adapters.hosxp import get_hns_with_visit_today as hosxp_get_hns_with_visit_today
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/his",
    tags=["HIS Integration"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/patients", response_model=List[HisPatientResult])
def search_his_patients(
    hn: Optional[str] = Query(None, description="Patient HN (optional)"),
    date_start: Optional[str] = Query(None, description="Start date (yyyy-mm-dd) — required when hn is not provided"),
    date_end: Optional[str] = Query(None, description="End date (yyyy-mm-dd) — required when hn is not provided"),
    case_type: str = Query("surgical", description="Case type: surgical, gyne, nongyne"),
    his_db: Session = Depends(get_his_db),
):
    """
    Search patients from the HIS database.
    The HIS adapter is selected based on HIS_TYPE in .env
    case_type filters by form: surgical (Pathology), gyne (PAP), nongyne (FNA/Special stain)
    """
    # Check if HIS is configured
    if not is_his_configured() or his_db is None:
        raise HTTPException(
            status_code=503,
            detail="ระบบ HIS ยังไม่ได้ตั้งค่า กรุณาเพิ่ม HIS_DATABASE_URL ใน .env"
        )

    try:
        adapter = get_his_adapter()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not hn and not (date_start and date_end):
        raise HTTPException(status_code=400, detail="ต้องระบุ HN หรือช่วงวันที่อย่างใดอย่างหนึ่ง")

    try:
        return adapter.search_patients(his_db, hn, date_start, date_end, case_type)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ไม่สามารถเชื่อมต่อกับระบบ {adapter.his_name} ได้: {str(e)}"
        )


@router.get("/appointments")
def get_appointments(
    hn: str = Query(..., description="Patient HN"),
    his_db: Session = Depends(get_his_db),
):
    """Fetch upcoming appointments for a patient from oapp table."""
    if not is_his_configured() or his_db is None:
        raise HTTPException(status_code=503, detail="HIS not configured")

    try:
        return hosxp_get_appointments(his_db, hn)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HIS query failed: {str(e)}")


@router.get("/visits-today")
def get_visits_today(his_db: Session = Depends(get_his_db)):
    """All HNs with an actual visit recorded today (vn_stat), for the
    "pending outlab + patient is here today" checks — replaces per-HN
    appointment lookups with one batched query."""
    if not is_his_configured() or his_db is None:
        raise HTTPException(status_code=503, detail="HIS not configured")

    try:
        return {"hns": hosxp_get_hns_with_visit_today(his_db)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HIS query failed: {str(e)}")


@router.get("/info")
def get_his_info():
    """Returns info about the current HIS configuration."""
    configured = is_his_configured()
    try:
        adapter = get_his_adapter()
        his_name = adapter.his_name
    except ValueError:
        his_name = "Unknown"

    return {
        "configured": configured,
        "his_type": his_name,
    }
