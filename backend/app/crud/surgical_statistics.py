from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from collections import defaultdict
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.embedding import EmbeddingDetail, EmbeddingRun
from app.models.sectioning import SectioningDetail, SectioningRun
from app.models.surgical_block_stain import SurgicalStainRun, SurgicalStainRunDetail, SurgicalOutlabRun, SurgicalOutlabRunDetail
from app.models.slide_dispatch import SlideDispatchRun, SlideDispatchItem
from app.models.tissue_processing import TissueProcessingRun
from app.models.block_storage import BlockStorageRun, BlockStorageDetail
from app.models.slide_storage import SlideStorageRun, SlideStorageDetail
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.outlab_consult import OutlabConsultRun, OutlabConsultRunDetail
from app.models.user import User


def get_surgical_statistics(
    db: Session, start_date: date, end_date: date, pathologist_id: int = None
):
    query = db.query(SurgicalCase).filter(
        func.date(SurgicalCase.registered_at) >= start_date,
        func.date(SurgicalCase.registered_at) <= end_date,
        SurgicalCase.is_cancelled == False
    )

    if pathologist_id:
        query = query.filter(SurgicalCase.pathologist_id == pathologist_id)

    all_cases = query.all()
    total_cases = len(all_cases)

    daily_stats_map = defaultdict(lambda: {"total_cases": 0, "total_tt_seconds": 0, "valid_tt_count": 0})

    for case in all_cases:
        if not case.registered_at:
            continue
        reg_date = case.registered_at.strftime("%Y-%m-%d")
        daily_stats_map[reg_date]["total_cases"] += 1

    completed_cases = [c for c in all_cases if c.is_reported]

    total_tt_seconds = 0
    valid_tt_count = 0

    tt_distribution_map = defaultdict(int)

    for case in completed_cases:
        if case.report_at and case.registered_at:
            reg_date = case.registered_at.strftime("%Y-%m-%d")
            delta = case.report_at - case.registered_at

            daily_stats_map[reg_date]["total_tt_seconds"] += delta.total_seconds()
            daily_stats_map[reg_date]["valid_tt_count"] += 1

            total_tt_seconds += delta.total_seconds()
            valid_tt_count += 1

            tt_days = delta.days
            if tt_days < 0:
                tt_days = 0
            tt_distribution_map[tt_days] += 1

    avg_tt_seconds = total_tt_seconds / valid_tt_count if valid_tt_count > 0 else 0

    daily_stats_list = []
    for d_str in sorted(daily_stats_map.keys()):
        stats = daily_stats_map[d_str]
        d_avg_tt = stats["total_tt_seconds"] / stats["valid_tt_count"] if stats["valid_tt_count"] > 0 else 0
        daily_stats_list.append({
            "date": d_str,
            "total_cases": stats["total_cases"],
            "average_tt_hours": round(d_avg_tt / 3600, 2)
        })

    tt_distribution_list = []
    for days in sorted(tt_distribution_map.keys()):
        tt_distribution_list.append({
            "tt_days": str(days),
            "case_count": tt_distribution_map[days]
        })

    complexity_breakdown = {"small": 0, "medium": 0, "large": 0}
    case_ids = [c.id for c in all_cases]
    if case_ids:
        rows = (
            db.query(
                AnatomicalPathologyTest.specimen_complexity,
                func.count(SurgicalSpecimenAPTest.id)
            )
            .join(SurgicalSpecimenAPTest, SurgicalSpecimenAPTest.ap_test_id == AnatomicalPathologyTest.id)
            .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalSpecimenAPTest.surgical_specimen_id)
            .filter(
                SurgicalSpecimen.case_id.in_(case_ids),
                AnatomicalPathologyTest.specimen_complexity.isnot(None)
            )
            .group_by(AnatomicalPathologyTest.specimen_complexity)
            .all()
        )
        for complexity, count in rows:
            if complexity in complexity_breakdown:
                complexity_breakdown[complexity] = count

    return {
        "total_cases": total_cases,
        "average_tt_days": round(avg_tt_seconds / 86400, 2),
        "average_tt_hours": round(avg_tt_seconds / 3600, 2),
        "daily_stats": daily_stats_list,
        "tt_distribution": tt_distribution_list,
        "complexity_breakdown": complexity_breakdown,
    }


