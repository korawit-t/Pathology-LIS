"""Out-lab consult rounds — one OutlabConsultRequest row per consult a case
goes through (S26-01234-C1, -C2, …), all on the case's own accession.

Every path that changes a case's consult state goes through this module:
the request/cancel buttons, the old per-case is_out_lab_consult flag that
bulk-save / report publish / case PATCH still send, dispatch in a consult
run, the result PDF, approval, and release on a published report. That keeps
the case's consult_* columns — a cache of its latest round that the
worklists, badges and queues still read — written in exactly one place,
sync_case_summary.

Functions without a leading underscore that end in a commit are the router's;
the rest only flush, so the report-publish and run orchestrators can call
them inside their own transaction.
"""
import json
import logging
import os
import uuid
from datetime import datetime

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.outlab_consult_request import (
    CONSULT_ACTIVE_STATUSES,
    CONSULT_APPROVED,
    CONSULT_CANCELLED,
    CONSULT_PRINTABLE_STATUSES,
    CONSULT_REPORTED,
    CONSULT_REQUESTED,
    CONSULT_RESULT_RECEIVED,
    CONSULT_SENT,
    OutlabConsultRequest,
)
from app.utils import storage_paths
from app.utils.file_handler import validate_and_sanitize
from app.utils.storage_paths import resolve_stored_file
from app.utils.time import local_now

logger = logging.getLogger(__name__)

CASE_TYPES = ("surgical", "gyne", "nongyne")

# What the case's cached consult_status reads for its latest round — the
# three values the frontend has always known.
_CASE_STATUS_FOR = {
    CONSULT_REQUESTED: "pending",
    CONSULT_SENT: "processing",
    CONSULT_RESULT_RECEIVED: "processing",
    CONSULT_APPROVED: "processing",
    CONSULT_REPORTED: "received",
}

CONCORDANCE_VALUES = ("concordant", "minor_discordant", "major_discordant")


# ─── Lookups ──────────────────────────────────────────────────────────────────

def case_model(case_type: str):
    if case_type == "surgical":
        from app.models.surgical_case import SurgicalCase
        return SurgicalCase
    if case_type == "gyne":
        from app.models.gyne_cyto_case import GyneCytologyCase
        return GyneCytologyCase
    if case_type == "nongyne":
        from app.models.nongyne_cyto_case import NongyneCytologyCase
        return NongyneCytologyCase
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="case_type must be one of: surgical, gyne, nongyne",
    )


def get_case(db: Session, case_type: str, case_id: int, *, for_update: bool = False):
    model = case_model(case_type)
    query = db.query(model).filter(model.id == case_id)
    if for_update:
        query = query.with_for_update()
    case = query.first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def get_consult(db: Session, consult_id: int) -> OutlabConsultRequest:
    consult = db.query(OutlabConsultRequest).filter(OutlabConsultRequest.id == consult_id).first()
    if not consult:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consult not found")
    return consult


def _case_filter(case_type: str, case_id: int):
    return (
        OutlabConsultRequest.case_type == case_type,
        OutlabConsultRequest.case_id == case_id,
    )


def list_for_case(db: Session, case_type: str, case_id: int) -> list[OutlabConsultRequest]:
    case_model(case_type)  # validates case_type
    return (
        db.query(OutlabConsultRequest)
        .filter(*_case_filter(case_type, case_id))
        .order_by(OutlabConsultRequest.seq)
        .all()
    )


def get_active(db: Session, case_type: str, case_id: int) -> OutlabConsultRequest | None:
    """The case's consult that hasn't been released or cancelled — at most one."""
    db.flush()
    return (
        db.query(OutlabConsultRequest)
        .filter(
            *_case_filter(case_type, case_id),
            OutlabConsultRequest.status.in_(CONSULT_ACTIVE_STATUSES),
        )
        .order_by(OutlabConsultRequest.seq.desc())
        .first()
    )


