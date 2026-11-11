"""IHC turnaround — how long a surgical case's IHC takes from order to the
pathologist's sign-off that carries its result.

"Out" is surgical_block_stains.reported_at, stamped at sign-off by
crud.surgical_block_stain.mark_case_stains_reported (not the IHC panel —
some pathologists type IHC results into the diagnosis text).

The unit is an *IHC request*: the IHC slides of one case that went out at the
same sign-off (same reported_at). Counting slides instead would let one
11-marker lymphoma panel outweigh ten single-marker cases.

Days are working days (weekends and configured holidays excluded), the same
measure as the surgical TAT dashboard (crud.surgical_case.get_tat_stats).
"""

from collections import defaultdict
from datetime import date, datetime, time
from statistics import median

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.crud.surgical_case import _tat_bucket
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.patient import Patient
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalOutlabRun,
    SurgicalOutlabRunDetail,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.system_setting import SystemSetting
from app.utils.time import local_now
from app.utils.tat import business_days_between, get_holiday_dates

# Matches the column default on system_settings.ihc_tat_days.
DEFAULT_IHC_TAT_DAYS = 10

# Outstanding stages, least advanced first. A case's stage is its least
# advanced slide: one marker still at the outlab holds the whole request.
_STAGE_ORDER = ("pending", "sent", "stained", "completed")


def _ihc_stains(db: Session, *filters):
    """(stain, case_id, test_name, is_external) for IHC slides on cases that
    weren't cancelled. Recuts are re-cut sections, not new IHC orders."""
    return (
        db.query(
            SurgicalBlockStain,
            SurgicalCase.id,
            AnatomicalPathologyTest.name,
            AnatomicalPathologyTest.is_external,
        )
        .join(SurgicalBlock, SurgicalBlock.id == SurgicalBlockStain.block_id)
        .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalBlock.specimen_id)
        .join(SurgicalCase, SurgicalCase.id == SurgicalSpecimen.case_id)
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == SurgicalBlockStain.test_id)
        .filter(
            func.lower(AnatomicalPathologyTest.category) == "ihc",
            SurgicalBlockStain.is_recut.isnot(True),
            SurgicalCase.is_cancelled.isnot(True),
            *filters,
        )
        .all()
    )


def _latest_outlab(db: Session, stain_ids: list[int]) -> dict[int, dict]:
    """Per stain, its most recent outlab round (a redo is sent again): when it
    went, when it came back, and where to."""
    if not stain_ids:
        return {}
    rows = (
        db.query(
            SurgicalOutlabRunDetail.stain_id,
            SurgicalOutlabRun.sent_at,
            SurgicalOutlabRunDetail.received_at,
            SurgicalOutlabRun.destination_lab,
        )
        .join(SurgicalOutlabRun, SurgicalOutlabRun.id == SurgicalOutlabRunDetail.outlab_run_id)
        .filter(SurgicalOutlabRunDetail.stain_id.in_(stain_ids))
        .order_by(SurgicalOutlabRun.sent_at)
        .all()
    )
    latest: dict[int, dict] = {}
    for stain_id, sent_at, received_at, lab in rows:
        latest[stain_id] = {"sent_at": sent_at, "received_at": received_at, "lab": lab}
    return latest


def _inhouse_ready(db: Session, stain_ids: list[int]) -> dict[int, datetime]:
    """Per stain, when its in-house stain run was logged: completed, else
    started (staff often press Completed straight away, so the two match)."""
    if not stain_ids:
        return {}
    rows = (
        db.query(
            SurgicalStainRunDetail.stain_id,
            func.max(func.coalesce(SurgicalStainRun.completed_at, SurgicalStainRun.started_at)),
        )
        .join(SurgicalStainRun, SurgicalStainRun.id == SurgicalStainRunDetail.stain_run_id)
        .filter(SurgicalStainRunDetail.stain_id.in_(stain_ids))
        .group_by(SurgicalStainRunDetail.stain_id)
        .all()
    )
    return {stain_id: at for stain_id, at in rows if at is not None}


def _patients(db: Session, case_ids: set[int]) -> dict[int, dict]:
    if not case_ids:
        return {}
    cases = (
        db.query(SurgicalCase)
        .join(Patient, Patient.id == SurgicalCase.patient_id)
        .filter(SurgicalCase.id.in_(case_ids))
        .all()
    )
    return {
        c.id: {
            "accession_no": c.accession_no,
            "patient_title": c.patient.title.title if c.patient and c.patient.title else None,
            "patient_name": c.patient.name if c.patient else None,
            "patient_ln": c.patient.ln if c.patient else None,
        }
        for c in cases
    }


def _median(values: list[float]):
    return round(median(values), 1) if values else None


def _pct(part: int, whole: int):
    return round(part / whole * 100, 1) if whole else None


def get_ihc_target_days(db: Session) -> int:
    """Admin → Workflow → Turnaround Time: target working days from IHC order
    to the sign-off that carries the result. Read like the surgical target in
    crud.surgical_case.get_tat_stats (the first settings row)."""
    setting = db.query(SystemSetting).first()
    return (setting.ihc_tat_days if setting else None) or DEFAULT_IHC_TAT_DAYS


def _days(start, end, holidays) -> float | None:
    if start is None or end is None:
        return None
    return round(business_days_between(start, end, holidays), 1)