def get_lab_tech_statistics(db: Session, start_date: date, end_date: date, user_id: int = None):
    """Workload statistics for lab technicians — excludes TAT, focuses on physical workflow steps."""

    grossed = db.query(func.count(SurgicalCase.id)).filter(
        SurgicalCase.is_grossed == True,
        func.date(SurgicalCase.gross_at) >= start_date,
        func.date(SurgicalCase.gross_at) <= end_date,
    ).scalar() or 0

    emb_q = db.query(func.count(EmbeddingDetail.id)).join(
        EmbeddingRun, EmbeddingRun.id == EmbeddingDetail.run_id
    ).filter(
        func.date(EmbeddingDetail.embedded_at) >= start_date,
        func.date(EmbeddingDetail.embedded_at) <= end_date,
    )
    if user_id:
        emb_q = emb_q.filter(EmbeddingRun.user_id == user_id)
    embedded = emb_q.scalar() or 0

    sect_q = db.query(
        func.count(SectioningDetail.id),
        func.coalesce(func.sum(SectioningDetail.slide_count), 0)
    ).join(
        SectioningRun, SectioningRun.id == SectioningDetail.run_id
    ).filter(
        func.date(SectioningDetail.sectioned_at) >= start_date,
        func.date(SectioningDetail.sectioned_at) <= end_date,
    )
    if user_id:
        sect_q = sect_q.filter(SectioningRun.user_id == user_id)
    sect_rows = sect_q.first()
    sectioned = sect_rows[0] if sect_rows else 0
    total_slides = int(sect_rows[1]) if sect_rows else 0

    stain_q = db.query(func.count(SurgicalStainRunDetail.id)).join(
        SurgicalStainRun, SurgicalStainRun.id == SurgicalStainRunDetail.stain_run_id
    ).filter(
        func.date(SurgicalStainRun.started_at) >= start_date,
        func.date(SurgicalStainRun.started_at) <= end_date,
    )
    if user_id:
        stain_q = stain_q.filter(SurgicalStainRun.operator_id == user_id)
    stained = stain_q.scalar() or 0

    disp_q = db.query(func.count(SlideDispatchItem.id)).join(
        SlideDispatchRun, SlideDispatchRun.id == SlideDispatchItem.run_id
    ).filter(
        func.date(SlideDispatchRun.sent_at) >= start_date,
        func.date(SlideDispatchRun.sent_at) <= end_date,
    )
    if user_id:
        disp_q = disp_q.filter(SlideDispatchRun.sender_id == user_id)
    dispatched = disp_q.scalar() or 0

    outlab_q = db.query(func.count(SurgicalOutlabRunDetail.id)).join(
        SurgicalOutlabRun, SurgicalOutlabRun.id == SurgicalOutlabRunDetail.outlab_run_id
    ).filter(
        func.date(SurgicalOutlabRun.sent_at) >= start_date,
        func.date(SurgicalOutlabRun.sent_at) <= end_date,
    )
    if user_id:
        outlab_q = outlab_q.filter(SurgicalOutlabRun.operator_id == user_id)
    outlab_sent = outlab_q.scalar() or 0

    case_ids_query = db.query(SurgicalCase.id).filter(
        func.date(SurgicalCase.registered_at) >= start_date,
        func.date(SurgicalCase.registered_at) <= end_date,
        SurgicalCase.is_cancelled == False,
    )
    case_ids = [row[0] for row in case_ids_query.all()]

    complexity_breakdown = {"small": 0, "medium": 0, "large": 0}
    if case_ids:
        rows = (
            db.query(
                AnatomicalPathologyTest.specimen_complexity,
                func.count(SurgicalSpecimenAPTest.id)
            )
            .join(SurgicalSpecimenAPTest, SurgicalSpecimenAPTest.ap_test_id == AnatomicalPathologyTest.id)
            .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalSpecimenAPTest.surgical_specimen_id)
            .filter(
                SurgicalSpecimen.case_id.in_(case_ids),
                AnatomicalPathologyTest.specimen_complexity.isnot(None)
            )
            .group_by(AnatomicalPathologyTest.specimen_complexity)
            .all()
        )
        for complexity, count in rows:
            if complexity in complexity_breakdown:
                complexity_breakdown[complexity] = count

    return {
        "grossed_cases": grossed,
        "embedded_blocks": embedded,
        "sectioned_blocks": sectioned,
        "stained_blocks": stained,
        "total_slides": total_slides,
        "dispatched_cases": dispatched,
        "outlab_sent_blocks": outlab_sent,
        "complexity_breakdown": complexity_breakdown,
    }


