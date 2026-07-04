import random
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.crud.system_setting import get_settings as get_system_settings
from datetime import datetime
from zoneinfo import ZoneInfo
from app.utils.time import local_now
from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus, GyneReportType, GyneReportSigner
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_diagnosis import GyneDiagnosis
from app.models.gyne_case_image import GyneCaseImage
from app.models.user import User
from app.models.organization import Hospital
from app.models.system_setting import SystemSetting
from fastapi import HTTPException
from app.services import pdf_service
from dateutil.relativedelta import relativedelta
from datetime import date
from typing import List
import base64
from pathlib import Path

_BKK = ZoneInfo("Asia/Bangkok")


def _fmt_dt(val) -> str | None:
    """Normalize a datetime or ISO string to 'DD/MM/YYYY HH:MM' in Bangkok time."""
    if not val:
        return None
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            if dt.tzinfo:
                dt = dt.astimezone(_BKK).replace(tzinfo=None)
        except Exception:
            return val[:16].replace("T", " ")
    else:
        dt = val
    return dt.strftime("%d/%m/%Y %H:%M")


def get_report_by_id(db: Session, report_id: int):
    return db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()


def get_reports_by_case(db: Session, case_id: int):
    return (
        db.query(GyneCytoReport)
        .filter(GyneCytoReport.case_id == case_id)
        .order_by(GyneCytoReport.created_at.desc())
        .all()
    )


def get_all_reports(db: Session, skip: int = 0, limit: int = 20, search: str = None, status: str = None, is_print: bool = None):
    query = db.query(GyneCytoReport).join(GyneCytologyCase)

    if status:
        query = query.filter(GyneCytoReport.status == status)

    if is_print is not None:
        query = query.filter(GyneCytoReport.is_print == is_print)

    if search:
        search_term = f"%{search}%"
        from app.models.patient import Patient
        query = query.join(Patient, GyneCytologyCase.patient_id == Patient.id).filter(
            (GyneCytoReport.accession_no.ilike(search_term)) |
            (GyneCytologyCase.hn.ilike(search_term)) |
            (Patient.name.ilike(search_term))
        )

    total = query.count()
    items = query.order_by(GyneCytoReport.created_at.desc()).offset(skip).limit(limit).all()

    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {
        "items": items, 
        "total": total,
        "page": current_page,
        "size": limit
    }


def _calculate_patient_age(birth_date: date, ref_date: date = None) -> dict:
    """คำนวณอายุคนไข้โดยละเอียด"""
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