def get_ihc_tat(db: Session, start_date: date, end_date: date) -> dict:
    """IHC requests that went out (reported_at) between start_date and
    end_date, with their timeline and the summary the dashboard draws."""
    holidays = get_holiday_dates(db)
    rows = _ihc_stains(
        db,
        SurgicalBlockStain.reported_at >= datetime.combine(start_date, time.min),
        SurgicalBlockStain.reported_at <= datetime.combine(end_date, time.max),
    )
    stain_ids = [row[0].id for row in rows]
    outlab = _latest_outlab(db, stain_ids)
    inhouse = _inhouse_ready(db, stain_ids)

    grouped: dict[tuple[int, datetime], list] = defaultdict(list)
    for stain, case_id, test_name, _ in rows:
        grouped[(case_id, stain.reported_at)].append((stain, test_name))
    patients = _patients(db, {case_id for case_id, _ in grouped})

    requests = []
    for (case_id, reported_at), slides in grouped.items():
        sents, receiveds, readies, labs = [], [], [], []
        for stain, _ in slides:
            o = outlab.get(stain.id)
            if o:
                if o["sent_at"]:
                    sents.append(o["sent_at"])
                if o["received_at"]:
                    receiveds.append(o["received_at"])
                    readies.append(o["received_at"])
                if o["lab"]:
                    labs.append(o["lab"])
            elif stain.id in inhouse:
                readies.append(inhouse[stain.id])
        ordered_at = min((stain.created_at for stain, _ in slides if stain.created_at), default=reported_at)
        sent_at = min(sents) if sents else None
        received_at = max(receiveds) if receiveds else None
        # The request is readable once its last slide is.
        ready_at = max(readies) if readies else None
        total_days = _days(ordered_at, reported_at, holidays)
        requests.append({
            "case_id": case_id,
            **patients.get(case_id, {}),
            "markers": sorted({name for _, name in slides if name}),
            "slides": len(slides),
            "source": "outlab" if any(s.id in outlab for s, _ in slides) else "in-house",
            "lab": labs[0] if labs else None,
            "ordered_at": ordered_at,
            "sent_at": sent_at,
            "ready_at": ready_at,
            "reported_at": reported_at,
            "total_days": total_days,
            "outlab_days": _days(sent_at, received_at, holidays),
            "reading_days": _days(ready_at, reported_at, holidays),
            "bucket": _tat_bucket(total_days),
        })
    requests.sort(key=lambda r: r["reported_at"], reverse=True)

    target = get_ihc_target_days(db)
    distribution = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    monthly: dict[str, list[float]] = defaultdict(list)
    by_lab: dict[str, list[float]] = defaultdict(list)
    for r in requests:
        r["on_time"] = r["total_days"] <= target
        distribution[r["bucket"]] += 1
        monthly[r["reported_at"].strftime("%Y-%m")].append(r["total_days"])
        if r["outlab_days"] is not None:
            by_lab[r["lab"] or "—"].append(r["outlab_days"])
    on_time_count = sum(1 for r in requests if r["on_time"])

    return {
        "summary": {
            "requests": len(requests),
            "slides": sum(r["slides"] for r in requests),
            "outlab_requests": sum(1 for r in requests if r["source"] == "outlab"),
            "inhouse_requests": sum(1 for r in requests if r["source"] == "in-house"),
            "median_total_days": _median([r["total_days"] for r in requests]),
            "median_outlab_days": _median([r["outlab_days"] for r in requests if r["outlab_days"] is not None]),
            "median_reading_days": _median([r["reading_days"] for r in requests if r["reading_days"] is not None]),
            "target_days": target,
            "on_time_count": on_time_count,
            "on_time_pct": _pct(on_time_count, len(requests)),
        },
        "distribution": distribution,
        "monthly": [
            {
                "month": m,
                "requests": len(v),
                "median_total_days": _median(v),
                "on_time_pct": _pct(sum(1 for d in v if d <= target), len(v)),
            }
            for m, v in sorted(monthly.items())
        ],
        "by_lab": sorted(
            (
                {
                    "lab": lab,
                    "requests": len(v),
                    "median_outlab_days": _median(v),
                    "max_outlab_days": round(max(v), 1),
                }
                for lab, v in by_lab.items()
            ),
            key=lambda x: -x["requests"],
        ),
        "requests": requests,
    }


def get_ihc_outstanding(db: Session) -> list[dict]:
    """IHC not out yet, one row per case, oldest order first. Not limited to
    a period: an old open request is exactly what this list is for."""
    holidays = get_holiday_dates(db)
    target = get_ihc_target_days(db)
    now = local_now()
    rows = _ihc_stains(
        db,
        SurgicalBlockStain.reported_at.is_(None),
        SurgicalBlockStain.status.in_(_STAGE_ORDER),
    )
    stain_ids = [row[0].id for row in rows]
    outlab = _latest_outlab(db, stain_ids)

    by_case: dict[int, list] = defaultdict(list)
    for stain, case_id, test_name, is_external in rows:
        by_case[case_id].append((stain, test_name, bool(is_external)))
    patients = _patients(db, set(by_case))

    out = []
    for case_id, slides in by_case.items():
        ordered_at = min((stain.created_at for stain, _, _ in slides if stain.created_at), default=now)
        stage = min((stain.status for stain, _, _ in slides), key=_STAGE_ORDER.index)
        at_outlab = [outlab[s.id] for s, _, _ in slides if s.status == "sent" and s.id in outlab]
        age_days = _days(ordered_at, now, holidays)
        out.append({
            "case_id": case_id,
            **patients.get(case_id, {}),
            "markers": [
                {"name": name, "status": stain.status, "is_external": is_external}
                for stain, name, is_external in sorted(slides, key=lambda x: (x[1] or "", x[0].id))
            ],
            "stage": stage,
            "ordered_at": ordered_at,
            "sent_at": min((o["sent_at"] for o in at_outlab if o["sent_at"]), default=None),
            "lab": next((o["lab"] for o in at_outlab if o["lab"]), None),
            "age_days": age_days,
            # Already past the target: it can no longer go out on time.
            "overdue": age_days > target,
        })
    out.sort(key=lambda r: r["ordered_at"])
    return out
