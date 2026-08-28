"""QC ledger: cytotechnologist screening vs pathologist final diagnosis.

The screening side is frozen when the cytotech hands a case over, the final
side at sign-out. For gyne the verdict is derived from the existing
`review_result`/`discrepancy_level` QC review; for non-gyne (free-text
diagnosis, no coded category) a QC officer sets it in the worklist and the
only thing computed automatically is whether the wording changed at all.
"""

import logging
import re
from datetime import datetime, time

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.cyto_path_correlation import CytoPathCorrelation
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_diagnosis import GyneDiagnosis
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.user import User
from app.utils.time import local_now

logger = logging.getLogger(__name__)

# Statuses that carry no comparable screening/final pair — they must never
# reach a rate's denominator. Same principle as `_has_gyne_result` in
# crud/cyto_histo_correlation.py: missing data is excluded, never guessed.
UNCOUNTABLE_STATUSES = ("awaiting_signout", "no_screening_data")

RESULTS = ("concordant", "minor_discrepancy", "major_discrepancy", "not_applicable")


def _strip_html(html: str | None) -> str:
    """Rich-text HTML → plain text. Mirrors `_is_blank_richtext` in crud/nongyne_cyto_report.py."""
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", " ", html)
    text = re.sub(r"</(p|div|li|h[1-6])>", " ", text)
    text = re.sub(r"<[^>]*>", "", text)
    return re.sub(r"\s+", " ", text.replace("&nbsp;", " ")).strip()


def _normalize(html: str | None) -> str:
    """Comparison key for the auto hint — case- and whitespace-insensitive plain text."""
    return _strip_html(html).lower()


def _nongyne_text(diagnosis: NongyneDiagnosis | None) -> str | None:
    return diagnosis.diagnosis if diagnosis else None


def _gyne_text(diagnosis: GyneDiagnosis | None) -> str | None:
    """Bethesda code + text is the gyne diagnosis; fall back to the free-text interpretation.

    Same rendering as `get_surgical_context` in crud/cyto_histo_correlation.py.
    """
    if not diagnosis:
        return None
    parts = [
        f"{c.code} — {c.text}"
        for c in (diagnosis.category_1_obj, diagnosis.category_2_obj)
        if c
    ]
    return " / ".join(parts) if parts else diagnosis.interpretation


def _nongyne_flags(case: NongyneCytologyCase) -> dict:
    return {
        "has_malignancy": case.has_malignancy,
        "has_critical": case.has_critical,
        "is_satisfied_specimen": case.is_satisfied_specimen,
        "specimen_type": case.specimen_type,
    }


def _gyne_flags(case: GyneCytologyCase, diagnosis: GyneDiagnosis | None) -> dict:
    return {
        "has_malignancy": case.has_malignancy,
        "is_satisfied_specimen": case.is_satisfied_specimen,
        "bethesda_category": case.bethesda_category,
        "specimen_type": case.specimen_type,
        "category_1_code": (
            diagnosis.category_1_obj.code if diagnosis and diagnosis.category_1_obj else None
        ),
        "category_2_code": (
            diagnosis.category_2_obj.code if diagnosis and diagnosis.category_2_obj else None
        ),
    }


def _current_diagnosis(db: Session, case_type: str, case_id: int):
    if case_type == "gyne":
        return (
            db.query(GyneDiagnosis)
            .options(
                joinedload(GyneDiagnosis.category_1_obj),
                joinedload(GyneDiagnosis.category_2_obj),
            )
            .filter(GyneDiagnosis.case_id == case_id, GyneDiagnosis.is_current.is_(True))
            .first()
        )
    return (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id == case_id, NongyneDiagnosis.is_current.is_(True))
        .first()
    )


def _diagnosis_text(case_type: str, diagnosis) -> str | None:
    return _gyne_text(diagnosis) if case_type == "gyne" else _nongyne_text(diagnosis)


def _flags(case_type: str, case, diagnosis) -> dict:
    return _gyne_flags(case, diagnosis) if case_type == "gyne" else _nongyne_flags(case)


def get_row(db: Session, case_type: str, case_id: int) -> CytoPathCorrelation | None:
    q = db.query(CytoPathCorrelation).filter(CytoPathCorrelation.case_type == case_type)
    if case_type == "gyne":
        q = q.filter(CytoPathCorrelation.gyne_case_id == case_id)
    else:
        q = q.filter(CytoPathCorrelation.nongyne_case_id == case_id)
    return q.first()


