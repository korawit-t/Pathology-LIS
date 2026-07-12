from datetime import timedelta
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import his_export as his_export_config
from app.his_export import DeliveryResult
from app.models.his_export_log import HisExportLog
from app.utils.time import local_now

_ACTIVE_STATUSES = ("pending", "processing")


def enqueue(
    db: Session,
    *,
    resource_type: str,
    resource_id: int,
    accession_no: Optional[str],
    payload_snapshot: dict,
) -> Optional[HisExportLog]:
    """Enqueue a report for HIS export. No-ops (returns None, inserts nothing)
    when HIS_EXPORT_TYPE=none. Idempotent: if a row for this resource is
    already pending/processing, returns it unchanged instead of duplicating.

    Deliberately does not commit — participates in the caller's existing
    transaction so the enqueue rolls back together with the status flip that
    triggered it if anything later in that request fails.
    """
    if his_export_config.HIS_EXPORT_TYPE == "none":
        return None

    existing = (
        db.query(HisExportLog)
        .filter(
            HisExportLog.resource_type == resource_type,
            HisExportLog.resource_id == resource_id,
            HisExportLog.status.in_(_ACTIVE_STATUSES),
        )
        .first()
    )
    if existing:
        return existing

    row = HisExportLog(
        resource_type=resource_type,
        resource_id=resource_id,
        accession_no=accession_no,
        status="pending",
        adapter_type=his_export_config.HIS_EXPORT_TYPE,
        payload_snapshot=payload_snapshot,
        attempt_count=0,
        max_attempts=his_export_config.HIS_EXPORT_MAX_ATTEMPTS,
        next_attempt_at=local_now(),
        triggered_by="auto",
    )
    db.add(row)
    db.flush()
    return row


def list_logs(
    db: Session,
    *,
    status: Optional[str] = None,
    resource_type: Optional[str] = None,
    accession_no: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Tuple[int, List[HisExportLog]]:
    query = db.query(HisExportLog)
    if status:
        query = query.filter(HisExportLog.status == status)
    if resource_type:
        query = query.filter(HisExportLog.resource_type == resource_type)
    if accession_no:
        query = query.filter(HisExportLog.accession_no.ilike(f"%{accession_no}%"))

    total = query.count()
    items = (
        query.order_by(HisExportLog.created_at.desc()).offset(skip).limit(limit).all()
    )
    return total, items


def get_by_id(db: Session, log_id: int) -> Optional[HisExportLog]:
    return db.query(HisExportLog).filter(HisExportLog.id == log_id).first()


def retry(db: Session, *, log_id: int, current_user) -> HisExportLog:
    """Manually retry a terminal (sent/dead_letter/cancelled) export log by
    inserting a fresh row with a clean attempt budget — the old row is left
    untouched as an immutable history entry."""
    old = get_by_id(db, log_id)
    if not old:
        raise HTTPException(status_code=404, detail="Export log not found")
    if old.status in _ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail="Export is already in progress")

    new_row = HisExportLog(
        resource_type=old.resource_type,
        resource_id=old.resource_id,
        accession_no=old.accession_no,
        status="pending",
        adapter_type=his_export_config.HIS_EXPORT_TYPE,
        payload_snapshot=old.payload_snapshot,
        attempt_count=0,
        max_attempts=his_export_config.HIS_EXPORT_MAX_ATTEMPTS,
        next_attempt_at=local_now(),
        triggered_by="manual",
        created_by_user_id=current_user.id,
    )
    db.add(new_row)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race against a concurrent retry/auto-enqueue for the same
        # resource — the partial unique index caught it, which is exactly
        # what it's for.
        db.rollback()
        raise HTTPException(status_code=400, detail="Export is already in progress")
    db.refresh(new_row)
    return new_row


def claim_batch(db: Session, *, batch_size: int, stale_after_seconds: int) -> List[HisExportLog]:
    """Worker-side: atomically claim up to batch_size rows that are due for
    (re)delivery, flipping them to 'processing'. Uses SELECT ... FOR UPDATE
    SKIP LOCKED so this is safe even if more than one worker loop is ever
    running concurrently."""
    now = local_now()
    stale_cutoff = now - timedelta(seconds=stale_after_seconds)

    rows = (
        db.query(HisExportLog)
        .filter(
            or_(
                and_(HisExportLog.status == "pending", HisExportLog.next_attempt_at <= now),
                and_(HisExportLog.status == "processing", HisExportLog.claimed_at < stale_cutoff),
            )
        )
        .order_by(HisExportLog.next_attempt_at.asc())
        .limit(batch_size)
        .with_for_update(skip_locked=True)
        .all()
    )
    for row in rows:
        row.status = "processing"
        row.claimed_at = now
    db.commit()
    return rows


def record_attempt_result(db: Session, *, log_id: int, result: DeliveryResult) -> None:
    """Worker-side: apply the outcome of one delivery attempt — success,
    or failure with either a backoff-scheduled retry or a dead letter if the
    attempt budget is exhausted."""
    row = get_by_id(db, log_id)
    if not row:
        return

    now = local_now()
    if result.success:
        row.status = "sent"
        row.sent_at = now
        row.his_reference_id = result.reference_id
        row.response_snapshot = result.response_snapshot
        row.error_message = None
    else:
        row.attempt_count += 1
        row.error_message = result.error_message
        row.response_snapshot = result.response_snapshot
        if row.attempt_count >= row.max_attempts:
            row.status = "dead_letter"
        else:
            row.status = "pending"
            backoff_seconds = min(
                his_export_config.HIS_EXPORT_BACKOFF_BASE_SECONDS * (2 ** (row.attempt_count - 1)),
                his_export_config.HIS_EXPORT_BACKOFF_MAX_SECONDS,
            )
            row.next_attempt_at = now + timedelta(seconds=backoff_seconds)
    db.commit()