def get_latest(db: Session, case_type: str, case_id: int) -> OutlabConsultRequest | None:
    db.flush()
    return (
        db.query(OutlabConsultRequest)
        .filter(
            *_case_filter(case_type, case_id),
            OutlabConsultRequest.status != CONSULT_CANCELLED,
        )
        .order_by(OutlabConsultRequest.seq.desc())
        .first()
    )


def printable_consult_ids(db: Session, case_type: str, case_id: int) -> list[int]:
    """Consults whose cover goes on a report round issued now: every reviewed
    one, released or about to be, oldest first — the latest round is the
    copy the clinician reads, so it carries all of them."""
    db.flush()
    rows = (
        db.query(OutlabConsultRequest.id)
        .filter(
            *_case_filter(case_type, case_id),
            OutlabConsultRequest.status.in_(CONSULT_PRINTABLE_STATUSES),
        )
        .order_by(OutlabConsultRequest.seq)
        .all()
    )
    return [r.id for r in rows]


def case_status_for(consult: OutlabConsultRequest | None) -> str | None:
    """A consult's state in the case-level vocabulary (pending/processing/received)."""
    if consult is None:
        return None
    return _CASE_STATUS_FOR.get(consult.status)


# ─── The case-level cache ─────────────────────────────────────────────────────

def sync_case_summary(db: Session, case_type: str, case) -> None:
    """Copy the case's latest non-cancelled consult onto its consult_* columns."""
    latest = get_latest(db, case_type, case.id)
    if latest is None:
        case.is_out_lab_consult = False
        case.consult_status = None
        case.consult_reason = None
        case.consult_pdf_path = None
        case.consult_pdf_received_at = None
    else:
        case.is_out_lab_consult = True
        case.consult_status = _CASE_STATUS_FOR[latest.status]
        case.consult_reason = latest.reason
        case.consult_pdf_path = latest.result_pdf_path
        case.consult_pdf_received_at = latest.result_received_at
    # Only SurgicalCase carries the approver columns.
    if hasattr(type(case), "consult_pdf_approved_by_id"):
        case.consult_pdf_approved_by_id = latest.approved_by_id if latest else None
        case.consult_pdf_approved_at = latest.approved_at if latest else None
    db.flush()


# ─── Opening and withdrawing a consult ────────────────────────────────────────

def open_consult(
    db: Session,
    case_type: str,
    case,
    *,
    reason: str | None,
    destination_lab: str | None = None,
    user_id: int | None = None,
) -> OutlabConsultRequest:
    active = get_active(db, case_type, case.id)
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {active.consult_no} is still in progress — "
                   "finish or cancel it before requesting another one.",
        )

    # Serializes seq allocation for this case under concurrent requests.
    get_case(db, case_type, case.id, for_update=True)
    last_seq = (
        db.query(func.max(OutlabConsultRequest.seq))
        .filter(*_case_filter(case_type, case.id))
        .scalar()
    )
    seq = (last_seq or 0) + 1

    consult = OutlabConsultRequest(
        case_type=case_type,
        case_id=case.id,
        seq=seq,
        consult_no=f"{case.accession_no}-C{seq}",
        status=CONSULT_REQUESTED,
        reason=reason,
        destination_lab=destination_lab,
        requested_by_id=user_id,
        requested_at=local_now(),
    )
    db.add(consult)
    db.flush()
    sync_case_summary(db, case_type, case)
    return consult


def _cancel(consult: OutlabConsultRequest, user_id: int | None, reason: str | None) -> None:
    if consult.status != CONSULT_REQUESTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {consult.consult_no} has already been dispatched — "
                   "cancel the consult run instead.",
        )
    consult.status = CONSULT_CANCELLED
    consult.cancelled_at = local_now()
    consult.cancelled_by_id = user_id
    consult.cancel_reason = reason