def prepare_gyne_report_data(db: Session, case_id: int):
    """รวบรวมข้อมูล Snapshot สำหรับสร้าง Report"""
    # 1. ข้อมูลเคส
    db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not db_case:
        return None
    
    # 2. ข้อมูลผลวินิจฉัยปัจจุบัน
    db_diag = (
        db.query(GyneDiagnosis)
        .filter(GyneDiagnosis.case_id == case_id, GyneDiagnosis.is_current == True)
        .first()
    )
    
    # 3. ข้อมูลระบบ (Lab Name, etc.)
    settings = db.query(SystemSetting).first()
    
    # ดึงค่าพยาธิแพทย์ (Snapshot จากคนเซ็น หรือเจ้าของเคส)
    pathologist_name = "Not Specified"
    pathologist_id = None
    
    cytotechnologist_name = None
    cytotechnologist_id = None
    
    signers_data = []

    # 🚩 New Logic: Use signers from Diagnosis Draft
    if db_diag and db_diag.signers:
        user_ids = [s['user_id'] for s in db_diag.signers]
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u for u in users}

        for s in db_diag.signers:
            u = user_map.get(s['user_id'])
            if u:
                s_obj = {
                    "user_id": u.id,
                    "full_name": u.full_name,
                    "report_name": u.report_name,
                    "role": s.get("role", "primary"),
                    "signed_at": _fmt_dt(s.get("signed_at")),
                }
                signers_data.append(s_obj)

                if s.get("role") == "primary":
                    pathologist_name = u.report_name or u.full_name
                    pathologist_id = u.id
                elif s.get("role") == "cytotechnologist":
                    cytotechnologist_name = u.report_name or u.full_name
                    cytotechnologist_id = u.id
    
    # Fallback to Case Pathologist if no signers in Diagnosis (Legacy support)
    elif db_case.pathologist:
        pathologist_name = db_case.pathologist.report_name or db_case.pathologist.full_name
        pathologist_id = db_case.pathologist_id
        
        # Add as primary signer for preview
        signers_data.append({
            "full_name": db_case.pathologist.full_name,
            "report_name": db_case.pathologist.report_name,
            "role": "primary",
            "signed_at": None
        })
        
    # เตรียมข้อมูล Snapshot ของคนไข้
    patient = db_case.patient
    
    # เตรียมข้อมูล Bethesda (Snapshot เป็น Text)
    adequacy_text = db_diag.adequacy_obj.text if db_diag and db_diag.adequacy_obj else None
    zone_text = db_diag.endocervical_status_obj.text if db_diag and db_diag.endocervical_status_obj else None
    quality_text = db_diag.quality_obj.text if db_diag and db_diag.quality_obj else None
    cat1_text = db_diag.category_1_obj.text if db_diag and db_diag.category_1_obj else None
    cat2_text = db_diag.category_2_obj.text if db_diag and db_diag.category_2_obj else None

    # คำนวณข้อมูอายุ (Simple logic for now, can be improved)
    # ในอนาคตอาจใช้เฮลเปอร์เดียวกับ Surgical
    patient_age = 0
    if patient and patient.birth_date:
        today = local_now()
        patient_age = today.year - patient.birth_date.year - ((today.month, today.day) < (patient.birth_date.month, patient.birth_date.day))

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
        
        # 🚩 Non-Model Fields (case-level, pop before creating GyneCytoReport)
        "specimen_type": db_case.specimen_type,
        "collection_site": db_case.collection_site,

        "adequacy_text": adequacy_text,
        "endocervical_status_text": zone_text,
        "quality_text": quality_text,
        "category_1_text": cat1_text,
        "category_2_text": cat2_text,
        
        "interpretation": db_diag.interpretation if db_diag else None,
        "note": db_diag.note if db_diag else None,
        
        "pathologist_id": pathologist_id,
        "pathologist_name": pathologist_name,
        
        "cytotechnologist_id": cytotechnologist_id,
        "cytotechnologist_name": cytotechnologist_name,
        "signers_snapshot": signers_data,
        
        "lab_name_snapshot": settings.lab_name_th if settings else "Pathology Lab",
        "lab_address_snapshot": settings.lab_address if settings else "",
        
        "registered_at": db_case.registered_at,
        "collect_at": db_case.collect_at,
        "report_type": GyneReportType.FINAL,
        "status": GyneReportStatus.PENDING_APPROVAL,
        "reported_at": local_now(),

        # 🚩 Non-Model Field (Must pop before creating model instance)
        "signers": signers_data
    }


