from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.schemas.gyne_diagnosis import (
    GyneDiagnosisCreate,
    GyneDiagnosisUpdate,
    GyneDiagnosisResponse,
    GyneSpecimenAdequacyBase,
    GyneDiagnosisCategoryBase,
)
from app.crud import gyne_diagnosis as crud
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/gyne-diagnosis",
    tags=["Gyne Diagnosis"],
    dependencies=[Depends(get_current_user)],
)


# --- Master Data Endpoints ---

@router.get("/master/adequacy", response_model=List[GyneSpecimenAdequacyBase])
def get_specimen_adequacies(
    group_type: Optional[str] = Query(None, description="Filter by group: ADEQUACY, ZONE, QUALITY"),
    db: Session = Depends(get_db)
):
    return crud.get_specimen_adequacies(db, group_type=group_type)


@router.get("/master/category", response_model=List[GyneDiagnosisCategoryBase])
def get_diagnosis_categories(
    parent_id: Optional[int] = Query(None, description="Filter by parent ID"),
    main_only: bool = Query(False, description="Get only main categories (parent_id=None)"),
    db: Session = Depends(get_db)
):
    return crud.get_diagnosis_categories(db, parent_id=parent_id, main_only=main_only)


# --- Diagnosis Endpoints ---

@router.post("", response_model=GyneDiagnosisResponse)
def create_diagnosis(diag_in: GyneDiagnosisCreate, db: Session = Depends(get_db)):
    return crud.create_initial_diagnosis(db=db, diag_in=diag_in)


@router.put("/{diag_id}", response_model=GyneDiagnosisResponse)
def update_existing_diagnosis(
    diag_id: int, diag_in: GyneDiagnosisUpdate, db: Session = Depends(get_db)
):
    db_diag = crud.update_diagnosis(db=db, diag_id=diag_id, diag_in=diag_in)
    if not db_diag:
        raise HTTPException(status_code=404, detail="Diagnosis record not found")
    return db_diag


@router.get("/case/{case_id}", response_model=GyneDiagnosisResponse | None)
def read_current_diagnosis(case_id: int, db: Session = Depends(get_db)):
    db_diag = crud.get_current_diagnosis(db, case_id=case_id)
    return db_diag  # ถ้าไม่เจอ จะส่ง null กลับไปพร้อมสถานะ 200 OK


@router.get("/case/{case_id}/history", response_model=List[GyneDiagnosisResponse])
def read_diagnosis_history(case_id: int, db: Session = Depends(get_db)):
    return crud.get_diagnosis_history(db, case_id=case_id)


@router.put("/{diag_id}/revise", response_model=GyneDiagnosisResponse)
def revise_existing_diagnosis(
    diag_id: int, diag_in: GyneDiagnosisUpdate, db: Session = Depends(get_db)
):
    if not diag_in.revised_reason:
        raise HTTPException(
            status_code=400,
            detail="Revised reason is required for formal revisions."
        )
    # 1. เช็คเบื้องต้นว่า Record นี้มีอยู่จริงและเป็นเวอร์ชันปัจจุบันไหม
    # เพื่อป้องกันการซ้อนทับของข้อมูล (Race Condition)
    current_diag = crud.get_diagnosis_by_id(db, diag_id)  # ควรมี function นี้ใน CRUD

    if not current_diag:
        raise HTTPException(status_code=404, detail="Diagnosis record not found")

    if not current_diag.is_current:
        raise HTTPException(
            status_code=400,
            detail="Cannot revise an outdated record. Please use the latest version.",
        )

    # 2. ทำการ Revise ผ่าน CRUD
    db_diag = crud.revise_diagnosis(db=db, diag_id=diag_id, diag_in=diag_in)
    return db_diag