def apply_case_flag(
    db: Session,
    case_type: str,
    case,
    *,
    flag: bool | None,
    reason: str | None,
    user_id: int | None,
) -> None:
    """The old per-case is_out_lab_consult / consult_reason inputs, still sent
    by surgical bulk-save, gyne/non-gyne report publish and case PATCH.

    - flag True opens a consult only when the case has none yet. The toggle
      stays on after a round is released and keeps being re-sent with every
      later save, so it can't mean "start another round" — that is asked for
      explicitly (POST /outlab-consults).
    - flag False withdraws a consult that hasn't shipped. Rounds already sent
      or released stay on record.
    - a reason updates the open consult's reason.
    """
    active = get_active(db, case_type, case.id)
    if flag is True and active is None and get_latest(db, case_type, case.id) is None:
        open_consult(db, case_type, case, reason=reason, user_id=user_id)
        return
    if flag is False:
        if active is not None and active.status == CONSULT_REQUESTED:
            _cancel(active, user_id, reason=None)
    elif reason is not None and active is not None:
        active.reason = reason
    sync_case_summary(db, case_type, case)


# Case PATCH fields owned by the consult rows; the PATCH may only flag/unflag
# and reword through apply_case_flag, never write the cached state itself.
_PATCH_OWNED_FIELDS = ("is_out_lab_consult", "consult_reason", "consult_status", "consult_pdf_received_at")


def apply_case_patch(db: Session, case_type: str, case, update_data: dict, user_id: int | None) -> None:
    """Take the consult fields out of a case PATCH payload (in place) and apply
    the flag and reason; the caller then writes the rest as before."""
    owned = {k: update_data.pop(k) for k in _PATCH_OWNED_FIELDS if k in update_data}
    if "is_out_lab_consult" in owned or owned.get("consult_reason") is not None:
        apply_case_flag(
            db,
            case_type,
            case,
            flag=owned.get("is_out_lab_consult"),
            reason=owned.get("consult_reason"),
            user_id=user_id,
        )


# ─── Dispatch (consult runs) ──────────────────────────────────────────────────

def dispatch(
    db: Session,
    case_type: str,
    case_id: int,
    *,
    destination_lab: str | None,
    user_id: int | None,
) -> OutlabConsultRequest:
    """Put the case's consult in a run. A case with no open consult gets one;
    one already out stays `sent` (more material for the same consult)."""
    case = get_case(db, case_type, case_id)
    active = get_active(db, case_type, case_id)
    if active is None:
        active = open_consult(
            db, case_type, case, reason=None, destination_lab=destination_lab, user_id=user_id
        )
    if active.status in (CONSULT_RESULT_RECEIVED, CONSULT_APPROVED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {active.consult_no} already has its result back — "
                   "request a new consult to send more material.",
        )
    if active.status == CONSULT_REQUESTED:
        active.status = CONSULT_SENT
        if not active.destination_lab:
            active.destination_lab = destination_lab
    sync_case_summary(db, case_type, case)
    return active


def withdraw_shipment(db: Session, detail) -> None:
    """A run line is being deleted: its consult goes back to the send queue,
    unless the result is already in (then the run must stay as the record of
    how the material went out) or another run still carries it."""
    from app.models.outlab_consult import OutlabConsultRunDetail

    consult = detail.consult
    if consult is None:
        consult = get_active(db, detail.case_type, detail.case_id)
    if consult is None or consult.status in (CONSULT_REQUESTED, CONSULT_CANCELLED):
        return
    if consult.status != CONSULT_SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {consult.consult_no} already has its result on file — "
                   "this run can't be deleted.",
        )
    still_shipped = (
        db.query(OutlabConsultRunDetail.id)
        .filter(
            OutlabConsultRunDetail.consult_id == consult.id,
            OutlabConsultRunDetail.run_id != detail.run_id,
        )
        .first()
    )
    if not still_shipped:
        consult.status = CONSULT_REQUESTED
    sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))


