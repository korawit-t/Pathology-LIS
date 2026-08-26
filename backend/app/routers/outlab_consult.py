from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.outlab_consult import (
    OutlabConsultRunCreate,
    OutlabConsultRunResponse,
    OutlabConsultRunDetailResponse,
    OutlabConsultRunUpdateTracking,
    OutlabRegistrationInfoResponse,
)
from app.crud import outlab_consult as crud

router = APIRouter(prefix="/outlab-consult-runs", tags=["Outlab Consult Runs"])

@router.post("", response_model=OutlabConsultRunResponse, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: OutlabConsultRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.create_consult_run(db, payload, operator_id=current_user.id)

@router.get("", response_model=List[OutlabConsultRunResponse])
def get_runs(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.get_consult_runs(db, skip=skip, limit=limit)

@router.patch("/{run_id}/receive", response_model=OutlabConsultRunResponse)
def receive_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.receive_consult_run(db, run_id=run_id, user_id=current_user.id)


@router.patch("/details/{detail_id}/return-block", response_model=OutlabConsultRunDetailResponse)
def return_block(
    detail_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.return_consult_block(db, detail_id=detail_id, user_id=current_user.id)


@router.patch("/{run_id}/tracking", response_model=OutlabConsultRunResponse)
def update_tracking(
    run_id: int,
    payload: OutlabConsultRunUpdateTracking,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.update_consult_run_tracking(db, run_id=run_id, tracking_number=payload.tracking_number)


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crud.delete_consult_run(db, run_id=run_id)
    return None


@router.get("/registration-info/{case_type}/{case_id}", response_model=OutlabRegistrationInfoResponse)
def get_registration_info(
    case_type: str,
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fields a staffer has to re-key when registering the case at the
    destination lab (patient identity, referring clinician, collection date,
    clinical diagnosis, blocks/slides/stains) — gathered from whichever of the
    three case types it is. Auth matches the rest of this router: any
    authenticated user, no role gate."""
    return crud.get_outlab_registration_info(db, case_type=case_type, case_id=case_id)
