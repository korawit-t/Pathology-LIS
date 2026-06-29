from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional

from app.db.database import get_db
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.crud import patient as crud
from app.models.surgical_case import SurgicalCase
from app.schemas.surgical_case import SurgicalCaseResponse
from app.dependencies.auth import get_current_user, RoleChecker
from app.core.roles import CAN_ACCESS_PATIENT

router = APIRouter(
    prefix="/patients",
    tags=["Patients"],
    # ✅ ทุกคนที่มีสิทธิ์ในกลุ่ม CAN_ACCESS_PATIENT เข้าถึงหน้าจัดการคนไข้ได้
    dependencies=[Depends(CAN_ACCESS_PATIENT)],
)


@router.get("", response_model=List[PatientResponse])
def read_all_patients(
    q: Optional[str] = None,  # 🌟 1. รับค่าค้นหาจาก Query String
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return crud.get_patients(db, q=q, skip=skip, limit=limit)


@router.get("/{patient_id}", response_model=PatientResponse)
def read_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = crud.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("", response_model=PatientResponse)
def create_new_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    if patient.cid:
        existing = crud.get_patient_by_cid(db, patient.cid)
        if existing:
            raise HTTPException(status_code=400, detail="เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว")
    return crud.create_patient(db, patient)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_existing_patient(
    patient_id: int, patient: PatientUpdate, db: Session = Depends(get_db)
):
    updated = crud.update_patient(db, patient_id, patient)
    if not updated:
        raise HTTPException(status_code=404, detail="Patient not found")
    return updated


# --- Delete ---
@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    # 🌟 ล็อคพิเศษ: เฉพาะ Lab Manager หรือ Admin เท่านั้นที่ลบประวัติคนไข้ได้
    _=Depends(RoleChecker(["admin", "lab_manager"])),
):
    success = crud.delete_patient(db, patient_id)
    if not success:
        raise HTTPException(status_code=404, detail="Patient not found")
    return None


@router.get("/{patient_id}/history", response_model=List[SurgicalCaseResponse])
def read_patient_case_history(patient_id: int, db: Session = Depends(get_db)):
    """
    ดึงประวัติ Surgical Cases ทั้งหมดของคนไข้รายนี้
    """
    # ตรวจสอบก่อนว่ามีคนไข้จริงไหม
    patient = crud.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    history = (
        db.query(SurgicalCase)
        .filter(SurgicalCase.patient_id == patient_id)
        .order_by(SurgicalCase.created_at.desc())
        .all()
    )

    return history


