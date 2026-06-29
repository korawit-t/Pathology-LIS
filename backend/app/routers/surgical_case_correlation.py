from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.core.roles import CAN_WRITE_REPORT
from app.schemas.surgical_case_correlation import (
    SurgicalCaseCorrelationCreate,
    SurgicalCaseCorrelationUpdate,
)
import app.crud.surgical_case_correlation as crud

router = APIRouter(
    prefix="/surgical-case-correlations",
    tags=["Surgical Case Correlation"],
)


@router.get("/by-case/{case_id}")
def get_by_case(case_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return crud.get_by_case(db, case_id)


@router.post("", dependencies=[Depends(CAN_WRITE_REPORT)])
def create_correlation(
    payload: SurgicalCaseCorrelationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.create(db, payload, current_user.id)


@router.put("/{correlation_id}", dependencies=[Depends(CAN_WRITE_REPORT)])
def update_correlation(
    correlation_id: int,
    payload: SurgicalCaseCorrelationUpdate,
    db: Session = Depends(get_db),
):
    result = crud.update(db, correlation_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Correlation not found")
    return result


@router.delete("/{correlation_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_correlation(correlation_id: int, db: Session = Depends(get_db)):
    if not crud.delete(db, correlation_id):
        raise HTTPException(status_code=404, detail="Correlation not found")
