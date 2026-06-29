from app.schemas.surgical_bulk import BulkSaveDraft
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from fastapi.responses import StreamingResponse
from app.db.database import get_db

# อัปเดตการ Import Schema ให้ตรงกับชื่อใหม่
from app.schemas.surgical_diagnosis import (
    SurgicalDiagnosisCreate,
    SurgicalDiagnosisUpdate,
    SurgicalDiagnosisResponse,
)
from app.crud import surgical_diagnosis as crud
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.dependencies.auth import get_current_user, RoleChecker
from app.core.roles import CAN_WRITE_REPORT, CAN_READ_REPORT
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.core.roles import CAN_MANAGE_SETTINGS

router = APIRouter(prefix="/surgical-diagnoses", tags=["Surgical Diagnoses"])


@router.post(
    "",
    response_model=SurgicalDiagnosisResponse,
    dependencies=[Depends(CAN_WRITE_REPORT)],
)
def create_diagnosis_entry(
    diag_in: SurgicalDiagnosisCreate, db: Session = Depends(get_db)
):
    # ไม่ต้องดัก Error 400 ตรงนี้แล้ว
    # ปล่อยให้ crud.create_diagnosis จัดการตามลำดับ (Order)
    return crud.create_diagnosis(db, diag_in)


# --- 3. ดึงประวัติการวินิจฉัยทั้งหมดของชิ้นเนื้อ (Cumulative View) ---
@router.get(
    "/specimen/{specimen_id}",
    response_model=List[SurgicalDiagnosisResponse],
    dependencies=[Depends(CAN_READ_REPORT)],
)
def get_cumulative_diagnoses(specimen_id: int, db: Session = Depends(get_db)):
    return crud.list_diagnoses_by_specimen(db, specimen_id)


@router.get(
    "/case/{case_id}",
    response_model=List[SurgicalDiagnosisResponse],
    dependencies=[Depends(CAN_READ_REPORT)],
)
def get_case_diagnoses(case_id: int, db: Session = Depends(get_db)):
    """
    ดึงข้อมูลการวินิจฉัยทั้งหมดที่เกี่ยวข้องกับเคสนี้
    (ใช้สำหรับหน้า Report Preview หรือ Dashboard สรุปผลของเคส)
    """
    diagnoses = crud.list_diagnoses_by_case(db, case_id)
    return diagnoses


# --- 4. แก้ไขการวินิจฉัย (เฉพาะตอนเป็น Draft) ---
@router.patch(
    "/{diagnosis_id}",
    response_model=SurgicalDiagnosisResponse,
    dependencies=[Depends(CAN_WRITE_REPORT)],
)
def update_diagnosis(
    diagnosis_id: int,
    diag_update: SurgicalDiagnosisUpdate,
    db: Session = Depends(get_db),
):
    db_diag = crud.get_diagnosis(db, diagnosis_id)
    if not db_diag:
        raise HTTPException(status_code=404, detail="Diagnosis record not found")

    if db_diag.status == "signed":
        raise HTTPException(
            status_code=403,
            detail="Cannot edit signed diagnosis. Use 'Next Entry' for Addendum/Revision.",
        )

    return crud.update_diagnosis(db, diagnosis_id, diag_update)


# --- 5. ลบการวินิจฉัย (เฉพาะ Draft ล่าสุดเท่านั้น) ---
@router.delete("/{diagnosis_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_draft_diagnosis(diagnosis_id: int, db: Session = Depends(get_db)):
    db_diag = crud.get_diagnosis(db, diagnosis_id)
    if not db_diag:
        raise HTTPException(status_code=404, detail="Diagnosis record not found")

    if db_diag.status == "signed":
        raise HTTPException(
            status_code=400,
            detail="Signed diagnosis cannot be deleted for audit integrity.",
        )

    crud.delete_diagnosis(db, diagnosis_id)
    return {"detail": "Draft diagnosis deleted"}


@router.delete("/case/{case_id}/case-level-draft")
def delete_case_level_draft(case_id: int, db: Session = Depends(get_db)):
    # 🚩 เปลี่ยนจาก models.SurgicalDiagnosis เป็น SurgicalDiagnosis เฉยๆ ตามที่ Import มา
    draft = (
        db.query(SurgicalDiagnosis)
        .filter(
            SurgicalDiagnosis.case_id == case_id,
            SurgicalDiagnosis.diagnosis_level == "CASE",
            SurgicalDiagnosis.status == "draft",
        )
        .first()
    )

    if draft:
        db.delete(draft)
        db.commit()
        return {"message": "Case-level draft deleted successfully"}

    return {"message": "No case-level draft found"}


# --- 6. ดึงประวัติการวินิจฉัยทั้งหมดของคนไข้ (Historical View) ---
@router.get(
    "/patient/{patient_id}",
    response_model=List[SurgicalDiagnosisResponse],
    dependencies=[Depends(CAN_READ_REPORT)],
)
def get_patient_historical_diagnoses(patient_id: int, db: Session = Depends(get_db)):
    diagnoses = crud.get_diagnoses_by_patient(db, patient_id=patient_id)
    return diagnoses


@router.post(
    "/bulk-save-draft", dependencies=[Depends(CAN_WRITE_REPORT)]  # บังคับสิทธิ์เขียน Report
)
def save_bulk_draft(
    *,
    db: Session = Depends(get_db),
    data: BulkSaveDraft,
    current_user=Depends(get_current_user),
):
    """
    บันทึกร่างผลการวินิจฉัยแบบกลุ่ม (Bulk Save Draft)
    ครอบคลุมทั้งข้อมูลเคส, Gross Description และผลการวินิจฉัยรายชิ้น
    """
    try:
        # เรียกใช้ Orchestrator ที่คุณเตรียมไว้
        result = crud.bulk_save_draft_orchestrator(db, data)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Could not save bulk draft: {str(e)}"
        )


@router.post("/{case_id}/finalize")  # เปลี่ยนเป็น POST เพราะมีการสร้าง Snapshot
def finalize_case_endpoint(
    case_id: int,
    data: BulkSaveDraft,  # ใช้ Schema เดียวกับ Save Draft เพื่อรับข้อมูลล่าสุดก่อนปิดเคส
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # ตรวจสอบว่ามีคนเซ็นส่งมาไหม ถ้าไม่มีให้ใช้ current_user
    if not data.signed_by_id:
        data.signed_by_id = current_user.id

    try:
        # 🚩 เรียกใช้ Orchestrator ตัวใหม่ที่เราแก้กัน
        report_snapshot = crud.finalize_and_snapshot_orchestrator(db, case_id, data)

        if not report_snapshot:
            raise HTTPException(
                status_code=400, detail="การเซ็นชื่อยังไม่ครบถ้วน หรือไม่สามารถปิดเคสได้"
            )

        return {
            "message": "Finalized and Snapshot created successfully",
            "report_id": report_snapshot.id,
            "status": report_snapshot.status,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
