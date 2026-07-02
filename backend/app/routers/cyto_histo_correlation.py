from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.core.roles import CAN_WRITE_REPORT
from app.schemas.cyto_histo_correlation import CorrelationCreate, CorrelationUpdate
import app.crud.cyto_histo_correlation as crud

router = APIRouter(prefix="/cyto-histo-correlations", tags=["Cyto-Histo Correlation"])


@router.get("")
def list_correlations(
    skip: int = 0,
    limit: int = 20,
    result: Optional[str] = Query(None),
    case_type: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.list_correlations(db, skip=skip, limit=limit, result=result, start_date=start_date, end_date=end_date, case_type=case_type)


@router.get("/summary")
def get_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.get_correlation_summary(db, start_date=start_date, end_date=end_date)


@router.get("/summary/cases")
def get_summary_group_cases(
    group: str = Query(...),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.get_correlation_group_cases(db, group=group, start_date=start_date, end_date=end_date)


@router.get("/by-nongyne-case/{case_id}")
def get_by_nongyne_case(case_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return crud.get_by_nongyne_case(db, case_id)


@router.get("/by-gyne-case/{case_id}")
def get_by_gyne_case(case_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return crud.get_by_gyne_case(db, case_id)


@router.get("/surgical-context/{patient_id}")
def get_surgical_context(
    patient_id: int,
    surgical_accession: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.get_surgical_context(db, patient_id, surgical_accession)


@router.post("", dependencies=[Depends(CAN_WRITE_REPORT)])
def create_correlation(
    payload: CorrelationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.create_correlation(db, payload, current_user.id)


@router.put("/{correlation_id}", dependencies=[Depends(CAN_WRITE_REPORT)])
def update_correlation(
    correlation_id: int,
    payload: CorrelationUpdate,
    db: Session = Depends(get_db),
):
    result = crud.update_correlation(db, correlation_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Correlation not found")
    return result


@router.delete("/{correlation_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_correlation(
    correlation_id: int,
    db: Session = Depends(get_db),
):
    if not crud.delete_correlation(db, correlation_id):
        raise HTTPException(status_code=404, detail="Correlation not found")
