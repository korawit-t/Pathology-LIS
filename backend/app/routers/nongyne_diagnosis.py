from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi.responses import StreamingResponse
import io

from app.db.database import get_db
from app.crud import nongyne_diagnosis as crud
from app.schemas import nongyne_diagnosis as schemas
from app.dependencies.auth import get_current_user
from app.crud.system_setting import get_settings as get_system_settings
from app.core.roles import CAN_WRITE_NONGYNE_CYTO_REPORT, CAN_MANAGE_SETTINGS

router = APIRouter(
    prefix="/nongyne-diagnosis",
    tags=["Non-Gyne Cytology Diagnosis"],
    dependencies=[Depends(get_current_user)],
)

@router.get("/case/{case_id}", response_model=List[schemas.NongyneDiagnosisResponse])
def read_diagnoses_by_case(
    case_id: int, db: Session = Depends(get_db)
):
    """
    ดึงรายการ Diagnosis ทั้งหมดที่ผูกกับ Case ID นี้
    """
    return crud.get_diagnoses_by_case(db, case_id=case_id)

@router.post(
    "",
    response_model=schemas.NongyneDiagnosisResponse,
    dependencies=[Depends(CAN_WRITE_NONGYNE_CYTO_REPORT)],
)
def create_nongyne_diagnosis(
    payload: schemas.NongyneDiagnosisCreate,
    db: Session = Depends(get_db)
):
    """
    สร้าง Diagnosis ใหม่ (Original) สำหรับ Case
    """
    return crud.create_nongyne_diagnosis(db, obj_in=payload)

@router.put(
    "/{diag_id}",
    response_model=schemas.NongyneDiagnosisResponse,
    dependencies=[Depends(CAN_WRITE_NONGYNE_CYTO_REPORT)],
)
def update_nongyne_diagnosis(
    diag_id: int,
    payload: schemas.NongyneDiagnosisUpdate,
    db: Session = Depends(get_db)
):
    """
    อัปเดต Diagnosis เดิม (เช่น Save Draft หรือ Mark Signed)
    """
    db_obj = crud.get_nongyne_diagnosis_by_id(db, diag_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Diagnosis not found")

    return crud.update_nongyne_diagnosis(db, db_obj=db_obj, obj_in=payload)

@router.post(
    "/{diag_id}/revise",
    response_model=schemas.NongyneDiagnosisResponse,
    dependencies=[Depends(CAN_WRITE_NONGYNE_CYTO_REPORT)],
)
def revise_nongyne_diagnosis(
    diag_id: int,
    payload: schemas.NongyneDiagnosisRevise,
    db: Session = Depends(get_db)
):
    """
    สร้าง Version ใหม่ (Addendum/Revised) โดยอ้างอิงของเดิม
    """
    new_diag = crud.revise_nongyne_diagnosis(db, old_diag_id=diag_id, obj_in=payload)
    if not new_diag:
        raise HTTPException(status_code=404, detail="Original Diagnosis not found")
    return new_diag

@router.delete(
    "/{diag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def delete_nongyne_diagnosis(
    diag_id: int, db: Session = Depends(get_db)
):
    """
    ลบ Diagnosis (เฉพาะกรณีที่จำเป็น/แอดมินลบ)
    """
    success = crud.delete_nongyne_diagnosis(db, diag_id=diag_id)
    if not success:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return None

@router.get("/case/{case_id}/preview-pdf")
def preview_report_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    is_pending: bool = False,
    pending_reason: Optional[str] = None,
):
    from app.crud.nongyne_cyto_report import prepare_nongyne_report_pdf_data
    report_data = prepare_nongyne_report_pdf_data(db, case_id)
    if not report_data:
        raise HTTPException(status_code=404, detail="Case not found")

    if not report_data.get("is_draft"):
        report_data["is_pending"] = is_pending
        report_data["pending_reason"] = pending_reason if is_pending else None

    from app.services.pdf_service import generate_pdf_blob

    pdf_blob = generate_pdf_blob(
        report_data,
        template_name=f"reports/{get_system_settings(db).nongyne_report_template or 'nongyne_cyto_report_template.html'}",
        is_preview=True
    )

    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=nongyne_preview.pdf"},
    )

@router.get("/{diag_id}/pdf")
def get_historical_report_pdf(diag_id: int, db: Session = Depends(get_db)):
    """
    Generate PDF for an existing finalized/signed diagnosis.
    """
    diag = crud.get_nongyne_diagnosis_by_id(db, diag_id)
    if not diag:
        raise HTTPException(status_code=404, detail="Diagnosis not found")

    report_data = crud.prepare_nongyne_report_data(db, diag.case_id)
    if not report_data:
        raise HTTPException(status_code=404, detail="Case not found")
        
    # Override dynamic values with the preserved values from this specific diagnosis
    report_data["diagnosis_summary"] = diag.diagnosis
    report_data["microscopic_summary"] = diag.microscopic_description
    report_data["comment_summary"] = diag.comment
    report_data["reported_at"] = diag.diagnosis_at
    is_preview_mode = diag.status != "signed"

    from app.services.pdf_service import generate_pdf_blob

    pdf_blob = generate_pdf_blob(
        report_data, 
        template_name=f"reports/{get_system_settings(db).nongyne_report_template or 'nongyne_cyto_report_template.html'}", 
        is_preview=is_preview_mode
    )

    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=nongyne_report_{diag_id}.pdf"},
    )

