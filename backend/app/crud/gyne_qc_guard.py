"""Server-side guard around the gyne QC review state (``pending_review``).

A case in pending_review is waiting for a pathologist's verdict on someone
else's screening. The only sanctioned way out is
``gyne_cyto_report.complete_gyne_review`` (agree → published, disagree →
screened). Every other write path that could move the case — re-publishing,
revising, approving/rejecting the report, PATCHing the status, cancelling —
calls ``assert_not_awaiting_qc`` first.

Refusals are written to ``audit_logs`` before the HTTPException goes out, the
same way LOGIN_FAILED / MFA_FAILED are, so an attempt to get around the review
leaves a record even though nothing about the case changed.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.context import current_ip, current_user_id
from app.enums.case_states import GYNE_REVIEW
from app.models.audit_log import AuditLog

QC_REVIEW_DENIED = "QC_REVIEW_DENIED"
QC_BYPASS_BLOCKED = "QC_BYPASS_BLOCKED"


def deny(
    db: Session,
    *,
    status_code: int,
    detail: str,
    action: str,
    case_id: int | None,
    user_id: int | None = None,
    **context,
) -> None:
    """Record the refused attempt, then raise. Must be called before the
    caller has mutated anything — the audit row is committed on its own."""
    db.rollback()
    db.add(AuditLog(
        user_id=user_id if user_id is not None else current_user_id.get(),
        action=action,
        resource_type="GyneCytologyCase",
        resource_id=case_id,
        new_values={"detail": detail, **context},
        ip_address=current_ip.get(),
    ))
    db.commit()
    raise HTTPException(status_code=status_code, detail=detail)


def assert_not_awaiting_qc(
    db: Session, case, attempted: str, user_id: int | None = None
) -> None:
    """409 when ``case`` is in pending_review — only complete-review may move it."""
    if case is None or case.status not in GYNE_REVIEW:
        return
    deny(
        db,
        status_code=409,
        detail=(
            f"Case {case.accession_no or case.id} is awaiting pathologist QC review. "
            "It can only leave that state through the QC review (Agree / Disagree)."
        ),
        action=QC_BYPASS_BLOCKED,
        case_id=case.id,
        user_id=user_id,
        attempted=attempted,
    )