@router.get("/{patient_id}/gyne-cyto-history")
def read_patient_gyne_cyto_history(patient_id: int, db: Session = Depends(get_db)):
    from app.models.gyne_cyto_case import GyneCytologyCase
    from app.models.gyne_diagnosis import GyneDiagnosis
    from app.models.gyne_cyto_report import GyneCytoReport
    from sqlalchemy import func, and_

    patient = crud.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    cases = (
        db.query(GyneCytologyCase)
        .filter(GyneCytologyCase.patient_id == patient_id)
        .order_by(GyneCytologyCase.id.desc())
        .all()
    )

    if not cases:
        return []

    case_ids = [c.id for c in cases]

    # Get current diagnosis per case (with categories eagerly loaded)
    diagnoses = (
        db.query(GyneDiagnosis)
        .options(
            selectinload(GyneDiagnosis.category_1_obj),
            selectinload(GyneDiagnosis.category_2_obj),
        )
        .filter(GyneDiagnosis.case_id.in_(case_ids), GyneDiagnosis.is_current.is_(True))
        .all()
    )
    diag_map = {d.case_id: d for d in diagnoses}

    # Get latest published report per case
    subq = (
        db.query(GyneCytoReport.case_id, func.max(GyneCytoReport.id).label("max_id"))
        .filter(GyneCytoReport.case_id.in_(case_ids), GyneCytoReport.status == "published")
        .group_by(GyneCytoReport.case_id)
        .subquery()
    )
    reports = (
        db.query(GyneCytoReport.case_id, GyneCytoReport.id)
        .join(subq, and_(GyneCytoReport.case_id == subq.c.case_id, GyneCytoReport.id == subq.c.max_id))
        .all()
    )
    report_map = {r.case_id: r.id for r in reports}

    from app.models.nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation
    corr_rows = (
        db.query(NongyneCytoHistoCorrelation.gyne_case_id, NongyneCytoHistoCorrelation.id)
        .filter(NongyneCytoHistoCorrelation.gyne_case_id.in_(case_ids))
        .all()
    )
    corr_map = {row.gyne_case_id: row.id for row in corr_rows}

    result = []
    for c in cases:
        diag = diag_map.get(c.id)
        cat1 = diag.category_1_obj if diag else None
        cat2 = diag.category_2_obj if diag else None
        result.append({
            "id": c.id,
            "accession_no": c.accession_no,
            "registered_at": c.registered_at.isoformat() if c.registered_at else None,
            "status": c.status,
            "specimen_type": c.specimen_type,
            "category_1": {"code": cat1.code, "text": cat1.text} if cat1 else None,
            "category_2": {"code": cat2.code, "text": cat2.text} if cat2 else None,
            "latest_report_id": report_map.get(c.id),
            "has_correlation": c.id in corr_map,
            "correlation_id": corr_map.get(c.id),
        })

    return result


@router.get("/{patient_id}/nongyne-cyto-history")
def read_patient_nongyne_cyto_history(patient_id: int, db: Session = Depends(get_db)):
    from app.models.nongyne_cyto_case import NongyneCytologyCase
    from app.models.nongyne_diagnosis import NongyneDiagnosis
    from app.models.nongyne_cyto_report import NongyneCytoReport
    from sqlalchemy import func, and_

    patient = crud.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    cases = (
        db.query(NongyneCytologyCase)
        .filter(NongyneCytologyCase.patient_id == patient_id)
        .order_by(NongyneCytologyCase.id.desc())
        .all()
    )

    if not cases:
        return []

    case_ids = [c.id for c in cases]

    diagnoses = (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id.in_(case_ids), NongyneDiagnosis.is_current.is_(True))
        .all()
    )
    diag_map = {d.case_id: d for d in diagnoses}

    subq = (
        db.query(NongyneCytoReport.case_id, func.max(NongyneCytoReport.id).label("max_id"))
        .filter(NongyneCytoReport.case_id.in_(case_ids), NongyneCytoReport.status == "published")
        .group_by(NongyneCytoReport.case_id)
        .subquery()
    )
    reports = (
        db.query(NongyneCytoReport.case_id, NongyneCytoReport.id)
        .join(subq, and_(NongyneCytoReport.case_id == subq.c.case_id, NongyneCytoReport.id == subq.c.max_id))
        .all()
    )
    report_map = {r.case_id: r.id for r in reports}

    from app.models.nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation
    corr_rows = (
        db.query(NongyneCytoHistoCorrelation.nongyne_case_id, NongyneCytoHistoCorrelation.id)
        .filter(NongyneCytoHistoCorrelation.nongyne_case_id.in_(case_ids))
        .all()
    )
    corr_map = {row.nongyne_case_id: row.id for row in corr_rows}

    result = []
    for c in cases:
        diag = diag_map.get(c.id)
        result.append({
            "id": c.id,
            "accession_no": c.accession_no,
            "registered_at": c.registered_at.isoformat() if c.registered_at else None,
            "status": c.status,
            "specimen_type": c.specimen_type,
            "diagnosis_text": diag.diagnosis_text if diag and hasattr(diag, "diagnosis_text") else None,
            "latest_report_id": report_map.get(c.id),
            "has_correlation": c.id in corr_map,
            "correlation_id": corr_map.get(c.id),
        })

    return result
