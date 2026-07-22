import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.roles import CAN_ACCESS_PATIENT, CAN_WRITE_REPORT, CAN_READ_REPORT
from app.db.database import get_db
from app.dependencies.auth import check_password_status, get_current_user
from app.models.user import User
from app.schemas.molecular_case import (
    MolecularCaseCancel,
    MolecularCaseCreate,
    MolecularCaseFinalize,
    MolecularCaseResponse,
    MolecularCaseUpdate,
)
import app.crud.molecular_case as molecular_crud

router = APIRouter(
    prefix="/molecular-cases",
    tags=["Molecular Cases"],
    dependencies=[Depends(check_password_status)],
)


@router.post("", response_model=MolecularCaseResponse, status_code=201, dependencies=[Depends(CAN_ACCESS_PATIENT)])
def create_standalone_molecular_case(
    payload: MolecularCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a Molecular case directly (no parent Surgical case) — patient,
    hospital, HN/AN/VN, etc. are entered as part of this same request."""
    case = molecular_crud.create_standalone_molecular_case(db, payload, registrar_id=current_user.id)
    return molecular_crud.get_molecular_case(db, case.id)


@router.get("", response_model=List[MolecularCaseResponse], dependencies=[Depends(CAN_READ_REPORT)])
def list_molecular_cases(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    is_outlab: Optional[bool] = None,
    parent_case_id: Optional[int] = None,
    stain_id: Optional[int] = None,
    search: Optional[str] = None,
    clinician: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return molecular_crud.get_molecular_cases(
        db, skip=skip, limit=limit, status=status, is_outlab=is_outlab,
        parent_case_id=parent_case_id, stain_id=stain_id, search=search,
        clinician=clinician,
    )


@router.get("/{case_id}", response_model=MolecularCaseResponse, dependencies=[Depends(CAN_READ_REPORT)])
def get_molecular_case(case_id: int, db: Session = Depends(get_db)):
    case = molecular_crud.get_molecular_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


@router.patch("/{case_id}", response_model=MolecularCaseResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def update_molecular_case(case_id: int, payload: MolecularCaseUpdate, db: Session = Depends(get_db)):
    try:
        case = molecular_crud.update_molecular_case(db, case_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


@router.post("/{case_id}/finalize", response_model=MolecularCaseResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def finalize_molecular_case(
    case_id: int,
    payload: MolecularCaseFinalize,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        case = molecular_crud.finalize_molecular_case(
            db, case_id, reported_by_id=current_user.id, result_text=payload.result_text
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


@router.post("/{case_id}/cancel", response_model=MolecularCaseResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def cancel_molecular_case(
    case_id: int,
    payload: MolecularCaseCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = molecular_crud.cancel_molecular_case(
        db, case_id, reason=payload.cancel_reason, cancelled_by_id=current_user.id
    )
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


# --- Out-lab PDF ---

@router.post("/{case_id}/outlab-pdf", dependencies=[Depends(CAN_WRITE_REPORT)])
def upload_outlab_pdf(
    case_id: int,
    file: UploadFile = File(...),
    received_at: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    case = molecular_crud.save_outlab_pdf(db, case_id, file, received_at)
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


@router.get("/{case_id}/outlab-pdf", dependencies=[Depends(CAN_READ_REPORT)])
def download_outlab_pdf(case_id: int, db: Session = Depends(get_db)):
    case = molecular_crud.get_molecular_case(db, case_id)
    if not case or not case.get("outlab_pdf_path"):
        raise HTTPException(status_code=404, detail="No out-lab PDF uploaded for this case")
    if not os.path.exists(case["outlab_pdf_path"]):
        raise HTTPException(status_code=404, detail="Out-lab PDF file missing on disk")
    # Same lab-header + patient/accession cover sheet as the Surgical/Non-Gyne
    # external-consult PDF — regenerated fresh on every request.
    pdf_bytes = molecular_crud.get_outlab_pdf_with_cover(db, case_id)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.delete("/{case_id}/outlab-pdf", response_model=MolecularCaseResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_outlab_pdf(case_id: int, db: Session = Depends(get_db)):
    case = molecular_crud.clear_outlab_pdf(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return case


# --- Free-text result PDF (live-generated, no snapshot table) ---

@router.get("/{case_id}/result-pdf", dependencies=[Depends(CAN_READ_REPORT)])
def download_result_pdf(case_id: int, db: Session = Depends(get_db)):
    pdf_bytes = molecular_crud.get_molecular_result_pdf(db, case_id)
    if pdf_bytes is None:
        raise HTTPException(status_code=404, detail="Molecular case not found")
    return Response(content=pdf_bytes, media_type="application/pdf")
