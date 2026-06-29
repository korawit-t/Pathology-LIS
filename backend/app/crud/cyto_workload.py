from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, case
from datetime import date
from typing import Optional
from collections import defaultdict

from app.models.cyto_workload import CytoWorkloadLog
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_cyto_stain import GyneCytologyStain
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.user import User
from app.schemas.cyto_workload import CytoWorkloadLogUpsert, CytoWorkloadDayStats
from app.utils.time import local_now

NONGYNE_LIQUID_TYPES = {
    "Fluid", "Body Fluid", "Urine", "CSF",
    "Sputum", "Washings", "Brushings",
}


def upsert_workload_log(
    db: Session,
    obj: CytoWorkloadLogUpsert,
    recorded_by_id: int,
) -> CytoWorkloadLog:
    existing = (
        db.query(CytoWorkloadLog)
        .filter(
            CytoWorkloadLog.user_id == obj.user_id,
            CytoWorkloadLog.work_date == obj.work_date,
        )
        .first()
    )
    now = local_now()
    if existing:
        existing.reading_hours = obj.reading_hours
        existing.note = obj.note
        existing.recorded_by_id = recorded_by_id
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return existing

    log = CytoWorkloadLog(
        user_id=obj.user_id,
        work_date=obj.work_date,
        reading_hours=obj.reading_hours,
        note=obj.note,
        recorded_by_id=recorded_by_id,
        created_at=now,
        updated_at=now,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_workload_log(
    db: Session, user_id: int, work_date: date
) -> Optional[CytoWorkloadLog]:
    return (
        db.query(CytoWorkloadLog)
        .filter(
            CytoWorkloadLog.user_id == user_id,
            CytoWorkloadLog.work_date == work_date,
        )
        .first()
    )


def get_workload_stats(
    db: Session,
    start_date: date,
    end_date: date,
    user_ids: Optional[list] = None,
) -> list[CytoWorkloadDayStats]:

    # --- 1. Gyne slide counts per (user, date) ---
    _gyne_date = cast(
        func.coalesce(GyneCytologyCase.screened_at, GyneCytologyCase.report_at, GyneCytologyCase.registered_at),
        Date,
    )
    gyne_q = (
        db.query(
            GyneCytologyCase.cytotechnologist_id.label("user_id"),
            _gyne_date.label("work_date"),
            func.count(GyneCytologyStain.id).label("slide_count"),
        )
        .join(GyneCytologyStain, GyneCytologyStain.case_id == GyneCytologyCase.id)
        .filter(
            GyneCytologyCase.cytotechnologist_id.isnot(None),
            _gyne_date >= start_date,
            _gyne_date <= end_date,
        )
        .group_by(
            GyneCytologyCase.cytotechnologist_id,
            _gyne_date,
        )
    )
    if user_ids:
        gyne_q = gyne_q.filter(GyneCytologyCase.cytotechnologist_id.in_(user_ids))

    gyne_counts: dict[tuple, int] = {}
    for row in gyne_q.all():
        gyne_counts[(row.user_id, row.work_date)] = int(row.slide_count)

    # --- 2. NonGyne slide counts per (user, date), split conv vs liquid ---
    _nongyne_date = cast(
        func.coalesce(NongyneCytologyCase.screened_at, NongyneCytologyCase.report_at, NongyneCytologyCase.registered_at),
        Date,
    )
    nongyne_q = (
        db.query(
            NongyneCytologyCase.cytotechnologist_id.label("user_id"),
            _nongyne_date.label("work_date"),
            NongyneCytologyCase.specimen_type.label("specimen_type"),
            NongyneCytologyCase.is_cell_block.label("is_cell_block"),
            func.count(NongyneCytologyStain.id).label("slide_count"),
        )
        .join(NongyneCytologyStain, NongyneCytologyStain.case_id == NongyneCytologyCase.id)
        .filter(
            NongyneCytologyCase.cytotechnologist_id.isnot(None),
            _nongyne_date >= start_date,
            _nongyne_date <= end_date,
        )
        .group_by(
            NongyneCytologyCase.cytotechnologist_id,
            _nongyne_date,
            NongyneCytologyCase.specimen_type,
            NongyneCytologyCase.is_cell_block,
        )
    )
    if user_ids:
        nongyne_q = nongyne_q.filter(NongyneCytologyCase.cytotechnologist_id.in_(user_ids))

    nongyne_conv: dict[tuple, int] = defaultdict(int)
    nongyne_liquid: dict[tuple, int] = defaultdict(int)
    for row in nongyne_q.all():
        key = (row.user_id, row.work_date)
        count = int(row.slide_count)
        is_liquid = (
            row.specimen_type in NONGYNE_LIQUID_TYPES
            or bool(row.is_cell_block)
        )
        if is_liquid:
            nongyne_liquid[key] += count
        else:
            nongyne_conv[key] += count

    # --- 3. Reading hours logs ---
    hours_q = db.query(CytoWorkloadLog).filter(
        CytoWorkloadLog.work_date >= start_date,
        CytoWorkloadLog.work_date <= end_date,
    )
    if user_ids:
        hours_q = hours_q.filter(CytoWorkloadLog.user_id.in_(user_ids))
    hours_map: dict[tuple, CytoWorkloadLog] = {
        (log.user_id, log.work_date): log for log in hours_q.all()
    }

    # --- 4. Fetch user full names ---
    all_user_ids = set(uid for uid, _ in gyne_counts) | set(uid for uid, _ in nongyne_conv) | set(uid for uid, _ in nongyne_liquid)
    if user_ids:
        all_user_ids &= set(user_ids)
    users = {
        u.id: u.full_name
        for u in db.query(User).filter(User.id.in_(all_user_ids)).all()
    }

    # --- 5. Merge into result rows (include hours-only entries too) ---
    all_keys: set[tuple] = set(gyne_counts) | set(nongyne_conv) | set(nongyne_liquid) | set(hours_map.keys())
    results: list[CytoWorkloadDayStats] = []
    for uid, wdate in sorted(all_keys, key=lambda x: (x[1], x[0])):
        g = gyne_counts.get((uid, wdate), 0)
        nc = nongyne_conv.get((uid, wdate), 0)
        nl = nongyne_liquid.get((uid, wdate), 0)
        effective = g + nc + nl * 0.5

        log = hours_map.get((uid, wdate))
        reading_hours = float(log.reading_hours) if log else None
        adjusted_limit = 100.0 * min(reading_hours, 8.0) / 8.0 if reading_hours is not None else 100.0

        results.append(
            CytoWorkloadDayStats(
                user_id=uid,
                user_full_name=users.get(uid, f"User {uid}"),
                work_date=wdate,
                gyne_slides=g,
                nongyne_conv_slides=nc,
                nongyne_liquid_slides=nl,
                effective_count=round(effective, 1),
                reading_hours=reading_hours,
                adjusted_limit=adjusted_limit,
                is_compliant=effective <= adjusted_limit,
                note=log.note if log else None,
            )
        )
    return results
