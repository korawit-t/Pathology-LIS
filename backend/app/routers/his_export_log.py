from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.core.roles import CAN_VIEW_HIS_EXPORT_LOG
from app.crud import his_export_log as crud
from app.schemas.his_export import HisExportLogResponse, HisExportLogList

router = APIRouter(prefix="/his-export-logs", tags=["HIS Export"])


@router.get("", response_model=HisExportLogList)
def list_all(
    status: Optional[str] = None,
    resource_type: Optional[str] = None,
    accession_no: Optional[str] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_VIEW_HIS_EXPORT_LOG),
):
    total, items = crud.list_logs(
        db,
        status=status,
        resource_type=resource_type,
        accession_no=accession_no,
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": items}


@router.get("/{log_id}", response_model=HisExportLogResponse)
def get_one(
    log_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_VIEW_HIS_EXPORT_LOG),
):
    log = crud.get_by_id(db, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Export log not found")
    return log


@router.post("/{log_id}/retry", response_model=HisExportLogResponse, status_code=201)
def retry(
    log_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_VIEW_HIS_EXPORT_LOG),
):
    return crud.retry(db, log_id=log_id, current_user=current_user)