def get_staff_registration_stats(db: Session, start_date: date, end_date: date):
    """Count registrations per staff member across all case types."""

    def query_counts(model):
        rows = (
            db.query(model.registrar_id, func.count(model.id))
            .filter(
                func.date(model.registered_at) >= start_date,
                func.date(model.registered_at) <= end_date,
            )
            .group_by(model.registrar_id)
            .all()
        )
        return {rid: cnt for rid, cnt in rows if rid is not None}

    surgical_map = query_counts(SurgicalCase)
    gyne_map = query_counts(GyneCytologyCase)
    nongyne_map = query_counts(NongyneCytologyCase)

    all_user_ids = set(surgical_map) | set(gyne_map) | set(nongyne_map)
    if not all_user_ids:
        return []

    users = db.query(User).filter(User.id.in_(all_user_ids)).all()
    user_map = {u.id: u for u in users}

    rows = []
    for uid in all_user_ids:
        user = user_map.get(uid)
        surgical = surgical_map.get(uid, 0)
        gyne = gyne_map.get(uid, 0)
        nongyne = nongyne_map.get(uid, 0)
        rows.append({
            "user_id": uid,
            "full_name": (user.full_name or user.username) if user else f"User {uid}",
            "username": user.username if user else "",
            "surgical": surgical,
            "gyne": gyne,
            "nongyne": nongyne,
            "total": surgical + gyne + nongyne,
        })

    rows.sort(key=lambda r: r["total"], reverse=True)
    return rows


def _gross_specimens_by_field(db: Session, field, start_date: date, end_date: date):
    """
    Return per-staff specimen breakdown for grossed cases.
    Groups by (user, hospital/site, specimen_name, ap_test/procedure).
    """
    rows = (
        db.query(
            User.id.label("user_id"),
            User.full_name.label("full_name"),
            User.username.label("username"),
            SurgicalSpecimen.specimen_name,
            func.count(SurgicalSpecimen.id).label("count"),
        )
        .select_from(SurgicalCase)
        .join(User, User.id == field)
        .join(SurgicalSpecimen, SurgicalSpecimen.case_id == SurgicalCase.id)
        .filter(
            SurgicalCase.is_grossed == True,
            func.date(SurgicalCase.gross_at) >= start_date,
            func.date(SurgicalCase.gross_at) <= end_date,
            field.isnot(None),
        )
        .group_by(
            User.id,
            User.full_name,
            User.username,
            SurgicalSpecimen.specimen_name,
        )
        .order_by(User.full_name, func.count(SurgicalSpecimen.id).desc())
        .all()
    )

    # Group rows by user
    from collections import OrderedDict
    staff_map: dict = OrderedDict()
    for r in rows:
        uid = r.user_id
        if uid not in staff_map:
            staff_map[uid] = {
                "user_id": uid,
                "full_name": r.full_name or r.username or f"User {uid}",
                "specimen_count": 0,
                "items": [],
            }
        staff_map[uid]["specimen_count"] += r.count
        staff_map[uid]["items"].append({
            "specimen_name": r.specimen_name or "—",
            "count": r.count,
        })

    return list(staff_map.values())