# ─────────────────────────── capture hooks ────────────────────────────
# Every caller wraps these in try/except: a QC bookkeeping failure must never
# block a hand-off or a sign-out.


def capture_screening(db: Session, *, case_type: str, case, cytotech_id: int | None = None):
    """Freeze what the cytotechnologist read, at the moment they hand the case on.

    Re-entrant: a case sent back for correction passes through here again. Once
    the case has been graded, though, the snapshot is evidence — the screening
    call that was judged, not the corrected one that replaced it — so it is
    left alone.
    """
    diagnosis = _current_diagnosis(db, case_type, case.id)
    text = _diagnosis_text(case_type, diagnosis)

    row = get_row(db, case_type, case.id)
    if row is not None and (row.reviewed_at is not None or row.result is not None):
        return row
    if row is None:
        row = CytoPathCorrelation(
            case_type=case_type,
            gyne_case_id=case.id if case_type == "gyne" else None,
            nongyne_case_id=case.id if case_type == "nongyne" else None,
        )
        db.add(row)

    row.accession_no = case.accession_no
    row.cytotechnologist_id = cytotech_id or case.cytotechnologist_id
    row.screening_diagnosis = text
    row.screening_summary = _strip_html(text)
    row.screening_flags = _flags(case_type, case, diagnosis)
    row.screened_at = local_now()
    if row.signed_out_at is None:
        row.status = "awaiting_signout"
    db.flush()
    return row


def capture_final(
    db: Session,
    *,
    case_type: str,
    case,
    pathologist_id: int | None = None,
    only_if_tracked: bool = False,
):
    """Freeze the signed-out diagnosis and compute the wording hint.

    `only_if_tracked` skips cases that never had a screening side captured.
    Gyne needs it: most gyne cases publish without ever entering QC review, and
    opening a ledger row for each one would bury the ones that mean something.
    """
    diagnosis = _current_diagnosis(db, case_type, case.id)
    text = _diagnosis_text(case_type, diagnosis)

    row = get_row(db, case_type, case.id)
    if row is None and only_if_tracked:
        return None
    if row is None:
        # No screening was captured — a pathologist wrote this one start to
        # finish, or the case predates the feature. Record it, but park it in a
        # status that every rate excludes.
        row = CytoPathCorrelation(
            case_type=case_type,
            gyne_case_id=case.id if case_type == "gyne" else None,
            nongyne_case_id=case.id if case_type == "nongyne" else None,
            status="no_screening_data",
        )
        db.add(row)
    elif row.signed_out_at is not None:
        # Re-sign / addendum: only reopen for review when the wording moved.
        if _normalize(row.final_diagnosis) != _normalize(text):
            row.version_no = (row.version_no or 1) + 1
            if row.status == "reviewed":
                row.status = "pending_review"

    row.accession_no = case.accession_no
    row.pathologist_id = pathologist_id or case.pathologist_id
    row.final_diagnosis = text
    row.final_summary = _strip_html(text)
    row.final_flags = _flags(case_type, case, diagnosis)
    row.signed_out_at = local_now()

    if row.screening_diagnosis is not None:
        row.auto_result = (
            "identical"
            if _normalize(row.screening_diagnosis) == _normalize(text)
            else "changed"
        )
        if row.status == "awaiting_signout":
            row.status = "pending_review"
    db.flush()
    return row


def apply_gyne_review(
    db: Session,
    *,
    case: GyneCytologyCase,
    reviewer_id: int,
    review_result: str,
    discrepancy_level: str | None,
    review_note: str | None = None,
):
    """Map gyne's existing agree/disagree QC verdict onto the ledger.

    Gyne already asks the pathologist for exactly this judgement, so the
    verdict comes for free — no second click in the QC worklist.
    """
    row = get_row(db, "gyne", case.id)
    if row is None or row.status == "no_screening_data":
        return None

    if review_result == "agree":
        row.result = "concordant"
    elif discrepancy_level == "major":
        row.result = "major_discrepancy"
    elif discrepancy_level == "minor":
        row.result = "minor_discrepancy"
    else:
        # disagree without a level recorded — leave it for a human to grade
        row.result = None
        row.status = "pending_review"
        db.flush()
        return row

    row.status = "reviewed"
    row.reviewed_by_id = reviewer_id
    row.reviewed_at = local_now()
    if review_note and not row.comment:
        row.comment = review_note
    db.flush()
    return row


