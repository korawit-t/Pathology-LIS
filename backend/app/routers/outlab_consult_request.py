from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.roles import CAN_APPROVE_OUTLAB_RESULT, CAN_REQUEST_CONSULT, CAN_UPLOAD_OUTLAB_RESULT
from app.crud import outlab_consult_request as crud
from app.db.database import get_db
from app.dependencies.auth import assert_hospital_scoped_access, get_current_user
from app.models.user import User
from app.schemas.outlab_consult_request import (
    CaseType,
    OutlabConsultRequestCancel,
    OutlabConsultRequestCreate,
    OutlabConsultRequestResponse,
    OutlabConsultRequestUpdate,
    to_response,
)
from app.utils.storage_paths import resolve_stored_file

# Mounted internal-only in main.py: referring-side accounts never see these.
router = APIRouter(prefix="/outlab-consults", tags=["Outlab Consults"])


def _scoped_consult(db: Session, consult_id: int, user: User):
    consult = crud.get_consult(db, consult_id)
    case = crud.get_case(db, consult.case_type, consult.case_id)
    assert_hospital_scoped_access(user, case.hospital_id)
    return consult


@router.get("", response_model=List[OutlabConsultRequestResponse])
def list_consults(
    case_type: CaseType,
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every consult round of one case, oldest first."""
    case = crud.get_case(db, case_type, case_id)
    assert_hospital_scoped_access(current_user, case.hospital_id)
    return [to_response(c) for c in crud.list_for_case(db, case_type, case_id)]


@router.post("", response_model=OutlabConsultRequestResponse, status_code=201)
def request_consult(
    payload: OutlabConsultRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_REQUEST_CONSULT),
):
    case = crud.get_case(db, payload.case_type, payload.case_id)
    assert_hospital_scoped_access(current_user, case.hospital_id)
    consult = crud.request_consult(
        db,
        payload.case_type,
        payload.case_id,
        reason=payload.reason,
        destination_lab=payload.destination_lab,
        user_id=current_user.id,
    )
    return to_response(consult)


@router.post("/{consult_id}/cancel", response_model=OutlabConsultRequestResponse)
def cancel_consult(
    consult_id: int,
    payload: Optional[OutlabConsultRequestCancel] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_REQUEST_CONSULT),
):
    consult = _scoped_consult(db, consult_id, current_user)
    consult = crud.cancel_consult(
        db, consult, user_id=current_user.id, reason=payload.reason if payload else None
    )
    return to_response(consult)


@router.patch("/{consult_id}", response_model=OutlabConsultRequestResponse)
def update_consult(
    consult_id: int,
    payload: OutlabConsultRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE_OUTLAB_RESULT),
):
    consult = _scoped_consult(db, consult_id, current_user)
    consult = crud.update_consult_details(db, consult, payload.model_dump(exclude_unset=True))
    return to_response(consult)


@router.post("/{consult_id}/result-pdf", response_model=OutlabConsultRequestResponse)
async def upload_result_pdf(
    consult_id: int,
    file: UploadFile = File(...),
    received_at: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_UPLOAD_OUTLAB_RESULT),
):
    consult = _scoped_consult(db, consult_id, current_user)
    consult = crud.upload_result_pdf(db, consult, file, received_at, current_user.id)
    return to_response(consult)


@router.delete("/{consult_id}/result-pdf", response_model=OutlabConsultRequestResponse)
def delete_result_pdf(
    consult_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_UPLOAD_OUTLAB_RESULT),
):
    consult = _scoped_consult(db, consult_id, current_user)
    consult = crud.delete_result_pdf(db, consult)
    return to_response(consult)


@router.get("/{consult_id}/result-pdf")
def download_result_pdf(
    consult_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    consult = _scoped_consult(db, consult_id, current_user)
    pdf = resolve_stored_file(consult.result_pdf_path)
    if not pdf:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=pdf, filename=pdf.name, media_type="application/pdf")


# The approver's name is printed on the cover as its signature.
@router.post("/{consult_id}/approve", response_model=OutlabConsultRequestResponse)
def approve_consult(
    consult_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE_OUTLAB_RESULT),
):
    consult = _scoped_consult(db, consult_id, current_user)
    consult = crud.approve_consult(db, consult, current_user.id)
    return to_response(consult)
