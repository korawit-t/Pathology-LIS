"""The "result is out" stamps shared by surgical and non-gyne stains.

Both stain tables carry the same three columns:

* ready_at — the slide became readable (track_ready);
* reported_at — the pathologist's sign-off that carried its result
  (mark_reported), not the IHC panel: some pathologists type IHC results
  into the diagnosis text;
* released_at — that report was published, on signing with the approve
  system off or on approval (mark_released); a rejected sign-off is undone
  with unmark_unreleased.

The per-case-type modules (crud.surgical_block_stain, crud.nongyne_cyto_stain)
decide which of a case's stains count — the query passed in here — and these
functions apply the rule. None of them commit.
"""

from sqlalchemy.orm import Query, Session

from app.utils.time import local_now

READY_STATUSES = ("stained", "completed")


def track_ready(stain, at=None) -> None:
    """Keep ready_at in step with status after it changes: stamped when the
    slide becomes readable (unless it already was), cleared when it goes back
    to pending/sent. Bulk status updates set the column in the same UPDATE
    instead."""
    if stain.status in READY_STATUSES:
        if stain.ready_at is None:
            stain.ready_at = at or local_now()
    else:
        stain.ready_at = None


def _update(db: Session, model, ids_query: Query, values: dict) -> int:
    stain_ids = [row[0] for row in ids_query.all()]
    if stain_ids:
        db.query(model).filter(model.id.in_(stain_ids)).update(values, synchronize_session=False)
    return len(stain_ids)


def mark_reported(db: Session, model, case_stains: Query, at, include_unreviewed: bool) -> int:
    """Stamp reported_at on the case's stains that went out with the report
    being signed now.

    * include_unreviewed=True (signed as complete) — every slide ready to read
      counts: "stained" or "completed". Ready slides move to "completed".
    * include_unreviewed=False (signed "No, Pending") — only slides already
      "completed" (panel result / Mark Reviewed) count.

    Slides still pending/sent are left for the Addendum that carries them; a
    slide already reported keeps its first time. `case_stains` selects the
    case's countable stains' ids."""
    statuses = list(READY_STATUSES) if include_unreviewed else ["completed"]
    return _update(
        db, model,
        case_stains.filter(model.reported_at.is_(None), model.status.in_(statuses)),
        {"status": "completed", "reported_at": at},
    )


def mark_released(db: Session, model, case_stains: Query, at) -> int:
    """The signed report was published: every stain it carried (reported, not
    yet released) reaches the clinician now."""
    return _update(
        db, model,
        case_stains.filter(model.reported_at.isnot(None), model.released_at.is_(None)),
        {"released_at": at},
    )


def unmark_unreleased(db: Session, model, case_stains: Query) -> int:
    """The approver sent the report back: stains it carried but not yet
    released lose reported_at and wait for the next sign-off. Status stays —
    a slide moved to "completed" still counts as reviewed."""
    return _update(
        db, model,
        case_stains.filter(model.reported_at.isnot(None), model.released_at.is_(None)),
        {"reported_at": None},
    )
