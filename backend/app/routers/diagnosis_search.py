"""Diagnosis-search report: find cases by specimen text + diagnosis text.

Thin HTTP glue over `crud.diagnosis_search` — one JSON endpoint that backs both
the on-screen table and the CSV/Excel export, which is built client-side from
the same payload (no second round trip, and no server-side spreadsheet
dependency for a LAN deployment to install).
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.roles import CAN_READ_DIAGNOSIS_SEARCH
from app.crud import diagnosis_search as crud
from app.db.database import get_db
from app.dependencies.auth import (
    check_password_status,
    get_current_user,
    get_scoped_hospital_ids,
)
from app.models.user import User
from app.schemas.diagnosis_search import DiagnosisSearchResponse

router = APIRouter(
    prefix="/diagnosis-search",
    tags=["Diagnosis Search Report"],
    dependencies=[Depends(check_password_status), Depends(CAN_READ_DIAGNOSIS_SEARCH)],
)


@router.get("", response_model=DiagnosisSearchResponse)
def search_cases(
    specimen_terms: List[str] = Query(default=[]),
    diagnosis_terms: List[str] = Query(default=[]),
    match_mode: str = Query("all", pattern="^(all|any)$"),
    include_gross: bool = Query(False),
    include_microscopic: bool = Query(False),
    date_field: str = Query("registered", pattern="^(registered|reported)$"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    hospital_id: Optional[int] = Query(None),
    only_reported: bool = Query(True),
    limit: int = Query(crud.MAX_ROWS, ge=1, le=crud.MAX_ROWS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spec_terms = crud.normalize_terms(specimen_terms)
    diag_terms = crud.normalize_terms(diagnosis_terms)
    if not spec_terms and not diag_terms:
        # An unconstrained query would just dump every reported case, which is
        # what the case list page is for — make the caller name a term.
        raise HTTPException(
            status_code=400,
            detail="At least one specimen term or diagnosis term is required.",
        )

    result = crud.search_cases(
        db,
        specimen_terms=spec_terms,
        diagnosis_terms=diag_terms,
        match_mode=match_mode,
        include_gross=include_gross,
        include_microscopic=include_microscopic,
        date_field=date_field,
        date_from=date_from,
        date_to=date_to,
        hospital_id=hospital_id,
        only_reported=only_reported,
        scoped_hospital_ids=get_scoped_hospital_ids(current_user),
        limit=limit,
    )

    return {
        **result,
        "criteria": {
            "specimen_terms": spec_terms,
            "diagnosis_terms": diag_terms,
            "match_mode": match_mode,
            "include_gross": include_gross,
            "include_microscopic": include_microscopic,
            "date_field": date_field,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "hospital_name": crud.resolve_hospital_name(db, hospital_id),
            "only_reported": only_reported,
        },
    }
