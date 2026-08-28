from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import app.crud.cyto_path_correlation as crud
from app.core.roles import CAN_READ_CYTO_PATH_QC, CAN_WRITE_CYTO_PATH_QC
from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.cyto_path_correlation import VerdictUpdate

router = APIRouter(
    prefix="/cyto-path-correlations",
    tags=["Cyto-Path Concordance QC"],
    dependencies=[Depends(CAN_READ_CYTO_PATH_QC)],
)


def _filters(
    case_type: Optional[str],
    status: Optional[str],
    result: Optional[str],
    cytotechnologist_id: Optional[int],
    pathologist_id: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
    search: Optional[str],
    current_user,
) -> dict:
    return {
        "case_type": case_type,
        "status": status,
        "result": result,
        # A plain cytotechnologist is pinned to their own rows regardless of
        # what the client asked for.
        "cytotechnologist_id": crud.scope_to_user(current_user, cytotechnologist_id),
        "pathologist_id": pathologist_id,
        "start_date": start_date,
        "end_date": end_date,
        "search": search,
    }


@router.get("")
def list_correlations(
    skip: int = 0,
    limit: int = 20,
    case_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    cytotechnologist_id: Optional[int] = Query(None),
    pathologist_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.list_correlations(
        db,
        skip=skip,
        limit=limit,
        **_filters(
            case_type, status, result, cytotechnologist_id, pathologist_id,
            start_date, end_date, search, current_user,
        ),
    )


@router.get("/summary")
def get_summary(
    case_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    cytotechnologist_id: Optional[int] = Query(None),
    pathologist_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.get_summary(
        db,
        **_filters(
            case_type, status, result, cytotechnologist_id, pathologist_id,
            start_date, end_date, search, current_user,
        ),
    )


@router.get("/by-case")
def get_by_case(
    case_type: str = Query(..., pattern="^(gyne|nongyne)$"),
    case_id: int = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.get_by_case(db, case_type, case_id)


@router.put("/{correlation_id}", dependencies=[Depends(CAN_WRITE_CYTO_PATH_QC)])
def set_verdict(
    correlation_id: int,
    payload: VerdictUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = crud.set_verdict(db, correlation_id, payload, current_user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Correlation not found")
    return row