def get_staff_gross_stats(db: Session, start_date: date, end_date: date):
    """Return specimen-level gross workload per examiner and per assistant."""
    return {
        "examiners": _gross_specimens_by_field(db, SurgicalCase.gross_examiner_id, start_date, end_date),
        "assistants": _gross_specimens_by_field(db, SurgicalCase.gross_assistant_id, start_date, end_date),
    }


def _user_display(user):
    if not user:
        return "—"
    return user.full_name or user.username


def get_tissue_process_stats(db: Session, start_date: date, end_date: date):
    """Per-staff block/slide counts for embedding, sectioning, and staining."""

    # --- Embedding: blocks per user ---
    emb_rows = (
        db.query(User.id, User.full_name, User.username, func.count(EmbeddingDetail.id).label("block_count"))
        .select_from(EmbeddingDetail)
        .join(EmbeddingRun, EmbeddingRun.id == EmbeddingDetail.run_id)
        .join(User, User.id == EmbeddingRun.user_id)
        .filter(
            func.date(EmbeddingDetail.embedded_at) >= start_date,
            func.date(EmbeddingDetail.embedded_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(EmbeddingDetail.id).desc())
        .all()
    )
    embedding = [
        {"user_id": r[0], "full_name": r[1] or r[2], "block_count": r[3]}
        for r in emb_rows
    ]

    # --- Sectioning: blocks + slides per user ---
    sect_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(SectioningDetail.id).label("block_count"),
            func.coalesce(func.sum(SectioningDetail.slide_count), 0).label("slide_count"),
        )
        .select_from(SectioningDetail)
        .join(SectioningRun, SectioningRun.id == SectioningDetail.run_id)
        .join(User, User.id == SectioningRun.user_id)
        .filter(
            func.date(SectioningDetail.sectioned_at) >= start_date,
            func.date(SectioningDetail.sectioned_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(SectioningDetail.id).desc())
        .all()
    )
    sectioning = [
        {"user_id": r[0], "full_name": r[1] or r[2], "block_count": r[3], "slide_count": int(r[4])}
        for r in sect_rows
    ]

    # --- Staining: slides (run details) per operator ---
    stain_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(SurgicalStainRunDetail.id).label("slide_count"),
        )
        .select_from(SurgicalStainRunDetail)
        .join(SurgicalStainRun, SurgicalStainRun.id == SurgicalStainRunDetail.stain_run_id)
        .join(User, User.id == SurgicalStainRun.operator_id)
        .filter(
            func.date(SurgicalStainRun.started_at) >= start_date,
            func.date(SurgicalStainRun.started_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(SurgicalStainRunDetail.id).desc())
        .all()
    )
    staining = [
        {"user_id": r[0], "full_name": r[1] or r[2], "slide_count": r[3]}
        for r in stain_rows
    ]

    # --- Tissue Processing: blocks loaded per creator ---
    tp_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(TissueProcessingRun.id).label("run_count"),
            func.coalesce(func.sum(TissueProcessingRun.block_in_total), 0).label("block_count"),
        )
        .select_from(TissueProcessingRun)
        .join(User, User.id == TissueProcessingRun.created_by_id)
        .filter(
            func.date(TissueProcessingRun.start_at) >= start_date,
            func.date(TissueProcessingRun.start_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.coalesce(func.sum(TissueProcessingRun.block_in_total), 0).desc())
        .all()
    )
    tissue_processing = [
        {
            "user_id": r[0],
            "full_name": r[1] or r[2],
            "run_count": r[3],
            "block_count": int(r[4]),
        }
        for r in tp_rows
    ]

    return {"embedding": embedding, "sectioning": sectioning, "staining": staining, "tissue_processing": tissue_processing}