def publish_gyne_report(
    db: Session,
    case_id: int,
    signers: List[dict] = None,
    current_user_id: int = None,
    is_abnormal: bool = False,
    is_out_lab_consult: bool = None,
    consult_reason: str = None,
):
    """สร้าง Snapshot และส่งเข้าสู่กระบวนการอนุมัติ (Pending) พร้อม 10% QC routing"""
    report_data = prepare_gyne_report_data(db, case_id)
    if not report_data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")

    # 🚩 Safeguard: don't trust the client-sent is_abnormal flag alone. On a
    # re-publish (e.g. revising an already-abnormal, already-reviewed case),
    # a stale/wrong frontend flag must not let it slip into the random NILM
    # QC pool. Re-derive from the current diagnosis's own category.
    db_diag_for_check = (
        db.query(GyneDiagnosis)
        .filter(GyneDiagnosis.case_id == case_id, GyneDiagnosis.is_current == True)
        .first()
    )
    category_is_abnormal = bool(
        db_diag_for_check
        and db_diag_for_check.category_1_obj
        and (db_diag_for_check.category_1_obj.code or "").startswith("3")
    )
    is_abnormal = bool(is_abnormal) or category_is_abnormal

    existing_count = db.query(GyneCytoReport).filter(GyneCytoReport.case_id == case_id).count()
    report_data["version_no"] = existing_count + 1

    if existing_count > 0:
        report_data["report_type"] = GyneReportType.REVISED

    report_data.pop("signers", None)
    report_data.pop("registered_at", None)
    report_data.pop("collect_at", None)
    report_data.pop("specimen_type", None)
    report_data.pop("collection_site", None)

    db_report = GyneCytoReport(**report_data)
    db.add(db_report)
    db.flush()

    if signers:
        for s in signers:
            signed_at_val = s.get("signed_at")
            if not signed_at_val and current_user_id and s["user_id"] == current_user_id:
                signed_at_val = local_now()
            new_signer = GyneReportSigner(
                report_id=db_report.id,
                user_id=s["user_id"],
                role=s.get("role", "primary"),
                signed_at=signed_at_val
            )
            db.add(new_signer)

    db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if db_case:
        db_case.is_reported = True
        db_case.report_at = local_now()

        was_consult_dispatched = (
            db_case.is_out_lab_consult and db_case.consult_status in ("processing", "received")
        )
        if is_out_lab_consult is not None:
            db_case.is_out_lab_consult = is_out_lab_consult
            if is_out_lab_consult and db_case.consult_status is None:
                db_case.consult_status = "pending"
        if consult_reason is not None:
            db_case.consult_reason = consult_reason
        if was_consult_dispatched:
            db_case.consult_status = "received"

        settings = db.query(SystemSetting).first()
        qc_enabled = settings.enable_gyne_qc_system if settings else False

        if is_abnormal:
            # Abnormal always requires pathologist review regardless of toggle
            db_case.needs_review = True
            db_case.review_reason = "abnormal"
            db_case.status = "pending_review"
        else:
            flagged_for_review = False

            # 🚩 A pathologist signing off IS the review — random NILM sampling
            # exists to catch missed abnormalities in a cytotechnologist's
            # unsupervised NILM call, so it doesn't apply when a pathologist
            # is the one publishing.
            publisher = (
                db.query(User).filter(User.id == current_user_id).first()
                if current_user_id
                else None
            )
            publisher_is_pathologist = bool(
                publisher
                and publisher.roles
                and any(
                    r in ("pathologist", "senior_pathologist")
                    for r in publisher.roles
                )
            )

            if qc_enabled and not publisher_is_pathologist:
                review_every_n = settings.nilm_review_every_n if settings else 10
                ct_user_id = db_case.cytotechnologist_id
                if not ct_user_id and signers:
                    for s in signers:
                        if s.get("role") == "cytotechnologist":
                            ct_user_id = s["user_id"]
                            break

                if ct_user_id and review_every_n and review_every_n > 0:
                    if random.random() < (review_every_n / 100.0):
                        db_case.needs_review = True
                        db_case.review_reason = "random_10pct"
                        db_case.status = "pending_review"
                        flagged_for_review = True

            if not flagged_for_review:
                # NILM not sampled (or QC disabled) → publish directly
                db_case.status = "published"
                db_report.status = GyneReportStatus.PUBLISHED
                db_report.published_at = local_now()

    db.commit()
    db.refresh(db_report)
    return db_report


