from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from typing import List
from datetime import datetime
from app.db.database import get_db
from app.schemas.surgical_specimen import (
    SurgicalSpecimenResponse,
    SurgicalSpecimenUpdate,
    SurgicalSpecimenCreate,
    AdditionalSectionsRequest,
)
from app.crud import surgical_specimen as crud_specimen
from app.dependencies.auth import get_current_user, RoleChecker
from app.models.user import User
from app.models.surgical_specimen import SurgicalSpecimen

# กำหนดสิทธิ์
CAN_GROSS = RoleChecker(["pathologist", "gross", "admin", "lab_manager"])

router = APIRouter(prefix="/surgical-specimens", tags=["Surgical Specimens"])


@router.get(
    "/additional-sections",
    response_model=List[SurgicalSpecimenResponse],
    dependencies=[Depends(CAN_GROSS)],
)
def list_additional_sections(db: Session = Depends(get_db)):
    """Return all specimens flagged as needing additional sections."""
    return (
        db.query(SurgicalSpecimen)
        .options(joinedload(SurgicalSpecimen.case))
        .filter(SurgicalSpecimen.needs_additional_sections == True)  # noqa: E712
        .order_by(SurgicalSpecimen.additional_sections_ordered_at.asc())
        .all()
    )


@router.get(
    "/{specimen_id}",
    response_model=SurgicalSpecimenResponse,
    dependencies=[Depends(CAN_GROSS)]
)
def read_specimen(specimen_id: int, db: Session = Depends(get_db)):
    db_spec = crud_specimen.get_specimen(db, specimen_id=specimen_id)
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")
    return db_spec

@router.patch(
    "/{specimen_id}/gross", 
    response_model=SurgicalSpecimenResponse,
    dependencies=[Depends(CAN_GROSS)]
)
def update_specimen(
    specimen_id: int, 
    specimen_in: SurgicalSpecimenUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) # 🚩 ดึง user
):
    db_spec = crud_specimen.update_specimen_gross(
        db, 
        specimen_id=specimen_id, 
        obj_in=specimen_in,
        current_user_id=current_user.id # 🚩 ส่ง ID เข้าไปแก้ TypeError
    )
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")
    return db_spec


@router.patch(
    "/{specimen_id}/gross/draft",
    response_model=SurgicalSpecimenResponse,
    dependencies=[Depends(CAN_GROSS)]
)
def update_specimen_gross_draft_api(
    specimen_id: int,
    specimen_in: SurgicalSpecimenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save gross description as draft without changing case status."""
    db_spec = crud_specimen.update_specimen_gross_draft(
        db,
        specimen_id=specimen_id,
        obj_in=specimen_in,
        current_user_id=current_user.id
    )
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")
    return db_spec

@router.delete(
    "/{specimen_id}", 
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_specimen_api(
    specimen_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) # 🚩 เพิ่มเพื่อใช้ใน Re-label
):
    # ตรวจสอบสิทธิ์แบบละเอียดในฟังก์ชัน
    RoleChecker(["admin", "lab_manager", "pathologist", "gross"])(current_user)

    db_spec = crud_specimen.get_specimen(db, specimen_id)
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")
    
    if db_spec.case.is_reported:
        raise HTTPException(
            status_code=400, 
            detail="ไม่สามารถลบชิ้นเนื้อจากเคสที่รายงานผลแล้วได้"
        )
        
    # 🚩 ส่ง current_user_id เข้าไปเพื่อให้ Re-label บันทึกคนแก้ไขล่าสุด
    crud_specimen.delete_specimen(
        db=db, 
        specimen_id=specimen_id, 
        current_user_id=current_user.id
    )
    
    return None

@router.post("", response_model=SurgicalSpecimenResponse, dependencies=[Depends(CAN_GROSS)])
def create_new_specimen(
    *,
    db: Session = Depends(get_db),
    specimen_in: SurgicalSpecimenCreate,
    current_user: User = Depends(get_current_user)
):
    # 🚩 ส่ง current_user_id เข้าไปบันทึกตอนสร้าง
    return crud_specimen.create_specimen(
        db=db, 
        obj_in=specimen_in, 
        current_user_id=current_user.id
    )

@router.patch(
    "/{specimen_id}",
    response_model=SurgicalSpecimenResponse,
    dependencies=[Depends(CAN_GROSS)]
)
def update_specimen_api(
    specimen_id: int,
    specimen_in: SurgicalSpecimenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_spec = crud_specimen.update_specimen(
        db,
        specimen_id=specimen_id,
        obj_in=specimen_in,
        current_user_id=current_user.id
    )
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")
    return db_spec


@router.patch(
    "/{specimen_id}/additional-sections",
    response_model=SurgicalSpecimenResponse,
    dependencies=[Depends(CAN_GROSS)],
)
def set_additional_sections(
    specimen_id: int,
    body: AdditionalSectionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pathologist flags or clears additional-sections request on a specimen."""
    db_spec = crud_specimen.get_specimen(db, specimen_id)
    if not db_spec:
        raise HTTPException(status_code=404, detail="Specimen not found")

    if body.needs:
        db_spec.needs_additional_sections = True
        db_spec.additional_sections_note = body.note
        db_spec.additional_sections_ordered_by_id = current_user.id
        db_spec.additional_sections_ordered_at = datetime.utcnow()
    else:
        db_spec.needs_additional_sections = False
        db_spec.additional_sections_note = None
        db_spec.additional_sections_ordered_by_id = None
        db_spec.additional_sections_ordered_at = None

    db.commit()
    db.refresh(db_spec)
    return db_spec