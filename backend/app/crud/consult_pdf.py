"""The per-case /consult-pdf endpoints (surgical, gyne, non-gyne), kept for
the pages that still address the consult by case. They act on the case's
open consult round — see crud.outlab_consult_request, which owns the state."""
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.crud import outlab_consult_request as consult_crud


def save_consult_pdf(
    db: Session,
    case,
    case_type: str,
    file: UploadFile,
    received_at: str | None,
    user_id: int | None = None,
) -> None:
    """A case that was never flagged (consult arranged outside the app) gets
    its round 1 opened here, as this endpoint always accepted any case."""
    if consult_crud.get_latest(db, case_type, case.id) is None:
        consult = consult_crud.open_consult(db, case_type, case, reason=None, user_id=user_id)
    else:
        consult = consult_crud.consult_for_case_endpoint(db, case_type, case.id)
    consult_crud.upload_result_pdf(db, consult, file, received_at, user_id)


def clear_consult_pdf(db: Session, case, case_type: str) -> None:
    consult = consult_crud.consult_for_case_endpoint(db, case_type, case.id)
    consult_crud.delete_result_pdf(db, consult)


def approve_consult_pdf(db: Session, case, approved_by_id: int, case_type: str = "surgical") -> None:
    """Record who reviewed/signed off on the uploaded consult PDF, and when."""
    consult = consult_crud.consult_for_case_endpoint(db, case_type, case.id)
    consult_crud.approve_consult(db, consult, approved_by_id)
    db.refresh(case)
