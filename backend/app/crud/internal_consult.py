from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException

from app.models.internal_consult import InternalConsult
from app.models.surgical_report import SurgicalReport, ReportStatus
from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus
from app.models.nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus
from app.utils.time import local_now

import app.crud.report_crud as surgical_report_crud
import app.crud.gyne_report_crud as gyne_report_crud
import app.crud.nongyne_cyto_report as nongyne_report_crud


def _load_users(query):
    return query.options(
        selectinload(InternalConsult.requester),
        selectinload(InternalConsult.consultant),
    )


def _get_report_accession(db: Session, case_type: str, report_id: int) -> tuple:
    """Returns (report, accession_no) or raises 404. Also validates report is not DRAFT."""
    if case_type == "surgical":
        report = db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Surgical report not found.")
        return report, report.accession_no

    elif case_type == "gyne":
        report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Gyne report not found.")
        return report, report.accession_no

    elif case_type == "nongyne":
        report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Non-gyne report not found.")
        return report, report.accession_no

    else:
        raise HTTPException(status_code=400, detail=f"Invalid case_type: {case_type}")


def create_consult(db: Session, payload, requester_id: int) -> InternalConsult:
    if payload.requester_id == payload.consultant_id if hasattr(payload, 'requester_id') else requester_id == payload.consultant_id:
        raise HTTPException(status_code=400, detail="Cannot consult with yourself.")

    _, accession_no = _get_report_accession(db, payload.case_type, payload.report_id)

    consult = InternalConsult(
        case_type=payload.case_type,
        report_id=payload.report_id,
        requester_id=requester_id,
        consultant_id=payload.consultant_id,
        reason=payload.reason,
        accession_no_snapshot=accession_no,
        status="pending",
    )
    db.add(consult)
    db.commit()
    db.refresh(consult)

    # Reload with relationships
    return db.query(InternalConsult).options(
        selectinload(InternalConsult.requester),
        selectinload(InternalConsult.consultant),
    ).filter(InternalConsult.id == consult.id).first()


def get_my_pending(db: Session, consultant_id: int, skip: int = 0, limit: int = 50):
    query = _load_users(
        db.query(InternalConsult).filter(
            InternalConsult.consultant_id == consultant_id,
            InternalConsult.status == "pending",
        )
    ).order_by(InternalConsult.created_at.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return items, total


def get_for_report(db: Session, case_type: str, report_id: int):
    return _load_users(
        db.query(InternalConsult).filter(
            InternalConsult.case_type == case_type,
            InternalConsult.report_id == report_id,
        )
    ).order_by(InternalConsult.created_at.desc()).all()


def respond(db: Session, consult_id: int, consultant_id: int, opinion: str) -> InternalConsult:
    consult = db.query(InternalConsult).filter(InternalConsult.id == consult_id).first()
    if not consult:
        raise HTTPException(status_code=404, detail="Consult not found.")
    if consult.consultant_id != consultant_id:
        raise HTTPException(status_code=403, detail="Only the consultant can respond.")
    if consult.status != "pending":
        raise HTTPException(status_code=400, detail="Consult is not pending.")

    consult.opinion = opinion
    consult.status = "responded"
    consult.responded_at = local_now()
    db.commit()
    db.refresh(consult)
    return consult


def promote(db: Session, consult_id: int, requester_id: int, role: str, consult_note, current_user) -> InternalConsult:
    consult = db.query(InternalConsult).filter(InternalConsult.id == consult_id).first()
    if not consult:
        raise HTTPException(status_code=404, detail="Consult not found.")
    if consult.requester_id != requester_id:
        raise HTTPException(status_code=403, detail="Only the requester can promote.")
    if consult.status != "responded":
        raise HTTPException(status_code=400, detail="Consult must be in responded status to promote.")
    if consult.promoted_to_signer:
        raise HTTPException(status_code=400, detail="Already promoted to co-signer.")

    if consult.case_type == "surgical":
        surgical_report_crud.add_signer_to_report(db, consult.report_id, consult.consultant_id, role, consult_note, current_user)
    elif consult.case_type == "gyne":
        gyne_report_crud.add_gyne_signer(db, consult.report_id, consult.consultant_id, role, consult_note, current_user)
    elif consult.case_type == "nongyne":
        nongyne_report_crud.add_nongyne_signer(db, consult.report_id, consult.consultant_id, role, consult_note, current_user)

    consult.promoted_to_signer = True
    db.commit()
    db.refresh(consult)
    return consult


def close_consult(db: Session, consult_id: int, requester_id: int) -> InternalConsult:
    consult = db.query(InternalConsult).filter(InternalConsult.id == consult_id).first()
    if not consult:
        raise HTTPException(status_code=404, detail="Consult not found.")
    if consult.requester_id != requester_id:
        raise HTTPException(status_code=403, detail="Only the requester can close a consult.")
    if consult.status == "closed":
        raise HTTPException(status_code=400, detail="Consult is already closed.")

    consult.status = "closed"
    consult.closed_at = local_now()
    db.commit()
    db.refresh(consult)
    return consult
