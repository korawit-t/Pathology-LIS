from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_event import SurgicalBlockEvent
from app.models.tissue_processing import TissueProcessingItem, TissueProcessingRun
from app.models.embedding import EmbeddingDetail, EmbeddingRun
from app.models.sectioning import SectioningDetail, SectioningRun
from app.models.surgical_block_stain import SurgicalBlockStain, SurgicalStainRun, SurgicalStainRunDetail
from app.models.block_storage import BlockStorageDetail, BlockStorageRun
from app.schemas.surgical_block_event import BlockEventCreate, BlockTimelineEntry


def create_event(
    db: Session,
    block_id: int,
    obj_in: BlockEventCreate,
    performed_by_id: int,
) -> SurgicalBlockEvent:
    event_at = obj_in.event_at or datetime.now(timezone.utc)
    db_event = SurgicalBlockEvent(
        block_id=block_id,
        event_type=obj_in.event_type,
        location=obj_in.location,
        note=obj_in.note,
        performed_by_id=performed_by_id,
        event_at=event_at,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


def delete_event(db: Session, event_id: int) -> None:
    ev = db.query(SurgicalBlockEvent).filter(SurgicalBlockEvent.id == event_id).first()
    if ev:
        db.delete(ev)
        db.commit()


def get_timeline(db: Session, block_id: int) -> list[BlockTimelineEntry]:
    entries: list[BlockTimelineEntry] = []

    # ── 1. Grossed (block creation) ──────────────────────────────────────────
    block = db.query(SurgicalBlock).filter(SurgicalBlock.id == block_id).first()
    if block:
        entries.append(BlockTimelineEntry(
            event_type="GROSSED",
            source="auto",
            label="Block grossed",
            event_at=block.created_at,
        ))

    # ── 2. Tissue Processing IN ───────────────────────────────────────────────
    proc_item = (
        db.query(TissueProcessingItem)
        .filter(TissueProcessingItem.block_id == block_id)
        .first()
    )
    if proc_item:
        run = db.query(TissueProcessingRun).filter(TissueProcessingRun.id == proc_item.run_id).first()
        if run:
            performer = run.creator
            entries.append(BlockTimelineEntry(
                event_type="PROCESSING_IN",
                source="auto",
                label=f"Tissue processing IN — {run.processor_name}",
                note=run.remark,
                performed_by_name=performer.full_name if performer else None,
                event_at=run.start_at,
            ))

            # ── 3. Tissue Processing OUT ──────────────────────────────────────
            out_at = proc_item.processed_out_at or run.completed_at
            if out_at:
                completer = run.completer
                entries.append(BlockTimelineEntry(
                    event_type="PROCESSING_OUT",
                    source="auto",
                    label=f"Tissue processing OUT — {proc_item.status}",
                    note=proc_item.out_remark,
                    performed_by_name=completer.full_name if completer else None,
                    event_at=out_at,
                ))

    # ── 4. Embedding ──────────────────────────────────────────────────────────
    emb_detail = (
        db.query(EmbeddingDetail)
        .filter(EmbeddingDetail.block_id == block_id)
        .order_by(EmbeddingDetail.embedded_at.desc())
        .first()
    )
    if emb_detail:
        emb_run = db.query(EmbeddingRun).filter(EmbeddingRun.id == emb_detail.run_id).first()
        performer_name = None
        if emb_run:
            from app.models.user import User
            user = db.query(User).filter(User.id == emb_run.user_id).first()
            performer_name = user.full_name if user else None
        entries.append(BlockTimelineEntry(
            event_type="EMBEDDED",
            source="auto",
            label="Embedding completed",
            note=emb_detail.remark,
            performed_by_name=performer_name,
            event_at=emb_detail.embedded_at,
        ))

    # ── 5. Sectioning ─────────────────────────────────────────────────────────
    sec_detail = (
        db.query(SectioningDetail)
        .filter(SectioningDetail.block_id == block_id)
        .order_by(SectioningDetail.sectioned_at.desc())
        .first()
    )
    if sec_detail:
        sec_run = db.query(SectioningRun).filter(SectioningRun.id == sec_detail.run_id).first()
        performer_name = None
        if sec_run:
            from app.models.user import User
            user = db.query(User).filter(User.id == sec_run.user_id).first()
            performer_name = user.full_name if user else None
        label = "Sectioning completed"
        if sec_detail.is_recut:
            label = "Recut / sectioning repeated"
        entries.append(BlockTimelineEntry(
            event_type="SECTIONED",
            source="auto",
            label=label,
            note=sec_detail.remark,
            performed_by_name=performer_name,
            event_at=sec_detail.sectioned_at,
        ))

    # ── 6. Staining ───────────────────────────────────────────────────────────
    stain_orders = (
        db.query(SurgicalBlockStain)
        .filter(SurgicalBlockStain.block_id == block_id)
        .all()
    )
    for stain in stain_orders:
        for run_detail in stain.run_details:
            stain_run = db.query(SurgicalStainRun).filter(
                SurgicalStainRun.id == run_detail.stain_run_id
            ).first()
            if stain_run and stain_run.completed_at:
                stain_type = stain.test.name if stain.test else "H&E"
                operator = stain_run.operator
                entries.append(BlockTimelineEntry(
                    event_type="STAINED",
                    source="auto",
                    label=f"Staining completed — {stain_type}",
                    performed_by_name=operator.full_name if operator else None,
                    event_at=stain_run.completed_at,
                ))

    # ── 7. Block Storage ──────────────────────────────────────────────────────
    storage_details = (
        db.query(BlockStorageDetail)
        .filter(BlockStorageDetail.block_id == block_id)
        .all()
    )
    for sd in storage_details:
        run = db.query(BlockStorageRun).filter(BlockStorageRun.id == sd.run_id).first()
        performer_name = None
        if run:
            from app.models.user import User
            user = db.query(User).filter(User.id == run.user_id).first()
            performer_name = user.full_name if user else None
        entries.append(BlockTimelineEntry(
            event_type="STORED",
            source="auto",
            label="Block stored",
            location=sd.storage_location,
            note=sd.remark,
            performed_by_name=performer_name,
            event_at=sd.stored_at,
        ))

    # ── 8. Manual events ─────────────────────────────────────────────────────
    manual_events = (
        db.query(SurgicalBlockEvent)
        .filter(SurgicalBlockEvent.block_id == block_id)
        .all()
    )
    MANUAL_LABELS = {
        "SENT_TO_OUTLAB": "Sent to outlab",
        "RETURNED_FROM_OUTLAB": "Returned from outlab",
        "NOTE": "Note",
    }
    for ev in manual_events:
        performer = ev.performed_by
        entries.append(BlockTimelineEntry(
            event_type=ev.event_type,
            source="manual",
            label=MANUAL_LABELS.get(ev.event_type, ev.event_type),
            location=ev.location,
            note=ev.note,
            performed_by_name=performer.full_name if performer else None,
            event_at=ev.event_at,
            event_id=ev.id,
        ))

    entries.sort(key=lambda e: e.event_at)
    return entries
