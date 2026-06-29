from sqlalchemy import or_
from sqlalchemy.orm import Session
from datetime import datetime, date
from app.utils.time import local_now
from app.models.nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus, NongyneReportType, NongyneReportSigner
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_case_image import NongyneCaseImage
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.cyto_approval_log import CytoReportAuditLog
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.schemas.report_approval import ReportApproveRequest
from fastapi import HTTPException
from dateutil.relativedelta import relativedelta
from typing import List
import base64
import os
from pathlib import Path


def get_report_by_id(db: Session, report_id: int):
    return db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()


def get_reports_by_case(db: Session, case_id: int):
    return (
        db.query(NongyneCytoReport)
        .filter(NongyneCytoReport.case_id == case_id)
        .order_by(NongyneCytoReport.created_at.desc())
        .all()
    )


def get_all_reports(db: Session, skip: int = 0, limit: int = 20, search: str = None, status: str = None, is_print: bool = None):
    query = db.query(NongyneCytoReport).join(NongyneCytologyCase)

    if status:
        query = query.filter(NongyneCytoReport.status == status)

    if is_print is not None:
        query = query.filter(NongyneCytoReport.is_print == is_print)

    if search:
        search_term = f"%{search}%"
        from app.models.patient import Patient
        query = query.join(Patient, NongyneCytologyCase.patient_id == Patient.id).filter(
            (NongyneCytoReport.accession_no.ilike(search_term)) |
            (NongyneCytologyCase.hn.ilike(search_term)) |
            (Patient.name.ilike(search_term))
        )

    total = query.count()
    items = query.order_by(NongyneCytoReport.created_at.desc()).offset(skip).limit(limit).all()
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {"items": items, "total": total, "page": current_page, "size": limit}


def _calculate_patient_age(birth_date: date, ref_date: date = None) -> dict:
    if not birth_date:
        return {"years": None, "display": "-"}
    if not ref_date:
        ref_date = date.today()
    diff = relativedelta(ref_date, birth_date)
    years_only = diff.years
    if diff.years >= 2:
        display = f"{diff.years} Y"
    elif diff.years >= 1:
        display = f"{diff.years} Y {diff.months} M"
    elif diff.months >= 1:
        display = f"{diff.months} M {diff.days} D"
    else:
        display = f"{diff.days} D"
    return {"years": years_only, "display": display}


def prepare_nongyne_report_data(db: Session, case_id: int):
    """รวบรวมข้อมูล Snapshot สำหรับสร้าง NonGyne Report"""
    db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not db_case:
        return None

    settings = db.query(SystemSetting).first()
    is_cumulative = settings.is_cumulative_report if settings else True

    all_diags_raw = (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id == case_id)
        .order_by(NongyneDiagnosis.diagnosis_order.asc(), NongyneDiagnosis.created_at.desc())
        .all()
    )
    # Deduplicate: keep latest record per diagnosis_order
    seen_orders: set = set()
    all_diags: list = []
    for d in all_diags_raw:
        if d.diagnosis_order not in seen_orders:
            all_diags.append(d)
            seen_orders.add(d.diagnosis_order)

    db_diag = all_diags[-1] if all_diags else None  # highest order = current

    if is_cumulative and len(all_diags) > 1:
        html_parts = []
        for d in reversed(all_diags):
            date_str = d.diagnosis_at.strftime("%d/%m/%Y") if d.diagnosis_at else (d.created_at.strftime("%d/%m/%Y") if d.created_at else "")
            entry_label = f' — {d.entry_type}' if d.entry_type else ''
            header = (
                f'<p style="color:#666;font-size:11px;font-weight:bold;margin:4px 0 2px">'
                f'REPORT #{d.diagnosis_order}{entry_label}' + (f' ({date_str})' if date_str else '') + '</p>'
            )
            html_parts.append(f'{header}<div>{d.diagnosis or ""}</div>')
        diagnosis_html = '<div style="margin:6px 0;border-top:1px solid #ccc"></div>'.join(html_parts)
    else:
        diagnosis_html = db_diag.diagnosis if db_diag else None

    pathologist_name = "Not Specified"
    pathologist_id = None
    cytotechnologist_name = None
    cytotechnologist_id = None
    signers_data = []

    if db_case.pathologist:
        pathologist_name = db_case.pathologist.report_name or db_case.pathologist.full_name
        pathologist_id = db_case.pathologist_id
        signers_data.append({
            "full_name": db_case.pathologist.full_name,
            "report_name": db_case.pathologist.report_name,
            "role": "primary",
            "signed_at": None
        })

    if db_case.cytotechnologist:
        cytotechnologist_name = db_case.cytotechnologist.report_name or db_case.cytotechnologist.full_name
        cytotechnologist_id = db_case.cytotechnologist_id
        signers_data.append({
            "full_name": db_case.cytotechnologist.full_name,
            "report_name": db_case.cytotechnologist.report_name,
            "role": "cytotechnologist",
            "signed_at": None
        })

    patient = db_case.patient
    patient_age = 0
    if patient and patient.birth_date:
        age_info = _calculate_patient_age(patient.birth_date)
        patient_age = age_info["years"] or 0

    return {
        "case_id": db_case.id,
        "accession_no": db_case.accession_no,
        "patient_title": patient.title.title if patient and patient.title else None,
        "patient_name": patient.name if patient else "Unknown",
        "patient_ln": patient.ln if patient else None,
        "patient_hn": db_case.hn,
        "patient_cid": patient.cid if patient else None,
        "patient_birth_date": patient.birth_date if patient else None,
        "patient_age": patient_age,
        "patient_gender": patient.gender if patient else None,

        "hospital_id": db_case.hospital_id,
        "hospital_name": db_case.hospital.name if db_case.hospital else None,
        "department_name": db_case.department.name if db_case.department else None,
        "clinician_name": db_case.clinician_name,
        "clinical_history_snapshot": db_case.clinical_history,
        "clinical_diagnosis_snapshot": db_case.clinical_diagnosis,

        "specimen_type": db_case.specimen_type,
        "collection_site": db_case.collection_site,

        "gross_description": db_diag.gross_description if db_diag else None,
        "microscopic_description": db_diag.microscopic_description if db_diag else None,
        "diagnosis": diagnosis_html,
        "comment": db_diag.comment if db_diag else None,
        "has_malignancy": db_case.has_malignancy or False,

        "pathologist_id": pathologist_id,
        "pathologist_name": pathologist_name,
        "cytotechnologist_id": cytotechnologist_id,
        "cytotechnologist_name": cytotechnologist_name,
        "signers_snapshot": signers_data,

        "lab_name_snapshot": settings.lab_name_th if settings else "Pathology Lab",
        "lab_address_snapshot": settings.lab_address if settings else "",

        "report_type": NongyneReportType.FINAL,
        "status": NongyneReportStatus.PENDING_APPROVAL,
        "reported_at": local_now(),

        # Must pop before creating model instance
        "signers": signers_data
    }


