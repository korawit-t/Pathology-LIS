from datetime import date, datetime, time
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.crud import unified_case as crud
from app.db.database import get_db
from app.dependencies.auth import check_password_status
from app.schemas.unified_case import UnifiedCasePaginationResponse

router = APIRouter(prefix="/unified-cases", tags=["Unified Cases"])


@router.get("", response_model=UnifiedCasePaginationResponse)
def read_unified_cases(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    status: Optional[List[str]] = Query(None),
    hospital_id: Optional[int] = Query(None),
    medical_scheme_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    case_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(check_password_status),
):
    return crud.get_unified_cases(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        hospital_id=hospital_id,
        medical_scheme_id=medical_scheme_id,
        date_from=datetime.combine(date_from, time.min) if date_from else None,
        date_to=datetime.combine(date_to, time.max) if date_to else None,
        case_types=case_type,
    )
