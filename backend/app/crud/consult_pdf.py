import os
import uuid
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.utils import storage_paths
from app.utils.file_handler import validate_and_sanitize
from app.utils.storage_paths import resolve_stored_file
from app.utils.time import local_now


def save_consult_pdf(db: Session, case, case_type: str, file: UploadFile, received_at: str | None) -> None:
    """Validate + store a consult PDF against `case`, shared by Surgical and
    NonGyne (both models expose the same consult_pdf_path/consult_pdf_received_at columns)."""
    data, ext = validate_and_sanitize(file, allowed="pdf")

    old_file = resolve_stored_file(case.consult_pdf_path)
    if old_file:
        os.remove(old_file)

    unique_filename = f"consult_{case_type}_{case.id}_{uuid.uuid4()}.{ext}"
    file_path = storage_paths.save(f"consults/{unique_filename}", data)

    case.consult_pdf_path = str(file_path)
    case.consult_pdf_received_at = (
        datetime.fromisoformat(received_at) if received_at else local_now()
    )
    db.commit()


def clear_consult_pdf(db: Session, case) -> None:
    old_file = resolve_stored_file(case.consult_pdf_path)
    if old_file:
        os.remove(old_file)
    case.consult_pdf_path = None
    case.consult_pdf_approved_by_id = None
    case.consult_pdf_approved_at = None
    db.commit()


def approve_consult_pdf(db: Session, case, approved_by_id: int) -> None:
    """Record who reviewed/signed off on the uploaded consult PDF, and when."""
    case.consult_pdf_approved_by_id = approved_by_id
    case.consult_pdf_approved_at = local_now()
    db.commit()