def publish_nongyne_report(db: Session, case_id: int, signers: List[dict] = None, current_user_id: int = None, is_pending: bool = False, pending_reason: str = None):
    """สร้าง Snapshot และส่งเข้าสู่กระบวนการอนุมัติ"""
    report_data = prepare_nongyne_report_data(db, case_id)
    if not report_data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")

    existing_count = db.query(NongyneCytoReport).filter(NongyneCytoReport.case_id == case_id).count()
    report_data["version_no"] = existing_count + 1

    if existing_count > 0:
        report_data["report_type"] = NongyneReportType.REVISED

    report_data.pop("signers", None)
    report_data["is_pending"] = is_pending
    report_data["pending_reason"] = pending_reason if is_pending else None

    db_report = NongyneCytoReport(**report_data)
    db.add(db_report)
    db.flush()

    if signers:
        for s in signers:
            signed_at_val = s.get("signed_at")
            if not signed_at_val and current_user_id and s["user_id"] == current_user_id:
                signed_at_val = local_now()

            new_signer = NongyneReportSigner(
                report_id=db_report.id,
                user_id=s["user_id"],
                role=s.get("role", "primary"),
                signed_at=signed_at_val
            )
            db.add(new_signer)

    # Stamp signers onto the current diagnosis for worklist filtering
    if signers:
        from app.models.nongyne_diagnosis import NongyneDiagnosis
        current_diag = (
            db.query(NongyneDiagnosis)
            .filter(NongyneDiagnosis.case_id == case_id, NongyneDiagnosis.is_current.is_(True))
            .first()
        )
        if current_diag:
            current_diag.signers = [{"user_id": s["user_id"], "role": s.get("role", "primary")} for s in signers]
            db.add(current_diag)

    db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if db_case:
        db_case.is_reported = True
        db_case.is_pending = is_pending
        db_case.report_at = local_now()
        db_case.status = "pending_approval"

    db.commit()
    db.refresh(db_report)
    return db_report


def _get_image_base64(image_url: str, max_width: int = 800) -> str | None:
    try:
        from PIL import Image
        import io
        storage_root = Path("uploads")
        relative = image_url.lstrip("/storage/")
        file_path = storage_root / relative
        if not file_path.exists():
            return None
        with Image.open(file_path) as img:
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