# ─── Result PDF and approval ──────────────────────────────────────────────────

def _assert_result_editable(consult: OutlabConsultRequest) -> None:
    if consult.status == CONSULT_REPORTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {consult.consult_no} has been released on a report and can't be "
                   "changed — request a new consult instead.",
        )
    if consult.status == CONSULT_CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {consult.consult_no} was cancelled.",
        )


def _clear_approval(consult: OutlabConsultRequest) -> None:
    consult.approved_by_id = None
    consult.approved_at = None
    consult.pdf_thumbnails = None


def _status_without_result(db: Session, consult: OutlabConsultRequest) -> str:
    from app.models.outlab_consult import OutlabConsultRunDetail

    shipped = (
        db.query(OutlabConsultRunDetail.id)
        .filter(OutlabConsultRunDetail.consult_id == consult.id)
        .first()
    )
    return CONSULT_SENT if shipped else CONSULT_REQUESTED


def put_result_pdf(
    db: Session,
    consult: OutlabConsultRequest,
    file: UploadFile,
    received_at: str | None,
    user_id: int | None,
) -> None:
    """Store the external lab's PDF. Replacing it voids an approval — the
    approver signed the file they saw, not this one. A consult arranged
    without a run (material hand-carried) may take its result while still
    `requested`."""
    _assert_result_editable(consult)
    data, ext = validate_and_sanitize(file, allowed="pdf")

    old_file = resolve_stored_file(consult.result_pdf_path)
    if old_file:
        os.remove(old_file)

    filename = f"consult_{consult.case_type}_{consult.case_id}_c{consult.seq}_{uuid.uuid4()}.{ext}"
    consult.result_pdf_path = str(storage_paths.save(f"consults/{filename}", data))
    consult.result_received_at = (
        datetime.fromisoformat(received_at) if received_at else local_now()
    )
    consult.result_uploaded_by_id = user_id
    _clear_approval(consult)
    consult.status = CONSULT_RESULT_RECEIVED
    sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))


def remove_result_pdf(db: Session, consult: OutlabConsultRequest) -> None:
    _assert_result_editable(consult)
    old_file = resolve_stored_file(consult.result_pdf_path)
    if old_file:
        os.remove(old_file)
    consult.result_pdf_path = None
    consult.result_received_at = None
    consult.result_uploaded_by_id = None
    _clear_approval(consult)
    if consult.status in (CONSULT_RESULT_RECEIVED, CONSULT_APPROVED):
        consult.status = _status_without_result(db, consult)
    sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))


def _rasterize(consult: OutlabConsultRequest) -> list[str]:
    from app.crud.surgical_report_builder import get_consult_pdf_thumbnails_base64

    pdf = resolve_stored_file(consult.result_pdf_path)
    return get_consult_pdf_thumbnails_base64(str(pdf)) if pdf else []


def thumbnails_for(consult: OutlabConsultRequest) -> list[str]:
    """The consult's page images — stored at approve; rows that predate that
    (migrated) are rasterized from the file on demand."""
    if consult.pdf_thumbnails:
        try:
            return json.loads(consult.pdf_thumbnails)
        except (TypeError, ValueError):
            logger.warning("Unreadable pdf_thumbnails on consult %s", consult.id)
    return _rasterize(consult)


def mark_approved(db: Session, consult: OutlabConsultRequest, user_id: int) -> None:
    _assert_result_editable(consult)
    if not resolve_stored_file(consult.result_pdf_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No consult PDF uploaded to approve",
        )
    consult.approved_by_id = user_id
    consult.approved_at = local_now()
    thumbnails = _rasterize(consult)
    consult.pdf_thumbnails = json.dumps(thumbnails) if thumbnails else None
    consult.status = CONSULT_APPROVED
    sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))


# ─── Release on a report round ────────────────────────────────────────────────

