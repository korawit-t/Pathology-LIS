from app.crud.surgical_diagnosis import bulk_save_draft_orchestrator
from app.crud.surgical_report_builder import prepare_report_data
from app.schemas.surgical_bulk import BulkSaveDraft
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from app.utils.time import local_now
from app.models.surgical_case import SurgicalCase
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import (
    SurgicalReport,
    ReportStatus,
    ReportType,
    SurgicalReportImage,
    ReportSigner,
)
from app.models.system_setting import SystemSetting
from app.enums.case_status import CaseStatus

logger = logging.getLogger(__name__)


def create_final_report_snapshot(db: Session, case_id: int, report_id: int = None):
    existing_report = None
    if report_id:
        existing_report = (
            db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()
        )

    if not existing_report:
        existing_report = (
            db.query(SurgicalReport)
            .filter(SurgicalReport.case_id == case_id)
            .order_by(SurgicalReport.id.desc())
            .first()
        )

    report_dict = prepare_report_data(db, case_id)
    if not report_dict:
        return None

    gross_imgs_list = report_dict.pop("gross_images", [])
    micro_imgs_list = report_dict.pop("micro_images", [])

    allowed_keys = {c.name for c in SurgicalReport.__table__.columns}
    safe_data = {k: v for k, v in report_dict.items() if k in allowed_keys}

    if existing_report:
        for key, value in safe_data.items():
            if key != "id":
                setattr(existing_report, key, value)

        existing_report.reported_at = local_now()
        report_to_process = existing_report

        db.query(SurgicalReportImage).filter(
            SurgicalReportImage.report_id == existing_report.id
        ).delete()
    else:
        safe_data.pop("id", None)
        report_to_process = SurgicalReport(**safe_data)
        db.add(report_to_process)

    db.flush()

    all_imgs_to_save = gross_imgs_list + micro_imgs_list
    for img_data in all_imgs_to_save:
        img_url = img_data.get("image_url")
        if img_url:
            db.add(
                SurgicalReportImage(
                    report_id=report_to_process.id,
                    image_url=img_url,
                    magnification=img_data.get("magnification") or img_data.get("mag"),
                    stain=img_data.get("stain"),
                    description=img_data.get("description") or img_data.get("desc"),
                )
            )

    db_case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    if db_case:
        db_case.is_reported = True
        db_case.report_at = local_now()

    db.flush()
    db.refresh(report_to_process)
    return report_to_process


def get_reports_by_case(db: Session, case_id: int):
    return (
        db.query(SurgicalReport)
        .filter(SurgicalReport.case_id == case_id)
        .order_by(SurgicalReport.created_at.desc())
        .all()
    )


def get_all_reports_paginated(
    db: Session,
    page: int = 1,
    size: int = 10,
    search: str = None,
    status_filter: str = None,
    hospital_id: int = None,
    is_print: bool = None,
):
    query = db.query(SurgicalReport).options(
        joinedload(SurgicalReport.microscopic_images)
    )

    if status_filter:
        query = query.filter(SurgicalReport.status == status_filter)

    if hospital_id:
        query = query.filter(SurgicalReport.hospital_id == hospital_id)

    if is_print is not None:
        query = query.filter(SurgicalReport.is_print == is_print)

    if search:
        if search.startswith("status:"):
            target_status = search.split(":")[1].lower()
            query = query.filter(SurgicalReport.status == target_status)
        else:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    SurgicalReport.accession_no.ilike(search_filter),
                    SurgicalReport.patient_name.ilike(search_filter),
                    SurgicalReport.patient_ln.ilike(search_filter),
                    SurgicalReport.patient_hn.ilike(search_filter),
                    SurgicalReport.diagnosis_summary.ilike(search_filter),
                    SurgicalReport.pathologist_name.ilike(search_filter),
                )
            )

    total = query.count()
    skip = (page - 1) * size
    items = (
        query.order_by(SurgicalReport.created_at.desc()).offset(skip).limit(size).all()
    )

    return {"items": items, "total": total, "page": page, "size": size}


def get_reports_paginated(
    db: Session, case_id: int, page: int = 1, size: int = 10, search: str = None
):
    query = db.query(SurgicalReport).filter(SurgicalReport.case_id == case_id)

    if search:
        if search.startswith("status:"):
            status_str = search.split(":")[1].lower()
            if status_str == "pending":
                query = query.filter(
                    SurgicalReport.status == ReportStatus.PENDING_APPROVAL.value
                )
            elif status_str == "published":
                query = query.filter(
                    SurgicalReport.status == ReportStatus.PUBLISHED.value
                )
        else:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    SurgicalReport.diagnosis_summary.ilike(search_filter),
                    SurgicalReport.pathologist_name.ilike(search_filter),
                    SurgicalReport.patient_name.ilike(search_filter),
                    SurgicalReport.patient_ln.ilike(search_filter),
                )
            )

    total = query.count()
    skip = (page - 1) * size
    items = (
        query.order_by(SurgicalReport.created_at.desc()).offset(skip).limit(size).all()
    )

    return {"items": items, "total": total, "page": page, "size": size}


def get_report(db: Session, report_id: int):
    return db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()