def complete_gyne_review(
    db: Session,
    case_id: int,
    reviewer_id: int,
    review_result: str = "agree",
    review_note: str = None,
    discrepancy_level: str = None,
    is_out_lab_consult: bool = None,
    consult_reason: str = None,
):
    """Pathologist marks QC review done.
    agree    → publish directly (pathologist is the authority).
    disagree → send back to cytotech immediately (screened + report reset to draft).
    """
    db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    if db_case.status != "pending_review":
        raise HTTPException(status_code=400, detail="Case is not pending review")

    db_case.reviewed_by_id = reviewer_id
    db_case.reviewed_at = local_now()
    db_case.needs_review = False
    db_case.review_result = review_result
    db_case.review_note = review_note
    db_case.discrepancy_level = discrepancy_level if review_result == "disagree" else None

    latest_report = (
        db.query(GyneCytoReport)
        .filter(GyneCytoReport.case_id == case_id)
        .order_by(GyneCytoReport.created_at.desc())
        .first()
    )

    if review_result == "disagree":
        # Send back to cytotech for correction
        db_case.status = "screened"
        db_case.is_reported = False
        if latest_report:
            latest_report.status = GyneReportStatus.DRAFT
    else:
        # agree → pathologist's review IS the approval, publish directly.
        # Record the reviewer's actual signature time now — it was left null
        # when the cytotechnologist originally sent the case for review, so
        # the report doesn't show the pathologist as signing at send-time.
        was_consult_dispatched = (
            db_case.is_out_lab_consult and db_case.consult_status in ("processing", "received")
        )
        if is_out_lab_consult is not None:
            db_case.is_out_lab_consult = is_out_lab_consult
            if is_out_lab_consult and db_case.consult_status is None:
                db_case.consult_status = "pending"
        if consult_reason is not None:
            db_case.consult_reason = consult_reason
        if was_consult_dispatched:
            db_case.consult_status = "received"

        now = local_now()
        db_case.status = "published"
        if latest_report:
            latest_report.status = GyneReportStatus.PUBLISHED
            latest_report.published_at = now

            if latest_report.signers_snapshot:
                latest_report.signers_snapshot = [
                    {**s, "signed_at": _fmt_dt(now)}
                    if s.get("user_id") == reviewer_id
                    else s
                    for s in latest_report.signers_snapshot
                ]

            for signer_row in latest_report.signers:
                if signer_row.user_id == reviewer_id and not signer_row.signed_at:
                    signer_row.signed_at = now

        current_diag = (
            db.query(GyneDiagnosis)
            .filter(GyneDiagnosis.case_id == case_id, GyneDiagnosis.is_current == True)
            .first()
        )
        if current_diag and current_diag.signers:
            current_diag.signers = [
                {**s, "signed_at": now.isoformat()}
                if s.get("user_id") == reviewer_id
                else s
                for s in current_diag.signers
            ]

    db.commit()
    db.refresh(db_case)
    return db_case


def prepare_gyne_report_pdf_data(db: Session, case_id: int, is_preview: bool = False, report_id: int = None):
    """เตรียมข้อมูลสำหรับ Render PDF (ดึงจาก Snapshot ล่าสุด หรือเรียบเรียงจาก Case)"""
    # ตอน preview ให้ดึงจาก GyneDiagnosis ปัจจุบันเสมอ ไม่ใช่ snapshot เก่า
    if is_preview:
        report = None
    elif report_id:
        report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    else:
        report = (
            db.query(GyneCytoReport)
            .filter(GyneCytoReport.case_id == case_id)
            .order_by(GyneCytoReport.created_at.desc())
            .first()
        )

    if not report:
        # ถ้ายังไม่มีรายงาน (เช่น กำลัง Preview) ให้ใช้ prepare_gyne_report_data เป็นฐาน
        data = prepare_gyne_report_data(db, case_id)
        # ปรับรูปแบบวันที่ให้พร้อมแสดงผล
        data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")
        data["patient_age_display"] = _calculate_patient_age(data["patient_birth_date"])["display"] if data["patient_birth_date"] else "-"
        data["cytology_images"] = _embed_case_images(db, case_id)
        _enrich_gyne_settings_snapshot(data, db)
        return data

    # ถ้ามีรายงานแล้ว ให้แปลงเป็นดิคชันนารี
    data = {c.name: getattr(report, c.name) for c in report.__table__.columns}

    # Add case registered_at (report.created_at is report creation time, not registration)
    db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    data["registered_at"] = db_case.registered_at if db_case else None
    data["collect_at"] = db_case.collect_at if db_case else None
    data["specimen_type"] = db_case.specimen_type if db_case else None
    data["collection_site"] = db_case.collection_site if db_case else None

    # 🚩 Add Signers from Relationship to PDF Context
    if report.signers_snapshot:
        data["signers"] = [
            {**s, "signed_at": _fmt_dt(s.get("signed_at"))} for s in report.signers_snapshot
        ]
    elif report.signers:
        data["signers"] = [
            {
                "full_name": s.user.full_name,
                "report_name": s.user.report_name,
                "role": s.role,
                "signed_at": _fmt_dt(s.signed_at),
            }
            for s in report.signers
        ]
    else:
        # Fallback if no signers record (Legacy) -> Use snapshot pathologist_name
        data["signers"] = [{
            "full_name": report.pathologist_name,
            "report_name": report.pathologist_name,
            "role": "primary",
            "signed_at": _fmt_dt(report.reported_at),
        }]
    
    # เพิ่มเติมข้อมูลสำหรับการแสดงผล
    data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")
    data["patient_age_display"] = _calculate_patient_age(data["patient_birth_date"])["display"] if data["patient_birth_date"] else "-"
    
    _enrich_gyne_settings_snapshot(data, db)

    data["cytology_images"] = _embed_case_images(db, case_id)
    return data