def _enrich_report_data(data: dict, db: Session, case_id: int) -> dict:
    """Add template variables that are missing from snapshot/preview data."""
    settings = db.query(SystemSetting).first()
    if settings:
        data["lab_name_snapshot"] = settings.lab_name_th or ""
        data["lab_name_en_snapshot"] = settings.lab_name_en or settings.lab_name_th or ""
        data["lab_address_snapshot"] = settings.lab_address or ""
        data["report_footer_snapshot"] = settings.nongyne_report_footer or settings.report_footer_text or ""
        # Logo base64
        if settings.report_logo_url:
            try:
                storage_root = Path("uploads")
                full_path = storage_root / settings.report_logo_url.lstrip("/storage/")
                if full_path.exists():
                    with open(full_path, "rb") as f:
                        encoded = base64.b64encode(f.read()).decode("utf-8")
                        ext = full_path.suffix.lower().lstrip(".")
                        data["report_logo_url_snapshot"] = f"data:image/{ext};base64,{encoded}"
            except Exception:
                data.setdefault("report_logo_url_snapshot", None)
        else:
            data.setdefault("report_logo_url_snapshot", None)
    else:
        data.setdefault("lab_name_en_snapshot", "")
        data.setdefault("report_footer_snapshot", "")
        data.setdefault("report_logo_url_snapshot", None)

    # Field name aliases used in template
    data["diagnosis_summary"] = data.get("diagnosis") or data.get("diagnosis_summary") or ""
    data["gross_description_summary"] = data.get("gross_description") or data.get("gross_description_summary") or ""
    data["microscopic_summary"] = data.get("microscopic_description") or data.get("microscopic_summary") or ""
    data["comment_summary"] = data.get("comment") or data.get("comment_summary") or ""

    # registered_at + actual case status
    db_case_obj = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not data.get("registered_at"):
        data["registered_at"] = db_case_obj.registered_at if db_case_obj else None
    if not data.get("collect_at"):
        data["collect_at"] = db_case_obj.collect_at if db_case_obj else None
    if not data.get("department_name"):
        data["department_name"] = db_case_obj.department.name if (db_case_obj and db_case_obj.department) else None
    actual_case_status = db_case_obj.status if db_case_obj else None

    # Badge flags: DRAFT → PENDING APPROVAL → FINAL REPORT
    # is_draft: case not yet signed off
    # is_pending: only from value explicitly stored by pathologist at sign-off (default False = FINAL)
    data["is_draft"] = actual_case_status in ("registered", "screening", "screened")
    if data["is_draft"]:
        data["is_pending"] = False
    else:
        data.setdefault("is_pending", False)

    # Images
    images = (
        db.query(NongyneCaseImage)
        .filter(NongyneCaseImage.case_id == case_id, NongyneCaseImage.show_in_report == True)
        .order_by(NongyneCaseImage.order)
        .all()
    )
    data["all_nongyne_images"] = []
    for img in images:
        b64 = _get_image_base64(img.image_url)
        if b64:
            data["all_nongyne_images"].append({
                "base64": b64,
                "description": img.description or "",
            })

    return data


def get_nongyne_snapshot_pdf_data(db: Session, report: NongyneCytoReport) -> dict:
    """Build PDF data from a specific immutable report snapshot (ไม่ดึง live data)."""
    data = {c.name: getattr(report, c.name) for c in report.__table__.columns}

    if report.signers_snapshot:
        data["signers"] = report.signers_snapshot
    elif report.signers:
        data["signers"] = [
            {
                "full_name": s.user.full_name,
                "report_name": s.user.report_name,
                "role": s.role,
                "signed_at": s.signed_at,
            }
            for s in report.signers
        ]
    else:
        data["signers"] = [{
            "full_name": report.pathologist_name,
            "report_name": report.pathologist_name,
            "role": "primary",
            "signed_at": report.reported_at,
        }]

    data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")
    data["patient_age_display"] = (
        _calculate_patient_age(data["patient_birth_date"])["display"]
        if data["patient_birth_date"]
        else "-"
    )
    return _enrich_report_data(data, db, report.case_id)


def prepare_nongyne_report_pdf_data(db: Session, case_id: int):
    """เตรียมข้อมูล live สำหรับ Preview PDF (draft/pre-publish)"""
    data = prepare_nongyne_report_data(db, case_id)
    if not data:
        return None
    data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")
    data["patient_age_display"] = (
        _calculate_patient_age(data["patient_birth_date"])["display"]
        if data["patient_birth_date"]
        else "-"
    )
    return _enrich_report_data(data, db, case_id)


