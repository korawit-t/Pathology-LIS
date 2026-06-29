from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, time
from collections import defaultdict
from typing import Optional
from html.parser import HTMLParser
import json

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.tumor_registry import TumorRegistry
from app.models.surgical_case import SurgicalCase
from app.models.surgical_diagnosis import SurgicalDiagnosis, DiagnosisLevel
from app.models.surgical_specimen import SurgicalSpecimen
from app.core.roles import CAN_WRITE_REPORT, CAN_READ_REPORT
from app.core.prompts import get_icd_o_prompt
from app.crud import tumor_registry as crud
from app.crud import llm_profile as crud_llm
from app.crud.system_setting import get_settings
from app.schemas.tumor_registry import TumorRegistryUpsert, TumorRegistryResponse
from app.services.llm_service import call_llm

router = APIRouter(prefix="/tumor-registries", tags=["Tumor Registry"])


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str):
        self._parts.append(data)


def _strip_html(html: str) -> str:
    s = _HTMLStripper()
    s.feed(html)
    return " ".join(part.strip() for part in s._parts if part.strip())


def _get_diagnosis_text(db: Session, case_id: int) -> str | None:
    """
    1. Prefer latest CASE-level (integrated) diagnosis.
    2. Fall back to all SPECIMEN-level diagnoses concatenated with labels (A, B, C…).
    Only includes non-cancelled entries with actual diagnosis text.
    """
    base_q = (
        db.query(SurgicalDiagnosis)
        .filter(
            SurgicalDiagnosis.case_id == case_id,
            SurgicalDiagnosis.status != "cancelled",
            SurgicalDiagnosis.diagnosis.isnot(None),
        )
    )

    case_diag = (
        base_q
        .filter(SurgicalDiagnosis.diagnosis_level == DiagnosisLevel.CASE)
        .order_by(SurgicalDiagnosis.diagnosis_order.desc())
        .first()
    )
    if case_diag and case_diag.diagnosis:
        return _strip_html(case_diag.diagnosis)

    specimen_diags = (
        base_q
        .filter(SurgicalDiagnosis.diagnosis_level == DiagnosisLevel.SPECIMEN)
        .join(SurgicalSpecimen, SurgicalDiagnosis.surgical_specimen_id == SurgicalSpecimen.id)
        .order_by(SurgicalSpecimen.specimen_label, SurgicalDiagnosis.diagnosis_order.desc())
        .with_entities(SurgicalSpecimen.specimen_label, SurgicalDiagnosis.diagnosis)
        .all()
    )

    if not specimen_diags:
        return None

    seen_labels: set[str] = set()
    parts: list[str] = []
    for label, diag_html in specimen_diags:
        if label in seen_labels:
            continue
        seen_labels.add(label)
        text = _strip_html(diag_html)
        if text:
            parts.append(f"Specimen {label}: {text}")

    return "\n\n".join(parts) if parts else None


def _require_enabled(db: Session) -> None:
    settings = get_settings(db)
    if not settings or not settings.tumor_registry_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tumor registry is disabled")


@router.get("/summary", dependencies=[Depends(CAN_READ_REPORT)])
def get_summary(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
):
    _require_enabled(db)

    filters = []
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))

    malignant_total = (
        db.query(func.count(SurgicalCase.id))
        .filter(*filters, SurgicalCase.has_malignancy == True, SurgicalCase.is_cancelled == False)
        .scalar() or 0
    )

    tr_filters = []
    if date_from or date_to:
        tr_filters = [
            TumorRegistry.surgical_case_id.in_(
                db.query(SurgicalCase.id).filter(*filters, SurgicalCase.is_cancelled == False)
            )
        ]

    total_registered = db.query(func.count(TumorRegistry.id)).filter(*tr_filters).scalar() or 0
    coverage_pct = round(total_registered / malignant_total * 100, 1) if malignant_total else 0.0

    rows = db.query(TumorRegistry).filter(*tr_filters).all()

    topo_map: dict = defaultdict(lambda: {"code": "", "desc": "", "count": 0})
    grade_map: dict = defaultdict(int)
    pt_map: dict = defaultdict(int)

    for r in rows:
        if r.topography_code:
            k = r.topography_code
            topo_map[k]["code"] = r.topography_code
            topo_map[k]["desc"] = r.topography_desc or ""
            topo_map[k]["count"] += 1
        if r.grade:
            grade_map[r.grade] += 1
        if r.pt:
            pt_map[r.pt] += 1

    by_topography = sorted(topo_map.values(), key=lambda x: x["count"], reverse=True)[:10]
    by_grade = [{"grade": k, "count": v} for k, v in sorted(grade_map.items())]
    by_pt = sorted([{"pt": k, "count": v} for k, v in pt_map.items()], key=lambda x: x["count"], reverse=True)[:10]

    return {
        "total_registered": total_registered,
        "malignant_total": malignant_total,
        "coverage_pct": coverage_pct,
        "by_topography": by_topography,
        "by_grade": by_grade,
        "by_pt": by_pt,
    }


@router.get("/{case_id}/suggest-preview", dependencies=[Depends(CAN_READ_REPORT)])
def get_suggest_preview(case_id: int, db: Session = Depends(get_db)):
    _require_enabled(db)
    settings = get_settings(db)
    if not settings or not settings.tumor_registry_llm_profile_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not configured")

    profile = crud_llm.get_by_id(db, settings.tumor_registry_llm_profile_id)
    if not profile or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not found or inactive")

    system_prompt = get_icd_o_prompt(settings.tumor_registry_system_prompt)
    diagnosis_text = _get_diagnosis_text(db, case_id)

    return {
        "profile_name": profile.display_name,
        "provider": profile.provider,
        "model": profile.model,
        "system_prompt": system_prompt,
        "diagnosis_text": diagnosis_text,
    }


@router.post("/{case_id}/suggest", dependencies=[Depends(CAN_READ_REPORT)])
async def suggest_icd_o(case_id: int, db: Session = Depends(get_db)):
    _require_enabled(db)
    settings = get_settings(db)
    if not settings or not settings.tumor_registry_llm_profile_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not configured")

    profile = crud_llm.get_by_id(db, settings.tumor_registry_llm_profile_id)
    if not profile or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not found or inactive")

    diagnosis_text = _get_diagnosis_text(db, case_id)
    if not diagnosis_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No diagnosis text found for this case")

    system_prompt = get_icd_o_prompt(settings.tumor_registry_system_prompt)
    try:
        raw = await call_llm(profile, system_prompt, diagnosis_text)
        result = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM error: {str(e)}")

    return {
        "topography_code": result.get("topography_code"),
        "topography_desc": result.get("topography_desc"),
        "morphology_code": result.get("morphology_code"),
        "morphology_desc": result.get("morphology_desc"),
    }


@router.get("/{case_id}", response_model=TumorRegistryResponse, dependencies=[Depends(CAN_READ_REPORT)])
def get_tumor_registry(case_id: int, db: Session = Depends(get_db)):
    _require_enabled(db)
    record = crud.get_by_case_id(db, case_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tumor registry not found")
    return record


@router.put("/{case_id}", response_model=TumorRegistryResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def upsert_tumor_registry(
    case_id: int,
    data: TumorRegistryUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled(db)
    return crud.upsert(db, case_id, data, user_id=current_user.id)