def assert_releasable(db: Session, case_type: str, case_id: int) -> None:
    """A report round can't go out while the case's consult is out of the lab
    or its result hasn't been reviewed — the approver's name is printed on the
    cover as its signature."""
    active = get_active(db, case_type, case_id)
    if active is None:
        return
    if active.status == CONSULT_SENT:
        raise HTTPException(
            status_code=423,
            detail=f"Consult {active.consult_no} has been dispatched and its result isn't back yet. "
                   "Upload the consult PDF first.",
        )
    if active.status == CONSULT_RESULT_RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Consult {active.consult_no} must be approved before this report can be released.",
        )


def mark_released(db: Session, case_type: str, case_id: int, report_id: int) -> None:
    """Every approved consult of the case went out on report `report_id`."""
    approved = (
        db.query(OutlabConsultRequest)
        .filter(
            *_case_filter(case_type, case_id),
            OutlabConsultRequest.status == CONSULT_APPROVED,
        )
        .all()
    )
    now = local_now()
    for consult in approved:
        consult.status = CONSULT_REPORTED
        consult.reported_in_report_id = report_id
        consult.reported_at = now
    sync_case_summary(db, case_type, get_case(db, case_type, case_id))


# ─── Router-facing (commit) ───────────────────────────────────────────────────

def _commit(db: Session, consult: OutlabConsultRequest) -> OutlabConsultRequest:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(consult)
    return consult


def request_consult(
    db: Session,
    case_type: str,
    case_id: int,
    *,
    reason: str | None,
    destination_lab: str | None,
    user_id: int,
) -> OutlabConsultRequest:
    case = get_case(db, case_type, case_id)
    consult = open_consult(
        db, case_type, case, reason=reason, destination_lab=destination_lab, user_id=user_id
    )
    return _commit(db, consult)


def cancel_consult(
    db: Session, consult: OutlabConsultRequest, *, user_id: int, reason: str | None
) -> OutlabConsultRequest:
    _cancel(consult, user_id, reason)
    sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))
    return _commit(db, consult)


def upload_result_pdf(
    db: Session,
    consult: OutlabConsultRequest,
    file: UploadFile,
    received_at: str | None,
    user_id: int,
) -> OutlabConsultRequest:
    put_result_pdf(db, consult, file, received_at, user_id)
    return _commit(db, consult)


def delete_result_pdf(db: Session, consult: OutlabConsultRequest) -> OutlabConsultRequest:
    remove_result_pdf(db, consult)
    return _commit(db, consult)


def approve_consult(db: Session, consult: OutlabConsultRequest, user_id: int) -> OutlabConsultRequest:
    mark_approved(db, consult, user_id)
    return _commit(db, consult)


def update_consult_details(
    db: Session, consult: OutlabConsultRequest, changes: dict
) -> OutlabConsultRequest:
    """Reference fields only — what the destination lab called it, who read
    it, and whether they agreed. Editable until released."""
    if consult.status in (CONSULT_REPORTED, CONSULT_CANCELLED) and set(changes) - {"concordance"}:
        _assert_result_editable(consult)
    concordance = changes.get("concordance")
    if concordance is not None and concordance not in CONCORDANCE_VALUES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"concordance must be one of: {', '.join(CONCORDANCE_VALUES)}",
        )
    for field in ("destination_lab", "external_ref", "external_pathologist", "concordance", "reason"):
        if field in changes:
            setattr(consult, field, changes[field] or None)
    if "reason" in changes:
        sync_case_summary(db, consult.case_type, get_case(db, consult.case_type, consult.case_id))
    return _commit(db, consult)


def consult_for_case_endpoint(db: Session, case_type: str, case_id: int) -> OutlabConsultRequest:
    """The consult the old per-case /consult-pdf endpoints act on: the open
    one, else the latest (so a released round's PDF still downloads)."""
    consult = get_active(db, case_type, case_id) or get_latest(db, case_type, case_id)
    if consult is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This case has no out-lab consult.",
        )
    return consult