def _enrich_gyne_settings_snapshot(data: dict, db: Session) -> dict:
    """Add lab name/address/footer/logo snapshot fields from current SystemSetting.
    Shared by both the live-preview (no report yet) and existing-report code paths."""
    settings = db.query(SystemSetting).first()
    if settings:
        data["lab_name_en_snapshot"] = settings.lab_name_en or settings.lab_name_th or ""
        data["lab_address_snapshot"] = settings.lab_address or ""
        data["report_footer_snapshot"] = settings.gyne_report_footer or settings.report_footer_text or ""
        if settings.report_logo_url:
            try:
                storage_root = Path(__file__).resolve().parent.parent.parent / "uploads"
                full_path = storage_root / settings.report_logo_url.removeprefix("/storage/")
                if full_path.exists():
                    with open(full_path, "rb") as f:
                        encoded = base64.b64encode(f.read()).decode("utf-8")
                        ext = full_path.suffix.lower().lstrip(".")
                        data["report_logo_url_snapshot"] = f"data:image/{ext};base64,{encoded}"
                else:
                    data.setdefault("report_logo_url_snapshot", None)
            except Exception:
                data.setdefault("report_logo_url_snapshot", None)
        else:
            data.setdefault("report_logo_url_snapshot", None)
    else:
        data.setdefault("lab_name_en_snapshot", "")
        data.setdefault("lab_address_snapshot", "")
        data.setdefault("report_footer_snapshot", "")
        data.setdefault("report_logo_url_snapshot", None)
    return data


def _embed_case_images(db: Session, case_id: int) -> list:
    """Return show_in_report images for case_id as base64 JPEG data-URI dicts."""
    from PIL import Image as PILImage
    import io as _io

    imgs = (
        db.query(GyneCaseImage)
        .filter(GyneCaseImage.case_id == case_id, GyneCaseImage.show_in_report == True)
        .order_by(GyneCaseImage.order)
        .all()
    )
    result = []
    storage_root = Path("uploads")
    for img in imgs:
        try:
            rel = img.image_url.removeprefix("/storage/")
            full_path = (storage_root / rel).resolve()
            if not full_path.is_file():
                continue
            with PILImage.open(full_path) as pil_img:
                if pil_img.width > 800:
                    ratio = 800 / pil_img.width
                    pil_img = pil_img.resize((800, int(pil_img.height * ratio)), PILImage.LANCZOS)
                if pil_img.mode in ("RGBA", "P", "LA"):
                    pil_img = pil_img.convert("RGB")
                buf = _io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=85)
                encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
            result.append({
                "data_uri": f"data:image/jpeg;base64,{encoded}",
                "description": img.description or "",
            })
        except Exception:
            continue
    return result


def get_gyne_report_pdf(db: Session, case_id: int, is_preview: bool = False, report_id: int = None):
    """สร้าง PDF Blob สำหรับ Gyne Cyto Report"""
    report_data = prepare_gyne_report_pdf_data(db, case_id, is_preview=is_preview, report_id=report_id)
    if not report_data:
        return None
        
    sys_settings = get_system_settings(db)
    active_template = f"reports/{sys_settings.gyne_report_template or 'gyne_cyto_report_template.html'}"
    pdf_blob = pdf_service.generate_pdf_blob(
        report_data,
        template_name=active_template,
        is_preview=is_preview
    )
    return pdf_blob


def get_pending_cosign_worklist_gyne(
    db: Session, user_id: int, page: int = 1, size: int = 20, search: str = None
):
    query = (
        db.query(GyneCytoReport)
        .join(GyneReportSigner)
        .filter(
            GyneReportSigner.user_id == user_id,
            GyneReportSigner.signed_at == None,
            GyneReportSigner.role != "primary",
            GyneCytoReport.status != GyneReportStatus.CANCELLED,
        )
    )
    if search:
        f = f"%{search}%"
        query = query.filter(
            or_(
                GyneCytoReport.accession_no.ilike(f),
                GyneCytoReport.patient_name.ilike(f),
                GyneCytoReport.patient_hn.ilike(f),
            )
        )
    total = query.count()
    items = query.order_by(GyneCytoReport.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": items, "total": total, "page": page, "size": size}
