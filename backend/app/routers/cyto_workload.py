from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional

from app.db.database import get_db
from app.crud import cyto_workload as crud
from app.schemas.cyto_workload import (
    CytoWorkloadLogUpsert,
    CytoWorkloadLogResponse,
    CytoWorkloadDayStats,
)
from app.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/cyto-workload",
    tags=["Cytotechnologist Workload"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/stats", response_model=List[CytoWorkloadDayStats])
def get_workload_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user_ids: Optional[List[int]] = Query(None),
    db: Session = Depends(get_db),
):
    return crud.get_workload_stats(db, start_date=start_date, end_date=end_date, user_ids=user_ids)


@router.post("/hours", response_model=CytoWorkloadLogResponse)
def upsert_hours(
    payload: CytoWorkloadLogUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.upsert_workload_log(db, obj=payload, recorded_by_id=current_user.id)


@router.get("/hours", response_model=Optional[CytoWorkloadLogResponse])
def get_hours(
    user_id: int = Query(...),
    work_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return crud.get_workload_log(db, user_id=user_id, work_date=work_date)
