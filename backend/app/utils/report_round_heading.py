"""The heading each diagnosis round gets in a report:

    DIAGNOSIS REPORT (Dated: 29/10/2026 17:40)
    ADDENDUM REPORT (Dated: 05/11/2026 11:42)

Surgical and non-gyne both build it here so the two read the same. They had
drifted: non-gyne printed "REPORT #2 — Addendum (05/11/2026)", with no time
and no revision reason."""

from datetime import datetime
from html import escape
from typing import Iterable, Optional

# Marks the heading inside the stored diagnosis HTML. A non-gyne report
# published before these headings existed has no per-round date, so the
# non-gyne template keeps its DIAGNOSIS section-header date only when this
# class is absent.
ROUND_HEADING_CLASS = "report-round-heading"

# A round holding several entry types takes the first of these it contains.
_LABELLED_TYPES = ("Revised", "Corrected", "Addendum")
_TYPES_WITH_REASON = ("Revised", "Corrected")


def round_label(entry_types: Iterable[Optional[str]]) -> str:
    """DIAGNOSIS, or REVISED / CORRECTED / ADDENDUM when the round holds one."""
    present = set(entry_types)
    return next((t.upper() for t in _LABELLED_TYPES if t in present), "DIAGNOSIS")


def round_heading_html(
    entry_types: Iterable[Optional[str]],
    dated_at: datetime,
    revision_type: Optional[str] = None,
    revision_reason: Optional[str] = None,
) -> str:
    label = round_label(entry_types)
    # The reason is typed into a plain-text field, and this HTML is rendered
    # unescaped (| safe), so a reason like "<5% cellularity" would break it.
    reason = (
        f" ({escape(revision_type)} Reason: {escape(revision_reason)})"
        if revision_type in _TYPES_WITH_REASON and revision_reason
        else ""
    )
    return (
        f"<div class='{ROUND_HEADING_CLASS}' style='margin-top: 12px; margin-bottom: 6px;'>"
        f"<b style='font-size: 13px;'>{label} REPORT</b> "
        f"<small style='color: #666;'>(Dated: {dated_at.strftime('%d/%m/%Y %H:%M')})</small>"
        f"{reason}</div>"
    )
