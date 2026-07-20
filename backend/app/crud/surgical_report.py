from app.crud.surgical_diagnosis import bulk_save_draft_orchestrator
from app.crud.surgical_report_builder import prepare_report_data, STORAGE_BASE
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
from app.models.organization import Hospital
from app.crud.organization import resolve_lab_header
from app.crud.system_setting import get_settings as get_system_settings
from app.enums.case_status import CaseStatus
from app.crud import his_export_log as his_export_crud

logger = logging.getLogger(__name__)


def resolve_report_logo(report_data: dict, db: Session) -> None:
    """Pass the logo as a file:// URI so WeasyPrint reads it directly from disk.
    Always uses the current hospital/system settings — no snapshot needed for logo."""
    settings = get_system_settings(db)
    hospital = (
        db.query(Hospital).filter(Hospital.id == report_data.get("hospital_id")).first()
        if report_data.get("hospital_id")
        else None
    )
    _name, _address, logo_path = resolve_lab_header(hospital, settings)
    if logo_path:
        full = STORAGE_BASE / logo_path.removeprefix("/storage/")
        report_data["report_logo_url_snapshot"] = full.as_uri() if full.exists() else None
    else:
        report_data["report_logo_url_snapshot"] = None


def get_surgical_report_pdf(db: Session, report: SurgicalReport) -> bytes:
    """PDF bytes for a specific published report snapshot — the counterpart
    of gyne's get_gyne_report_pdf()/nongyne's get_nongyne_snapshot_pdf_data()
    pairing, used by both the report-download router and the HIS export
    worker so the two never drift apart."""
    report_data = {c.name: getattr(report, c.name) for c in report.__table__.columns}

    fresh_data = prepare_report_data(db, report.case_id) if report.case_id else None
    report_data["gross_images"] = fresh_data.get("gross_images", []) if fresh_data else []
    report_data["micro_images"] = fresh_data.get("micro_images", []) if fresh_data else []
    if not report_data.get("patient_title") and fresh_data:
        report_data["patient_title"] = fresh_data.get("patient_title") or ""

    resolve_report_logo(report_data, db)

    settings = get_system_settings(db)
    active_template = f"reports/{settings.surgical_report_template or 'surgical_report_template.html'}"

    from app.services.pdf_service import generate_pdf_blob, prepend_consult_cover
    pdf_blob = generate_pdf_blob(
        report_data,
        template_name=active_template,
        is_preview=False,
    )
    return prepend_consult_cover(pdf_blob, report_data)


def build_surgical_export_payload(report: SurgicalReport) -> dict:
    """Structured export payload for outbound HIS delivery. Keeps report
    column knowledge local to this domain — app/his_export/ never needs to
    know surgical-specific field names."""
    signers = [
        {
            "user_id": s.user_id,
            "name": (s.user.report_name or s.user.full_name) if s.user else None,
            "role": s.role,
            "signed_at": s.signed_at.isoformat() if s.signed_at else None,
        }
        for s in report.signers
    ]
    return {
        "accession_no": report.accession_no,
        "patient_title": report.patient_title,
        "patient_name": report.patient_name,
        "patient_ln": report.patient_ln,
        "patient_hn": report.patient_hn,
        "patient_cid": report.patient_cid,
        "patient_birth_date": report.patient_birth_date.isoformat() if report.patient_birth_date else None,
        "patient_age": report.patient_age,
        "patient_gender": report.patient_gender,
        "hospital_name": report.hospital_name,
        "hospital_id": report.hospital_id,
        "department_name": report.department_name,
        "clinician_name": report.clinician_name,
        "report_type": report.report_type,
        "status": report.status.value if hasattr(report.status, "value") else report.status,
        "published_at": report.published_at.isoformat() if report.published_at else None,
        "version_no": report.version_no,
        "clinical_history_text": report.clinical_history_snapshot,
        "specimen_summary": report.specimen_summary,
        "gross_description_text": report.gross_description_summary,
        "diagnosis_text": report.diagnosis_summary,
        "microscopic_text": report.microscopic_summary,
        "comment_text": report.comment_summary,
        "pathologist_name": report.pathologist_name,
        "signers": signers,
    }


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

    report_dict = prepare_report_data(
        db, case_id, target_report_id=existing_report.id if existing_report else None
    )
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


def finalize_and_snapshot_orchestrator(
    db: Session, case_id: int, data: BulkSaveDraft, current_user_id: int
):
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

            # Apply the pathologist's pending toggle before snapshotting, so a
            # resolved consult round doesn't bake the stale "awaiting consult"
            # pending flag into the just-published report (mirrors the same
            # assignment bulk_save_draft_orchestrator does for normal draft saves).
            if db_case:
                db_case.is_pending = data.is_pending
                db_case.pending_reason = data.pending_reason if data.is_pending else None

            # Reuse an already-in-flight draft/pending-approval report for this
            # case instead of unconditionally inserting a new row every call —
            # avoids leaving an orphaned duplicate report behind on a retry.
            existing_consult_draft = (
                db.query(SurgicalReport)
                .filter(
                    SurgicalReport.case_id == case_id,
                    SurgicalReport.status.in_(
                        [ReportStatus.DRAFT, ReportStatus.PENDING_APPROVAL]
                    ),
                )
                .first()
            )
            if not existing_consult_draft:
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
            # db_case is already persistent (loaded via query above) — no need
            # to re-add it; doing so was implicated in a session identity-map
            # conflict when a report row was flushed earlier in this same
            # transaction (relationship cascade re-attaching a stale instance).
            db.flush()

        if not current_order_no or current_order_no == 1:
            max_order = (
                db.query(func.max(SurgicalDiagnosis.diagnosis_order))
                .filter(SurgicalDiagnosis.case_id == case_id)
                .scalar()
            )
            current_order_no = max_order or 1

        now = local_now()

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

            full_payload = prepare_report_data(db, case_id, target_report_id=report.id)
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
                his_export_crud.enqueue(
                    db,
                    resource_type="SurgicalReport",
                    resource_id=report.id,
                    accession_no=report.accession_no,
                    payload_snapshot=build_surgical_export_payload(report),
                )

            if is_consult_dispatched:
                db_case.consult_status = "received"
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
