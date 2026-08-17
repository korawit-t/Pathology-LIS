"""Step gating for the histology block pipeline.

Grossing → Tissue Processing → Embedding → Sectioning → H&E staining. Each stage
may only offer blocks that finished the stage before it: a block can't be embedded
before it came out of the processor, sectioned before it was embedded, or stained
before it was cut.

When system_settings.enable_tissue_processing_workflow is off the lab doesn't run
the three middle stages at all (their menus are hidden and a block is stainable
straight after grossing), so every gate here becomes a no-op.
"""

from fastapi import HTTPException
from sqlalchemy import true
from sqlalchemy.orm import Session, joinedload

from app.models.surgical_block import SurgicalBlock
from app.models.system_setting import SystemSetting

# Pipeline order. A status outside this tuple ("consult", ...) is not a pipeline
# stage and is never treated as "too early" — an out-lab consult rewrites every
# block of the case to "consult", and those blocks must still be stainable when
# the slides come back.
STAGE_ORDER = (
    "grossed",
    "processing",
    "processed",
    "embedded",
    "sectioned",
    "stained",
)

# The stage a block must have reached before it may enter each step.
_ENTRY_STAGE = {
    "embedding": "processed",
    "sectioning": "embedded",
    "staining": "sectioned",
}

# (step name, prerequisite name) for the error message shown to the lab staff.
_STEP_LABELS = {
    "embedding": ("Embedding", "Tissue Processing"),
    "sectioning": ("Sectioning", "Embedding"),
    "staining": ("H&E Staining", "Sectioning"),
}


def is_stepped_workflow_enabled(db: Session) -> bool:
    settings = db.query(SystemSetting).first()
    if settings is None:
        return True
    return bool(settings.enable_tissue_processing_workflow)


def _statuses_before(stage: str) -> list[str]:
    return list(STAGE_ORDER[: STAGE_ORDER.index(stage)])


def stage_filter(db: Session, step: str):
    """Filter criterion keeping only blocks that already cleared `step`'s
    prerequisite stage. Always-true when the stepped workflow is disabled."""
    if not is_stepped_workflow_enabled(db):
        return true()
    return SurgicalBlock.status.notin_(_statuses_before(_ENTRY_STAGE[step]))


def assert_blocks_ready(db: Session, step: str, block_ids) -> None:
    """Raise 400 if any block hasn't cleared `step`'s prerequisite stage.

    The same gate the pending lists apply, enforced on the write path so a
    barcode scan against a stale list — or a direct API call — can't skip a
    stage the lab has turned on.
    """
    block_ids = list(block_ids or [])
    if not block_ids or not is_stepped_workflow_enabled(db):
        return

    too_early = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen))
        .filter(
            SurgicalBlock.id.in_(block_ids),
            SurgicalBlock.status.in_(_statuses_before(_ENTRY_STAGE[step])),
        )
        .all()
    )
    if not too_early:
        return

    step_label, prerequisite_label = _STEP_LABELS[step]
    codes = ", ".join(sorted(b.block_code for b in too_early))
    raise HTTPException(
        status_code=400,
        detail=f"ตลับต่อไปนี้ยังไม่ผ่านขั้นตอน {prerequisite_label} "
        f"จึงยังเข้า {step_label} ไม่ได้: {codes}",
    )
