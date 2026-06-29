from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.user import User
from app.dependencies.auth import get_current_user, check_password_status
from app.core.roles import CAN_REQUEST_CONSULT
from app.schemas.internal_consult import (
    InternalConsultCreate,
    InternalConsultRespondRequest,
    InternalConsultPromoteRequest,
    InternalConsultResponse,
    InternalConsultListResponse,
)
import app.crud.internal_consult as crud

router = APIRouter(
    prefix="/internal-consults",
    tags=["Internal Consults"],
    dependencies=[Depends(check_password_status)],
)


@router.post("", response_model=InternalConsultResponse, status_code=status.HTTP_201_CREATED)
def create_consult(
    payload: InternalConsultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_REQUEST_CONSULT),
):
    """Request an internal consult from another pathologist/cytotechnologist."""
    return crud.create_consult(db, payload, requester_id=current_user.id)


@router.get("/my-pending", response_model=InternalConsultListResponse)
def get_my_pending_consults(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get pending consults assigned to the current user (their worklist)."""
    items, total = crud.get_my_pending(db, consultant_id=current_user.id, skip=skip, limit=limit)
    return {"items": items, "total": total}


@router.get("/report/{case_type}/{report_id}", response_model=List[InternalConsultResponse])
def get_consults_for_report(
    case_type: str,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all consults for a specific report."""
    return crud.get_for_report(db, case_type=case_type, report_id=report_id)


@router.patch("/{consult_id}/respond", response_model=InternalConsultResponse)
def respond_to_consult(
    consult_id: int,
    payload: InternalConsultRespondRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consultant provides their opinion."""
    return crud.respond(db, consult_id=consult_id, consultant_id=current_user.id, opinion=payload.opinion)


@router.patch("/{consult_id}/promote", response_model=InternalConsultResponse)
def promote_to_cosigner(
    consult_id: int,
    payload: InternalConsultPromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Requester promotes the consulted pathologist to a co-signer on the report."""
    return crud.promote(
        db,
        consult_id=consult_id,
        requester_id=current_user.id,
        role=payload.role,
        consult_note=payload.consult_note,
        current_user=current_user,
    )


@router.patch("/{consult_id}/close", response_model=InternalConsultResponse)
def close_consult(
    consult_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Requester closes the consult."""
    return crud.close_consult(db, consult_id=consult_id, requester_id=current_user.id)
