"""
HIS (Hospital Information System) Integration Router
Uses the adapter pattern to support multiple HIS types (HOSxP, custom SQL, ...).
Configure via HIS_TYPE (and optionally HIS_DISPLAY_NAME) in .env
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.his_database import get_his_db, is_his_configured
from app.schemas.his import HisInfo, HisPatientResult
from app.his_adapters import (
    ALL_HIS_FEATURES,
    HisAdapterBase,
    HisFeature,
    get_his_adapter,
    get_his_adapter_or_none,
)
import app.his_adapters as his_adapters
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/his",
    tags=["HIS Integration"],
    dependencies=[Depends(get_current_user)],
)


def _require_adapter(his_db: Optional[Session], feature: str) -> HisAdapterBase:
    """The configured adapter, provided it is connected and has `feature`.

    503 when there is no usable HIS at all; 501 when there is one but it
    doesn't offer this feature (e.g. appointments on a custom-SQL site) —
    the HOSxP query behind it would only fail against another vendor's DB."""
    if not is_his_configured() or his_db is None:
        raise HTTPException(
            status_code=503,
            detail="ระบบ HIS ยังไม่ได้ตั้งค่า กรุณาเพิ่ม HIS_DATABASE_URL ใน .env"
        )

    try:
        adapter = get_his_adapter()
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not adapter.supports(feature):
        raise HTTPException(
            status_code=501,
            detail=f"ระบบ {adapter.display_name} ที่เชื่อมต่ออยู่ไม่รองรับฟังก์ชันนี้ ({feature})",
        )
    return adapter


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
    adapter = _require_adapter(his_db, HisFeature.PATIENT_SEARCH)

    if not hn and not (date_start and date_end):
        raise HTTPException(status_code=400, detail="ต้องระบุ HN หรือช่วงวันที่อย่างใดอย่างหนึ่ง")

    try:
        return adapter.search_patients(his_db, hn, date_start, date_end, case_type)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ไม่สามารถเชื่อมต่อกับระบบ {adapter.display_name} ได้: {str(e)}"
        )


@router.get("/appointments")
def get_appointments(
    hn: str = Query(..., description="Patient HN"),
    his_db: Session = Depends(get_his_db),
):
    """A patient's recent appointments (HOSxP: oapp table)."""
    adapter = _require_adapter(his_db, HisFeature.APPOINTMENTS)

    try:
        return adapter.get_appointments(his_db, hn)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HIS query failed: {str(e)}")


@router.get("/visits-today")
def get_visits_today(his_db: Session = Depends(get_his_db)):
    """All HNs with an actual visit recorded today (HOSxP: vn_stat), for the
    "pending outlab + patient is here today" checks — replaces per-HN
    appointment lookups with one batched query."""
    adapter = _require_adapter(his_db, HisFeature.VISITS_TODAY)

    try:
        return {"hns": adapter.get_hns_with_visit_today(his_db)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HIS query failed: {str(e)}")


@router.get("/info", response_model=HisInfo)
def get_his_info():
    """Which HIS this deployment is connected to and what it can do.

    Answers from configuration alone — it never queries the HIS — so it is
    safe to call on a site that has none. `features` is all-false unless the
    connection is actually usable, so the frontend can gate each control on
    its own feature flag without also checking `configured`."""
    adapter = get_his_adapter_or_none()
    configured = is_his_configured() and adapter is not None

    return HisInfo(
        configured=configured,
        his_type=his_adapters.HIS_TYPE,
        display_name=adapter.display_name if adapter else (his_adapters.HIS_DISPLAY_NAME or "HIS"),
        features={
            f: bool(configured and adapter.supports(f)) for f in ALL_HIS_FEATURES
        },
    )