# ───────────────────────────── read side ──────────────────────────────


def _serialize(row: CytoPathCorrelation) -> dict:
    return {
        "id": row.id,
        "case_type": row.case_type,
        "gyne_case_id": row.gyne_case_id,
        "nongyne_case_id": row.nongyne_case_id,
        "case_id": row.gyne_case_id if row.case_type == "gyne" else row.nongyne_case_id,
        "accession_no": row.accession_no,
        "cytotechnologist": (
            {"id": row.cytotechnologist.id, "full_name": row.cytotechnologist.full_name}
            if row.cytotechnologist
            else None
        ),
        "screening_diagnosis": row.screening_diagnosis,
        "screening_summary": row.screening_summary,
        "screening_flags": row.screening_flags,
        "screened_at": row.screened_at,
        "pathologist": (
            {"id": row.pathologist.id, "full_name": row.pathologist.full_name}
            if row.pathologist
            else None
        ),
        "final_diagnosis": row.final_diagnosis,
        "final_summary": row.final_summary,
        "final_flags": row.final_flags,
        "signed_out_at": row.signed_out_at,
        "version_no": row.version_no,
        "auto_result": row.auto_result,
        "result": row.result,
        "status": row.status,
        "discrepancy_category": row.discrepancy_category,
        "comment": row.comment,
        "reviewed_by": (
            {"id": row.reviewed_by.id, "full_name": row.reviewed_by.full_name}
            if row.reviewed_by
            else None
        ),
        "reviewed_at": row.reviewed_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _base_query(
    db: Session,
    *,
    case_type=None,
    status=None,
    result=None,
    cytotechnologist_id=None,
    pathologist_id=None,
    start_date=None,
    end_date=None,
    search=None,
    countable_only=False,
):
    q = db.query(CytoPathCorrelation).options(
        joinedload(CytoPathCorrelation.cytotechnologist),
        joinedload(CytoPathCorrelation.pathologist),
        joinedload(CytoPathCorrelation.reviewed_by),
    )
    if case_type:
        q = q.filter(CytoPathCorrelation.case_type == case_type)
    if status:
        q = q.filter(CytoPathCorrelation.status == status)
    if result:
        q = q.filter(CytoPathCorrelation.result == result)
    if cytotechnologist_id:
        q = q.filter(CytoPathCorrelation.cytotechnologist_id == cytotechnologist_id)
    if pathologist_id:
        q = q.filter(CytoPathCorrelation.pathologist_id == pathologist_id)
    if start_date:
        q = q.filter(CytoPathCorrelation.signed_out_at >= start_date)
    if end_date:
        q = q.filter(
            CytoPathCorrelation.signed_out_at <= datetime.combine(end_date, time.max)
        )
    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                CytoPathCorrelation.accession_no.ilike(like),
                CytoPathCorrelation.screening_summary.ilike(like),
                CytoPathCorrelation.final_summary.ilike(like),
            )
        )
    if countable_only:
        q = q.filter(CytoPathCorrelation.status.notin_(UNCOUNTABLE_STATUSES))
    return q


def scope_to_user(current_user: User, cytotechnologist_id):
    """A plain cytotechnologist only ever sees their own QC rows."""
    roles = current_user.roles or []
    privileged = {"admin", "pathologist", "senior_pathologist", "lab_manager"}
    if "cytotechnologist" in roles and not privileged.intersection(roles):
        return current_user.id
    return cytotechnologist_id


def list_correlations(db: Session, *, skip: int = 0, limit: int = 20, **filters):
    q = _base_query(db, **filters)
    total = q.count()
    rows = (
        q.order_by(CytoPathCorrelation.signed_out_at.desc().nulls_last())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_serialize(r) for r in rows], "total": total}


def _empty_bucket() -> dict:
    return {
        "total": 0,
        "concordant": 0,
        "minor_discrepancy": 0,
        "major_discrepancy": 0,
        "not_applicable": 0,
        "pending": 0,
    }