def process_nongyne_report_approval(
    db: Session, report_id: int, current_user: User, req: ReportApproveRequest
):
    db_report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
    if not db_report:
        return None

    action = req.action.upper().strip()
    now = local_now()

    if action in ["APPROVE", "APPROVED"]:
        db_report.status = NongyneReportStatus.PUBLISHED
        db_report.approved_at = now
        db_report.published_at = now

        signer = db.query(NongyneReportSigner).filter(
            NongyneReportSigner.report_id == report_id,
            NongyneReportSigner.user_id == current_user.id
        ).first()

        if not signer:
            signer = NongyneReportSigner(
                report_id=report_id,
                user_id=current_user.id,
                role="primary",
                assigned_at=now
            )
            db.add(signer)

        signer.signed_at = now
        signer.agreement = req.agreement
        signer.agreement_note = req.agreement_note

        if db_report.case_id is not None:
            db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = "published"
                db_case.report_at = now

    elif action in ["REJECT", "REQUEST_CHANGES"]:
        db_report.status = NongyneReportStatus.PENDING_APPROVAL

        if db_report.case_id is not None:
            db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = "screened"
                db_case.is_reported = False
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    log = CytoReportAuditLog(
        report_type="nongyne",
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action=action,
        comment=req.comment,
    )
    db.add(log)
    db.commit()
    db.refresh(db_report)
    return db_report


def get_pending_nongyne_reports(db: Session, skip: int = 0, limit: int = 20, search: str = None):
    from app.models.patient import Patient
    query = (
        db.query(NongyneCytoReport)
        .filter(NongyneCytoReport.status == NongyneReportStatus.PENDING_APPROVAL)
    )

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (NongyneCytoReport.accession_no.ilike(search_term)) |
            (NongyneCytoReport.patient_name.ilike(search_term)) |
            (NongyneCytoReport.patient_hn.ilike(search_term))
        )

    total = query.count()
    items = query.order_by(NongyneCytoReport.reported_at.desc()).offset(skip).limit(limit).all()
    current_page = (skip // limit) + 1 if limit > 0 else 1
    return {"items": items, "total": total, "page": current_page, "size": limit}


def get_pending_cosign_worklist_nongyne(
    db: Session, user_id: int, page: int = 1, size: int = 20, search: str = None
):
    query = (
        db.query(NongyneCytoReport)
        .join(NongyneReportSigner)
        .filter(
            NongyneReportSigner.user_id == user_id,
            NongyneReportSigner.signed_at == None,
            NongyneReportSigner.role != "primary",
            NongyneCytoReport.status != NongyneReportStatus.CANCELLED,
        )
    )
    if search:
        f = f"%{search}%"
        query = query.filter(
            or_(
                NongyneCytoReport.accession_no.ilike(f),
                NongyneCytoReport.patient_name.ilike(f),
                NongyneCytoReport.patient_hn.ilike(f),
            )
        )
    total = query.count()
    items = query.order_by(NongyneCytoReport.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": items, "total": total, "page": page, "size": size}


def process_nongyne_cosign(
    db: Session, report_id: int, current_user: User, req: ReportApproveRequest
):
    """Co-signer records signature + opinion without changing report status."""
    signer = (
        db.query(NongyneReportSigner)
        .filter(
            NongyneReportSigner.report_id == report_id,
            NongyneReportSigner.user_id == current_user.id,
            NongyneReportSigner.role != "primary",
        )
        .first()
    )
    if not signer:
        raise HTTPException(status_code=403, detail="You are not a co-signer on this report.")

    now = local_now()
    signer.signed_at = now
    signer.agreement = req.agreement
    signer.agreement_note = req.agreement_note

    log = CytoReportAuditLog(
        report_type="nongyne",
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action="COSIGNED",
        comment=req.comment,
    )
    db.add(log)
    db.commit()
    db_report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
    db.refresh(db_report)
    return db_report


def add_nongyne_signer(
    db: Session, report_id: int, user_id: int, role: str, consult_note: str | None, current_user: User
):
    """Add a co-signer to a nongyne report in pending_approval state."""
    report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.status != NongyneReportStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Report is not pending approval.")

    is_primary = (
        db.query(NongyneReportSigner)
        .filter(
            NongyneReportSigner.report_id == report_id,
            NongyneReportSigner.user_id == current_user.id,
            NongyneReportSigner.role == "primary",
        )
        .first()
    )
    if not is_primary:
        raise HTTPException(status_code=403, detail="Only the primary signer can add co-signers.")

    existing = (
        db.query(NongyneReportSigner)
        .filter(NongyneReportSigner.report_id == report_id, NongyneReportSigner.user_id == user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a signer.")

    signer = NongyneReportSigner(
        report_id=report_id,
        user_id=user_id,
        role=role,
        consult_note=consult_note,
        assigned_at=local_now(),
    )
    db.add(signer)
    db.commit()
    db.refresh(report)
    return report