def finalize_and_snapshot_orchestrator(db: Session, case_id: int, data: BulkSaveDraft):
    try:
        db_case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
        is_consult_dispatched = bool(
            db_case and
            db_case.is_out_lab_consult and
            db_case.consult_status in ("processing", "received")
        )

        if not is_consult_dispatched:
            report_draft_result = bulk_save_draft_orchestrator(db, data)
            db.flush()
            if isinstance(report_draft_result, dict):
                current_order_no = report_draft_result.get("order")
            else:
                current_order_no = getattr(report_draft_result, "current_order_no", None)
        else:
            report_draft_result = None
            current_order_no = None

            _consult_snap = prepare_report_data(db, case_id)
            if _consult_snap:
                _allowed = {c.name for c in SurgicalReport.__table__.columns}
                _safe = {k: v for k, v in _consult_snap.items() if k in _allowed}
                _safe.pop("id", None)
                _consult_draft = SurgicalReport(**_safe)
                _consult_draft.status = ReportStatus.DRAFT
                db.add(_consult_draft)
                db.flush()

        if db_case:
            if data.stain_quality:
                db_case.stain_quality = data.stain_quality
            if data.tissue_quality:
                db_case.tissue_quality = data.tissue_quality
            if data.slide_quality:
                db_case.slide_quality = data.slide_quality
            db.add(db_case)
            db.flush()

        if not current_order_no or current_order_no == 1:
            max_order = (
                db.query(func.max(SurgicalDiagnosis.diagnosis_order))
                .filter(SurgicalDiagnosis.case_id == case_id)
                .scalar()
            )
            current_order_no = max_order or 1

        now = local_now()
        current_user_id = data.signed_by_id

        report = (
            db.query(SurgicalReport)
            .filter(
                SurgicalReport.case_id == case_id,
                SurgicalReport.status.in_(
                    [ReportStatus.DRAFT, ReportStatus.PENDING_APPROVAL]
                ),
            )
            .first()
        )

        existing_signers = (
            db.query(ReportSigner)
            .filter(
                ReportSigner.report_id == report.id,
                ReportSigner.diagnosis_order == current_order_no,
            )
            .all()
        )

        incoming_pathologists = data.pathologists or []
        incoming_user_ids = {p["user_id"] for p in incoming_pathologists}

        for s in existing_signers:
            if (
                incoming_user_ids
                and s.user_id not in incoming_user_ids
                and s.signed_at is None
            ):
                db.delete(s)

            if s.user_id == current_user_id:
                s.signed_at = now

        existing_user_ids = {s.user_id for s in existing_signers}
        for p in incoming_pathologists:
            if p["user_id"] not in existing_user_ids:
                new_signer = ReportSigner(
                    report_id=report.id,
                    user_id=p["user_id"],
                    diagnosis_order=current_order_no,
                    role=p.get("role", "co-signer"),
                    assigned_at=now,
                    signed_at=now if p["user_id"] == current_user_id else None,
                )
                db.add(new_signer)

        db.flush()

        pending_count = (
            db.query(ReportSigner)
            .filter(
                ReportSigner.report_id == report.id,
                ReportSigner.diagnosis_order == current_order_no,
                ReportSigner.signed_at == None,
            )
            .count()
        )
        settings = db.query(SystemSetting).first()
        require_all = settings.require_all_pathologists_sign if settings else True
        should_move_to_approval = (pending_count == 0) if require_all else True

        if should_move_to_approval:
            db.query(SurgicalDiagnosis).filter(
                SurgicalDiagnosis.case_id == case_id,
                SurgicalDiagnosis.status == "draft",
                SurgicalDiagnosis.diagnosis_order == current_order_no,
            ).update(
                {"status": "signed", "diagnosis_at": now}, synchronize_session=False
            )

            full_payload = prepare_report_data(db, case_id)
            report = create_final_report_snapshot(db, case_id, report_id=report.id)
            report.pathologist_name = full_payload.get(
                "pathologist_name", report.pathologist_name
            )

            is_approve_enabled = settings.enable_approve_system if settings else False
            if is_approve_enabled:
                report.status = ReportStatus.PENDING_APPROVAL
                db_case.status = CaseStatus.PENDING_REVIEW.value
            else:
                report.status = ReportStatus.PUBLISHED
                db_case.status = CaseStatus.SIGNED_OUT.value

            if is_consult_dispatched:
                db_case.consult_status = "received"

            db.add(db_case)
        else:
            report = create_final_report_snapshot(db, case_id, report_id=report.id)
            report.status = ReportStatus.DRAFT

        db.commit()
        db.refresh(report)
        return report

    except Exception as e:
        db.rollback()
        logger.error("finalize_and_snapshot failed for case %s: %s", case_id, e)
        raise e


def get_pending_cosign_worklist(
    db: Session, user_id: int, page: int = 1, size: int = 20, search: str = None
):
    query = (
        db.query(SurgicalReport)
        .join(ReportSigner)
        .filter(
            ReportSigner.user_id == user_id,
            ReportSigner.signed_at == None,
            ReportSigner.role != "primary",
            SurgicalReport.status != ReportStatus.CANCELLED,
        )
    )

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                SurgicalReport.accession_no.ilike(search_filter),
                SurgicalReport.patient_name.ilike(search_filter),
                SurgicalReport.patient_ln.ilike(search_filter),
                SurgicalReport.patient_hn.ilike(search_filter),
            )
        )

    total = query.count()
    skip = (page - 1) * size
    items = (
        query.order_by(SurgicalReport.created_at.desc()).offset(skip).limit(size).all()
    )

    return {"items": items, "total": total, "page": page, "size": size}