def get_storage_stats(db: Session, start_date: date, end_date: date):
    """Per-staff block and slide storage counts."""

    # --- Block Storage: blocks stored per user ---
    blk_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(BlockStorageDetail.id).label("block_count"),
        )
        .select_from(BlockStorageDetail)
        .join(BlockStorageRun, BlockStorageRun.id == BlockStorageDetail.run_id)
        .join(User, User.id == BlockStorageRun.user_id)
        .filter(
            func.date(BlockStorageRun.started_at) >= start_date,
            func.date(BlockStorageRun.started_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(BlockStorageDetail.id).desc())
        .all()
    )
    block_storage = [
        {"user_id": r[0], "full_name": r[1] or r[2], "block_count": r[3]}
        for r in blk_rows
    ]

    # --- Slide Storage: slides per user per category ---
    CATEGORIES = ["HE", "Special", "IHC", "Gyne", "NonGyne"]
    sld_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            SlideStorageRun.stain_category,
            func.count(SlideStorageDetail.id).label("slide_count"),
        )
        .select_from(SlideStorageDetail)
        .join(SlideStorageRun, SlideStorageRun.id == SlideStorageDetail.run_id)
        .join(User, User.id == SlideStorageRun.user_id)
        .filter(
            func.date(SlideStorageRun.started_at) >= start_date,
            func.date(SlideStorageRun.started_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username, SlideStorageRun.stain_category)
        .all()
    )

    from collections import defaultdict, OrderedDict
    slide_map: dict = OrderedDict()
    for r in sld_rows:
        uid = r[0]
        if uid not in slide_map:
            slide_map[uid] = {
                "user_id": uid,
                "full_name": r[1] or r[2],
                **{cat: 0 for cat in CATEGORIES},
                "total": 0,
            }
        cat = r[3] or ""
        if cat in CATEGORIES:
            slide_map[uid][cat] += r[4]
        slide_map[uid]["total"] += r[4]

    slide_storage = sorted(slide_map.values(), key=lambda x: x["total"], reverse=True)

    return {"block_storage": block_storage, "slide_storage": slide_storage}


def get_outlab_stats(db: Session, start_date: date, end_date: date):
    """Per-operator outlab stain run and consult run counts."""

    # --- Outlab Stain: runs + slides per operator ---
    stain_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(SurgicalOutlabRun.id.distinct()).label("run_count"),
            func.count(SurgicalOutlabRunDetail.id).label("slide_count"),
        )
        .select_from(SurgicalOutlabRun)
        .join(User, User.id == SurgicalOutlabRun.operator_id)
        .outerjoin(SurgicalOutlabRunDetail, SurgicalOutlabRunDetail.outlab_run_id == SurgicalOutlabRun.id)
        .filter(
            func.date(SurgicalOutlabRun.sent_at) >= start_date,
            func.date(SurgicalOutlabRun.sent_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(SurgicalOutlabRunDetail.id).desc())
        .all()
    )
    outlab_stain = [
        {
            "user_id": r[0],
            "full_name": r[1] or r[2],
            "run_count": r[3],
            "slide_count": r[4],
        }
        for r in stain_rows
    ]

    # --- Outlab Consult: runs + cases per operator ---
    consult_rows = (
        db.query(
            User.id,
            User.full_name,
            User.username,
            func.count(OutlabConsultRun.id.distinct()).label("run_count"),
            func.count(OutlabConsultRunDetail.id).label("case_count"),
        )
        .select_from(OutlabConsultRun)
        .join(User, User.id == OutlabConsultRun.operator_id)
        .outerjoin(OutlabConsultRunDetail, OutlabConsultRunDetail.run_id == OutlabConsultRun.id)
        .filter(
            func.date(OutlabConsultRun.sent_at) >= start_date,
            func.date(OutlabConsultRun.sent_at) <= end_date,
        )
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(OutlabConsultRunDetail.id).desc())
        .all()
    )
    outlab_consult = [
        {
            "user_id": r[0],
            "full_name": r[1] or r[2],
            "run_count": r[3],
            "case_count": r[4],
        }
        for r in consult_rows
    ]

    return {"outlab_stain": outlab_stain, "outlab_consult": outlab_consult}