def _finalize_bucket(b: dict) -> dict:
    """Rates are over *graded* rows only — a pending row is not a concordant one."""
    graded = b["concordant"] + b["minor_discrepancy"] + b["major_discrepancy"]
    b["graded"] = graded
    b["concordance_rate"] = round(b["concordant"] / graded * 100, 1) if graded else None
    b["major_rate"] = round(b["major_discrepancy"] / graded * 100, 1) if graded else None
    b["discrepancy_rate"] = (
        round((b["minor_discrepancy"] + b["major_discrepancy"]) / graded * 100, 1)
        if graded
        else None
    )
    return b


def _tally(bucket: dict, row: CytoPathCorrelation) -> None:
    bucket["total"] += 1
    if row.status != "reviewed" or row.result is None:
        bucket["pending"] += 1
    elif row.result in bucket:
        bucket[row.result] += 1


def get_summary(db: Session, **filters) -> dict:
    """Overall + per-cytotechnologist + monthly trend.

    Built the way every other summary in this codebase is: one query, then
    bucket in Python (see `get_correlation_summary`, `get_gyne_qc_statistics`).
    """
    rows = _base_query(db, countable_only=True, **filters).all()

    overall = _empty_bucket()
    by_user: dict[int | None, dict] = {}
    monthly: dict[str, dict] = {}

    for row in rows:
        _tally(overall, row)

        uid = row.cytotechnologist_id
        if uid not in by_user:
            by_user[uid] = {
                "user_id": uid,
                "full_name": (
                    row.cytotechnologist.full_name if row.cytotechnologist else "ไม่ระบุ"
                ),
                **_empty_bucket(),
            }
        _tally(by_user[uid], row)

        if row.signed_out_at:
            key = row.signed_out_at.strftime("%Y-%m")
            if key not in monthly:
                monthly[key] = {"month": key, **_empty_bucket()}
            _tally(monthly[key], row)

    return {
        "overall": _finalize_bucket(overall),
        "by_cytotechnologist": sorted(
            (_finalize_bucket(b) for b in by_user.values()),
            key=lambda b: b["total"],
            reverse=True,
        ),
        "monthly": [_finalize_bucket(monthly[k]) for k in sorted(monthly)],
    }


def get_by_case(db: Session, case_type: str, case_id: int) -> dict | None:
    row = get_row(db, case_type, case_id)
    return _serialize(row) if row else None


def set_verdict(db: Session, correlation_id: int, payload, reviewer_id: int) -> dict | None:
    row = (
        db.query(CytoPathCorrelation)
        .filter(CytoPathCorrelation.id == correlation_id)
        .first()
    )
    if not row:
        return None
    data = payload.model_dump(exclude_unset=True)
    for field in ("result", "discrepancy_category", "comment"):
        if field in data:
            setattr(row, field, data[field])
    row.status = "reviewed" if row.result else "pending_review"
    row.reviewed_by_id = reviewer_id
    row.reviewed_at = local_now()
    db.commit()
    db.refresh(row)
    return _serialize(row)


# ─────────────────── safe wrappers used by the hooks ───────────────────
# The ledger is bookkeeping: it must never be the reason a hand-off or a
# sign-out fails. A SAVEPOINT keeps a failure here from poisoning the
# caller's session, so the surrounding commit still goes through.


def _safe(fn, db: Session, what: str, **kwargs):
    try:
        with db.begin_nested():
            return fn(db, **kwargs)
    except Exception:
        logger.exception("cyto-path QC: %s failed, continuing without it", what)
        return None


def safe_capture_screening(db: Session, *, case_type: str, case, cytotech_id: int | None = None):
    return _safe(
        capture_screening, db, "capture_screening",
        case_type=case_type, case=case, cytotech_id=cytotech_id,
    )


def safe_capture_final(
    db: Session,
    *,
    case_type: str,
    case,
    pathologist_id: int | None = None,
    only_if_tracked: bool = False,
):
    return _safe(
        capture_final, db, "capture_final",
        case_type=case_type, case=case, pathologist_id=pathologist_id,
        only_if_tracked=only_if_tracked,
    )


def safe_apply_gyne_review(db: Session, **kwargs):
    return _safe(apply_gyne_review, db, "apply_gyne_review", **kwargs)
