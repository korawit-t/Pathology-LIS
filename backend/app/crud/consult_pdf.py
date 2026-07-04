import os
import uuid
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.utils.file_handler import validate_and_sanitize
from app.utils.time import local_now

UPLOAD_CONSULT_DIR = os.path.join(os.getcwd(), "uploads", "consults")
os.makedirs(UPLOAD_CONSULT_DIR, exist_ok=True)


def save_consult_pdf(db: Session, case, case_type: str, file: UploadFile, received_at: str | None) -> None:
    """Validate + store a consult PDF against `case`, shared by Surgical and
    NonGyne (both models expose the same consult_pdf_path/consult_pdf_received_at columns)."""
    data, ext = validate_and_sanitize(file, allowed="pdf")

    if case.consult_pdf_path and os.path.exists(case.consult_pdf_path):
        os.remove(case.consult_pdf_path)

    unique_filename = f"consult_{case_type}_{case.id}_{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_CONSULT_DIR, unique_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(data)

    case.consult_pdf_path = file_path
    case.consult_pdf_received_at = (
        datetime.fromisoformat(received_at) if received_at else local_now()
    )
    db.commit()


def clear_consult_pdf(db: Session, case) -> None:
    if case.consult_pdf_path and os.path.exists(case.consult_pdf_path):
        os.remove(case.consult_pdf_path)
    case.consult_pdf_path = None
    db.commit()
