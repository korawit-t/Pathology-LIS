import asyncio
import base64
import logging
from contextlib import asynccontextmanager
from typing import Optional

from app import his_export as his_export_config
from app.crud import his_export_log as his_export_crud
from app.db.database import SessionLocal
from app.his_export import DeliveryResult, get_his_export_adapter

logger = logging.getLogger(__name__)


async def _load_pdf_base64(db, resource_type: str, resource_id: int) -> Optional[str]:
    """Render the report's PDF on demand (there's no "PDF ready" event — reports
    are only ever rendered lazily today) and return it base64-encoded. Never
    persisted back to payload_snapshot — always regeneratable from resource_id."""
    if resource_type == "SurgicalReport":
        from app.models.surgical_report import SurgicalReport
        from app.crud.surgical_report import get_surgical_report_pdf

        report = db.query(SurgicalReport).filter(SurgicalReport.id == resource_id).first()
        if not report:
            return None
        pdf_bytes = get_surgical_report_pdf(db, report)
    elif resource_type == "GyneCytoReport":
        from app.models.gyne_cyto_report import GyneCytoReport
        from app.crud.gyne_cyto_report import get_gyne_report_pdf

        report = db.query(GyneCytoReport).filter(GyneCytoReport.id == resource_id).first()
        if not report:
            return None
        pdf_bytes = get_gyne_report_pdf(db, report.case_id, report_id=report.id)
    elif resource_type == "NongyneCytoReport":
        from app.models.nongyne_cyto_report import NongyneCytoReport
        from app.crud.nongyne_cyto_report import get_nongyne_report_pdf

        report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == resource_id).first()
        if not report:
            return None
        pdf_bytes = get_nongyne_report_pdf(db, report)
    else:
        return None

    if not pdf_bytes:
        return None
    return base64.b64encode(pdf_bytes).decode("ascii")


async def _process_one(
    row_id: int,
    resource_type: str,
    resource_id: int,
    accession_no: Optional[str],
    payload_snapshot: dict,
) -> None:
    payload = dict(payload_snapshot or {})

    if his_export_config.HIS_EXPORT_INCLUDE_PDF:
        db = SessionLocal()
        try:
            pdf_b64 = await _load_pdf_base64(db, resource_type, resource_id)
            if pdf_b64:
                payload["pdf_base64"] = pdf_b64
        except Exception:
            logger.exception(
                "HIS export: PDF generation failed for %s #%s (accession %s)",
                resource_type, resource_id, accession_no,
            )
        finally:
            db.close()

    try:
        result = await get_his_export_adapter().send(payload)
    except Exception as e:
        result = DeliveryResult(success=False, error_message=f"Adapter raised: {e}")

    db = SessionLocal()
    try:
        his_export_crud.record_attempt_result(db, log_id=row_id, result=result)
    finally:
        db.close()

    logger.info(
        "HIS export attempt: %s #%s (accession %s) -> %s",
        resource_type, resource_id, accession_no,
        "sent" if result.success else "retry/dead_letter",
    )


async def _poll_once() -> None:
    db = SessionLocal()
    try:
        rows = his_export_crud.claim_batch(
            db,
            batch_size=his_export_config.HIS_EXPORT_BATCH_SIZE,
            stale_after_seconds=his_export_config.HIS_EXPORT_STALE_PROCESSING_SECONDS,
        )
        # Extract plain values before closing the session — ORM objects would
        # be detached (and their lazy-loaded attributes unusable) afterward.
        claimed = [
            (r.id, r.resource_type, r.resource_id, r.accession_no, r.payload_snapshot)
            for r in rows
        ]
    finally:
        db.close()

    for row_id, resource_type, resource_id, accession_no, payload_snapshot in claimed:
        try:
            await _process_one(row_id, resource_type, resource_id, accession_no, payload_snapshot)
        except Exception:
            # One row's unexpected failure must never take down the rest of
            # the batch or the loop itself.
            logger.exception("HIS export: unexpected error processing log #%s", row_id)


async def run_forever() -> None:
    logger.info(
        "HIS export worker started (adapter=%s, poll every %ss)",
        his_export_config.HIS_EXPORT_TYPE,
        his_export_config.HIS_EXPORT_POLL_INTERVAL_SECONDS,
    )
    try:
        while True:
            await asyncio.sleep(his_export_config.HIS_EXPORT_POLL_INTERVAL_SECONDS)
            try:
                await _poll_once()
            except Exception:
                logger.exception("HIS export worker: poll cycle failed")
    except asyncio.CancelledError:
        logger.info("HIS export worker stopped")
        raise


@asynccontextmanager
async def export_worker_lifespan(app):
    task = asyncio.create_task(run_forever())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
