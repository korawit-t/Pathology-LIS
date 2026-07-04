from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.gyne_diagnosis import GyneDiagnosis, GyneSpecimenAdequacy, GyneDiagnosisCategory
from app.models.gyne_cyto_case import GyneCytologyCase
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate, GyneDiagnosisUpdate
from app.utils.consult_lock import assert_consult_not_locked
from typing import Optional, List


# --- Master Data CRUD ---

def get_specimen_adequacies(db: Session, group_type: Optional[str] = None):
    query = db.query(GyneSpecimenAdequacy)
    if group_type:
        query = query.filter(GyneSpecimenAdequacy.group_type == group_type)
    return query.all()


def get_diagnosis_categories(db: Session, parent_id: Optional[int] = None, main_only: bool = False):
    query = db.query(GyneDiagnosisCategory)
    
    if main_only:
        query = query.filter(GyneDiagnosisCategory.parent_id == None)
    elif parent_id is not None:
        query = query.filter(GyneDiagnosisCategory.parent_id == parent_id)
        
    return query.all()


# --- Diagnosis CRUD ---

def get_diagnosis_by_id(db: Session, diag_id: int):
    return db.query(GyneDiagnosis).filter(GyneDiagnosis.id == diag_id).first()


def create_initial_diagnosis(db: Session, diag_in: GyneDiagnosisCreate):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == diag_in.case_id).first()
    assert_consult_not_locked(case)

    db_diag = GyneDiagnosis(**diag_in.model_dump(mode='json'))
    db.add(db_diag)
    db.commit()
    db.refresh(db_diag)
    
    # Update Case Status if needed (e.g. to 'reported' or 'screened')
    # db.query(GyneCytologyCase).filter(GyneCytologyCase.id == diag_in.case_id).update({"status": "reported"})
    # db.commit()
    
    return db_diag


def revise_diagnosis(db: Session, diag_id: int, diag_in: GyneDiagnosisUpdate):
    try:
        # 1. ค้นหา Record เดิมที่ยังใช้งานอยู่
        old_diag = (
            db.query(GyneDiagnosis)
            .filter(GyneDiagnosis.id == diag_id, GyneDiagnosis.is_current == True)
            .with_for_update()
            .first()
        )  # ใช้ with_for_update เพื่อ Lock row กันคนอื่นแก้พร้อมกัน

        if not old_diag:
            raise HTTPException(status_code=404, detail="Current diagnosis not found")

        case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == old_diag.case_id).first()
        assert_consult_not_locked(case)

        # 2. ปิดสถานะของเดิม
        old_diag.is_current = False

        # 3. เตรียมข้อมูลสำหรับเวอร์ชันใหม่
        # ดึงข้อมูลเดิมมาเป็นฐาน (Base)
        update_data = diag_in.model_dump(exclude_unset=True, mode='json')

        # สร้าง Object ใหม่โดยคัดลอกค่าจาก old_diag
        # เราต้อง map field ใหม่ๆ ด้วย
        new_diag = GyneDiagnosis(
            case_id=old_diag.case_id,
            # Old fields
            adequacy=update_data.get("adequacy", old_diag.adequacy),
            category=update_data.get("category", old_diag.category),
            interpretation=update_data.get("interpretation", old_diag.interpretation),
            note=update_data.get("note", old_diag.note),
            
            # New fields
            adequacy_id=update_data.get("adequacy_id", old_diag.adequacy_id),
            endocervical_status_id=update_data.get("endocervical_status_id", old_diag.endocervical_status_id),
            quality_id=update_data.get("quality_id", old_diag.quality_id),
            category_1_id=update_data.get("category_1_id", old_diag.category_1_id),
            category_2_id=update_data.get("category_2_id", old_diag.category_2_id),
            
            signers=update_data.get("signers", old_diag.signers),
            
            revised_reason=update_data.get("revised_reason"),
            version=old_diag.version + 1,
            is_current=True,
        )

        db.add(new_diag)

        # 4. อัปเดตสถานะเคส
        db.query(GyneCytologyCase).filter(
            GyneCytologyCase.id == old_diag.case_id
        ).update({"status": "revised"})

        db.commit()
        db.refresh(new_diag)
        return new_diag

    except Exception as e:
        db.rollback()  # ถ้ามีอะไรพลาด ให้คืนค่าทั้งหมด ป้องกัน Data Inconsistency
        raise e


def update_diagnosis(db: Session, diag_id: int, diag_in: GyneDiagnosisUpdate):
    db_diag = db.query(GyneDiagnosis).filter(GyneDiagnosis.id == diag_id).first()
    if not db_diag:
        return None

    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == db_diag.case_id).first()
    assert_consult_not_locked(case)

    update_data = diag_in.model_dump(exclude_unset=True, mode='json')
    for key, value in update_data.items():
        setattr(db_diag, key, value)
        
    db.commit()
    db.refresh(db_diag)
    return db_diag


def get_current_diagnosis(db: Session, case_id: int):
    return (
        db.query(GyneDiagnosis)
        .filter(GyneDiagnosis.case_id == case_id, GyneDiagnosis.is_current == True)
        .first()
    )


def get_diagnosis_history(db: Session, case_id: int):
    return (
        db.query(GyneDiagnosis)
        .filter(GyneDiagnosis.case_id == case_id)
        .order_by(GyneDiagnosis.version.desc())
        .all()
    )
