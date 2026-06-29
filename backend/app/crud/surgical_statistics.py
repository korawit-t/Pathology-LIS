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
