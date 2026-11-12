from sqlalchemy import or_
from sqlalchemy.orm import Session
from datetime import datetime, date
from zoneinfo import ZoneInfo
from app.utils.time import local_now
from app.utils.signatures import reconcile_signatures
from app.utils.storage_paths import find_for_report
from app.utils.report_round_heading import round_heading_html
from app.models.nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus, NongyneReportType, NongyneReportSigner
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_case_image import NongyneCaseImage
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.cyto_approval_log import CytoReportAuditLog
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.crud.organization import resolve_lab_header
from app.crud.report_images import case_images_snapshot
from app.schemas.report_approval import ReportApproveRequest
from app.enums.case_states import NONGYNE_SPINE
from fastapi import HTTPException
from dateutil.relativedelta import relativedelta
from typing import List
import base64
import re
from app.crud import his_export_log as his_export_crud
from app.crud import outlab_consult_request as consult_crud
from app.crud import cyto_path_correlation as cyto_path_qc
from app.crud import nongyne_cyto_stain as nongyne_stain_crud

_BKK = ZoneInfo("Asia/Bangkok")

# The dashed rule surgical draws between rounds.
_ROUND_SEPARATOR = "<hr style='border: 0; border-top: 1px dashed #cbd5e1; margin: 8px 0;' />"


def build_nongyne_export_payload(report: "NongyneCytoReport") -> dict:
    """Structured export payload for outbound HIS delivery. Keeps report
    column knowledge local to this domain — app/his_export/ never needs to
    know nongyne-specific field names."""
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
        "clinical_diagnosis_text": report.clinical_diagnosis_snapshot,
        "specimen_type": report.specimen_type,
        "collection_site": report.collection_site,
        "gross_description_text": report.gross_description,
        "microscopic_text": report.microscopic_description,
        "diagnosis_text": report.diagnosis,
        "comment_text": report.comment,
        "pathologist_name": report.pathologist_name,
        "signers": report.signers_snapshot or [],
    }


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


def _stamp_snapshot_signed_at(report: "NongyneCytoReport", user_id: int, signed_at) -> None:
    """Update one signer's signed_at within report.signers_snapshot, if present."""
    if not report.signers_snapshot:
        return
    report.signers_snapshot = [
        {**s, "signed_at": _fmt_dt(signed_at)} if s.get("user_id") == user_id else s
        for s in report.signers_snapshot
    ]


def _resolve_signed_at(signer: dict, current_user_id: int | None):
    """The signature time a signer entry ends up with on publish: whatever the
    client already recorded, or now() for the person doing the publishing."""
    signed_at = signer.get("signed_at")
    if not signed_at and current_user_id and signer.get("user_id") == current_user_id:
        signed_at = local_now()
    return signed_at


def _verified_signers(
    db: Session, case_id: int, signers: List[dict] | None, current_user_id: int | None
) -> List[dict] | None:
    """Under 'Require All Signatures (Non-Gyne)', take each signer's signed_at
    from the diagnosis on record rather than the request, so nobody can sign
    for someone else (see app/utils/signatures.py). Off → the request as-is."""
    settings = db.query(SystemSetting).first()
    if not (settings and settings.require_all_non_gyne_sign) or not signers:
        return signers
    current_diag = (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id == case_id, NongyneDiagnosis.is_current.is_(True))
        .first()
    )
    return reconcile_signatures(
        signers,
        current_diag.signers if current_diag else None,
        current_user_id,
        local_now(),
        actor_signs=True,
    )


def _reject_if_signatures_outstanding(
    db: Session, signers: List[dict] | None, current_user_id: int | None
) -> None:
    """Block a release while 'Require All Signatures (Non-Gyne)' is on and a
    listed signer still hasn't signed. Same 409 the approval-path gate in
    process_nongyne_report_approval() raises."""
    settings = db.query(SystemSetting).first()
    if not (settings and settings.require_all_non_gyne_sign):
        return
    pending = [s for s in (signers or []) if not _resolve_signed_at(s, current_user_id)]
    if not pending:
        return
    raise HTTPException(status_code=409, detail=_outstanding_detail(db, pending))


def _outstanding_detail(db: Session, pending: List[dict]) -> str:
    """Name who is still outstanding. A bare count tells the pathologist
    nothing they can act on — the Signatories card can hold several rows and
    they cannot tell from a number which one is holding up the sign-out."""
    names = {
        u.id: (u.report_name or u.full_name)
        for u in db.query(User)
        .filter(User.id.in_([s.get("user_id") for s in pending]))
        .all()
    }
    labels = [
        f"{names.get(s.get('user_id')) or 'user ' + str(s.get('user_id'))}"
        f" ({s.get('role') or 'primary'})"
        for s in pending
    ]
    return "Cannot publish — still waiting on a signature from: " + ", ".join(labels)


def get_report_by_id(db: Session, report_id: int):
    return db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()


def get_reports_by_case(db: Session, case_id: int):
    return (
        db.query(NongyneCytoReport)
        .filter(NongyneCytoReport.case_id == case_id)
        .order_by(NongyneCytoReport.created_at.desc())
        .all()
    )


def get_all_reports(db: Session, skip: int = 0, limit: int = 20, search: str = None, status: str = None, is_print: bool = None, unprinted_first: bool = False):
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
    # The print queue asks for everything still waiting to be printed up front,
    # newest first within each group.
    order_by = [NongyneCytoReport.created_at.desc()]
    if unprinted_first:
        order_by.insert(0, NongyneCytoReport.is_print.asc())
    items = query.order_by(*order_by).offset(skip).limit(limit).all()
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

    # Same round headings as surgical (DIAGNOSIS / ADDENDUM / REVISED REPORT,
    # dated to the minute), in the order the cumulative setting asks for.
    if is_cumulative:
        newest_first = settings.cumulative_report_newest_first if settings else True
        rounds = list(reversed(all_diags)) if newest_first else all_diags
    else:
        rounds = [db_diag] if db_diag else []

    diagnosis_html = (
        _ROUND_SEPARATOR.join(
            round_heading_html(
                [d.entry_type],
                d.diagnosis_at or d.created_at or local_now(),
                d.entry_type,
                d.revision_reason,
            )
            + f"<div>{d.diagnosis or ''}</div>"
            for d in rounds
        )
        if rounds
        else None
    )

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
        # Consult covers this round prints (rendered from the consult rows).
        "consult_ids_snapshot": consult_crud.printable_consult_ids(db, "nongyne", db_case.id),
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
        "has_critical": db_case.has_critical or False,

        "pathologist_id": pathologist_id,
        "pathologist_name": pathologist_name,
        "cytotechnologist_id": cytotechnologist_id,
        "cytotechnologist_name": cytotechnologist_name,
        "signers_snapshot": signers_data,

        "lab_name_snapshot": settings.lab_name_th if settings else "Pathology Lab",
        **_current_lab_header(db_case.hospital, settings),

        "report_type": NongyneReportType.FINAL,
        "status": NongyneReportStatus.PENDING_APPROVAL,
        "reported_at": local_now(),

        # Must pop before creating model instance
        "signers": signers_data
    }


def publish_nongyne_report(
    db: Session,
    case_id: int,
    signers: List[dict] = None,
    current_user_id: int = None,
    is_pending: bool = False,
    pending_reason: str = None,
    is_out_lab_consult: bool = None,
    consult_reason: str = None,
):
    """สร้าง Snapshot และส่งเข้าสู่กระบวนการอนุมัติ (หรือ publish ตรงถ้า enable_non_gyne_approve_system ปิดอยู่)"""
    report_data = prepare_nongyne_report_data(db, case_id)
    if not report_data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")

    # "Require All Signatures (Non-Gyne)" has to be enforced here, not only in
    # process_nongyne_report_approval() — that gate is unreachable whenever
    # enable_non_gyne_approve_system is off, which is the path that publishes
    # the report outright. Rejecting up front (rather than parking the report
    # in pending_approval) is deliberate: nothing in the app calls the
    # /cosign endpoint, so a held report would have no way back out.
    # Judged on the signatures on record, not the ones the request claims.
    signers = _verified_signers(db, case_id, signers, current_user_id)
    _reject_if_signatures_outstanding(db, signers, current_user_id)

    # Nothing goes out while a consult is out of the lab or its result hasn't
    # been approved — the approver signs the printed cover.
    consult_crud.assert_releasable(db, "nongyne", case_id)

    existing_count = db.query(NongyneCytoReport).filter(NongyneCytoReport.case_id == case_id).count()
    report_data["version_no"] = existing_count + 1

    if existing_count > 0:
        report_data["report_type"] = NongyneReportType.REVISED

    report_data.pop("signers", None)
    report_data["is_pending"] = is_pending
    report_data["pending_reason"] = pending_reason if is_pending else None

    settings = db.query(SystemSetting).first()
    approve_enabled = settings.enable_non_gyne_approve_system if settings else False
    if not approve_enabled:
        report_data["status"] = NongyneReportStatus.PUBLISHED
        report_data["published_at"] = local_now()

    report_data["images_snapshot"] = _case_report_images(db, case_id)

    db_report = NongyneCytoReport(**report_data)
    db.add(db_report)
    db.flush()

    if signers:
        user_map = {
            u.id: u
            for u in db.query(User).filter(User.id.in_([s["user_id"] for s in signers])).all()
        }
        snapshot_signers = []
        diag_signers = []
        for s in signers:
            signed_at_val = _resolve_signed_at(s, current_user_id)

            diag_signers.append({
                "user_id": s["user_id"],
                "role": s.get("role", "primary"),
                # signed_at has to survive onto the diagnosis copy, not just the
                # report: the pathologist worklist's exclude_signed_by filter
                # matches `@.signed_at != null` against this JSON, and the
                # Signatories card reads it back from here on every page load.
                "signed_at": (
                    signed_at_val.isoformat()
                    if isinstance(signed_at_val, datetime)
                    else signed_at_val
                ),
            })

            new_signer = NongyneReportSigner(
                report_id=db_report.id,
                user_id=s["user_id"],
                role=s.get("role", "primary"),
                signed_at=signed_at_val
            )
            db.add(new_signer)

            u = user_map.get(s["user_id"])
            if u:
                snapshot_signers.append({
                    "user_id": u.id,
                    "full_name": u.full_name,
                    "report_name": u.report_name,
                    "role": s.get("role", "primary"),
                    "signed_at": _fmt_dt(signed_at_val),
                })

        # 🚩 Use the actual signer list (with real signed_at) for the snapshot —
        # prepare_nongyne_report_data() only seeds two null-placeholder entries
        # from the case's assigned pathologist/cytotechnologist, which never
        # reflect who actually signed or when.
        db_report.signers_snapshot = snapshot_signers

    # Stamp signers onto the current diagnosis for worklist filtering
    if signers:
        from app.models.nongyne_diagnosis import NongyneDiagnosis
        current_diag = (
            db.query(NongyneDiagnosis)
            .filter(NongyneDiagnosis.case_id == case_id, NongyneDiagnosis.is_current.is_(True))
            .first()
        )
        if current_diag:
            current_diag.signers = diag_signers
            db.add(current_diag)

    # "Result is out" for the case's IHC / special stains: this is the
    # pathologist's sign-off — and the publish too when there's no approval
    # step (process_nongyne_report_approval releases them otherwise).
    signed_at = db_report.reported_at or local_now()
    nongyne_stain_crud.mark_case_stains_reported(db, case_id, signed_at, include_unreviewed=not is_pending)
    if not approve_enabled:
        nongyne_stain_crud.mark_case_stains_released(db, case_id, db_report.published_at or signed_at)

    db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if db_case:
        db_case.is_reported = True
        db_case.is_pending = is_pending
        db_case.pending_reason = pending_reason if is_pending else None
        db_case.report_at = local_now()
        db_case.status = "published" if not approve_enabled else "pending_approval"

        if is_out_lab_consult is not None or consult_reason is not None:
            consult_crud.apply_case_flag(
                db, "nongyne", db_case,
                flag=is_out_lab_consult, reason=consult_reason, user_id=current_user_id,
            )
        # Every approved consult goes out on this round — it's already in the
        # snapshot's consult_ids_snapshot. A flag raised just now opens round 1
        # as "requested", which this leaves alone.
        consult_crud.mark_released(db, "nongyne", case_id, db_report.id)

        if not approve_enabled:
            his_export_crud.enqueue(
                db,
                resource_type="NongyneCytoReport",
                resource_id=db_report.id,
                accession_no=db_report.accession_no,
                payload_snapshot=build_nongyne_export_payload(db_report),
            )

        # Freeze the signed-out diagnosis next to whatever the cytotech
        # screened, so the two are still comparable after the fact. Under the
        # approve workflow the case isn't published yet, but the pathologist's
        # text is final here — an approver rejecting it sends the case back and
        # the next publish overwrites this side.
        cyto_path_qc.safe_capture_final(
            db,
            case_type="nongyne",
            case=db_case,
            pathologist_id=current_user_id,
        )

    db.commit()
    db.refresh(db_report)
    return db_report


def _get_image_base64(image_url: str, max_width: int = 800) -> str | None:
    try:
        from PIL import Image
        import io
        file_path = find_for_report(image_url, "non-gyne image")
        if not file_path:
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


def _is_blank_richtext(html: str | None) -> bool:
    """True if rich-text HTML has no visible content (e.g. just empty <p></p> tags)."""
    if not html:
        return True
    return re.sub(r"<[^>]*>", "", html).replace("&nbsp;", "").strip() == ""


def _current_lab_header(hospital, settings) -> dict:
    """Lab name/address/footer/logo as current settings would draw them — the case's
    hospital when it has use_custom_report_header, else the master SystemSetting.
    Frozen onto the report at publish; also the fallback for reports signed before
    the header was snapshotted."""
    name_en, address, logo_path = resolve_lab_header(hospital, settings)
    return {
        "lab_name_en_snapshot": name_en,
        "lab_address_snapshot": address,
        "report_footer_snapshot": (
            (settings.nongyne_report_footer or settings.report_footer_text or "") if settings else ""
        ),
        # "" rather than None so "issued with no logo" stays distinct from a
        # pre-snapshot row (NULL).
        "report_logo_path_snapshot": logo_path or "",
    }


def _case_report_images(db: Session, case_id: int) -> list:
    """The case's current show_in_report images, as images_snapshot entries."""
    images = (
        db.query(NongyneCaseImage)
        .filter(NongyneCaseImage.case_id == case_id, NongyneCaseImage.show_in_report == True)
        .order_by(NongyneCaseImage.order)
        .all()
    )
    return case_images_snapshot(images)


def _enrich_report_data(data: dict, db: Session, case_id: int, images: list | None = None) -> dict:
    """Add template variables that are missing from snapshot/preview data.

    `images` is a report's images_snapshot; None draws the case's current
    images (a preview, or a report published before that column existed)."""
    db_case_obj = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()

    # The header frozen on the report at publish wins. A report signed before that
    # (report_logo_path_snapshot NULL — its stored address was the master one even
    # for custom-header hospitals) follows current settings instead. Preview data
    # already carries the current header.
    if data.get("report_logo_path_snapshot") is None:
        settings = db.query(SystemSetting).first()
        data["lab_name_snapshot"] = (settings.lab_name_th or "") if settings else ""
        data.update(_current_lab_header(db_case_obj.hospital if db_case_obj else None, settings))

    # Logo base64
    logo_url = data["report_logo_path_snapshot"]
    if logo_url:
        try:
            full_path = find_for_report(logo_url, "logo")
            if full_path:
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

    # Field name aliases used in template
    data["diagnosis_summary"] = data.get("diagnosis") or data.get("diagnosis_summary") or ""

    raw_gross = data.get("gross_description") or data.get("gross_description_summary") or ""
    data["gross_description_summary"] = "" if _is_blank_richtext(raw_gross) else raw_gross

    raw_micro = data.get("microscopic_description") or data.get("microscopic_summary") or ""
    data["microscopic_summary"] = "" if _is_blank_richtext(raw_micro) else raw_micro

    raw_comment = data.get("comment") or data.get("comment_summary") or ""
    data["comment_summary"] = "" if _is_blank_richtext(raw_comment) else raw_comment

    # registered_at + actual case status
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
    # เดิมเขียนคาไว้เป็น ("registered", "screening", "screened") ซึ่งตก "stained"
    # กับ "slide sent" ไป เคสที่ยังอยู่สองขั้นนั้นจึงไม่ถูกนับเป็น draft และไปโผล่
    # เป็น FINAL REPORT ทั้งที่ยังไม่มีใครออกผล ("screening" ไม่มีโค้ดไหนเขียนเลย)
    data["is_draft"] = actual_case_status in NONGYNE_SPINE
    if data["is_draft"]:
        data["is_pending"] = False
    else:
        data.setdefault("is_pending", False)

    # Images
    if images is None:
        images = _case_report_images(db, case_id)
    data["all_nongyne_images"] = []
    for img in images:
        b64 = _get_image_base64(img["image_url"])
        if b64:
            data["all_nongyne_images"].append({
                "base64": b64,
                "description": img.get("description") or "",
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
                "signed_at": _fmt_dt(s.signed_at),
            }
            for s in report.signers
        ]
    else:
        data["signers"] = [{
            "full_name": report.pathologist_name,
            "report_name": report.pathologist_name,
            "role": "primary",
            "signed_at": _fmt_dt(report.reported_at),
        }]

    data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")
    data["patient_age_display"] = (
        _calculate_patient_age(data["patient_birth_date"])["display"]
        if data["patient_birth_date"]
        else "-"
    )
    return _enrich_report_data(data, db, report.case_id, images=report.images_snapshot)


def get_nongyne_report_pdf(db: Session, report: NongyneCytoReport) -> bytes:
    """PDF bytes for a specific published report snapshot — the counterpart
    of gyne's get_gyne_report_pdf(), used by both the report-download router
    and the HIS export worker so the two never drift apart."""
    from app.crud.system_setting import get_settings as get_system_settings
    from app.services import pdf_service

    data = get_nongyne_snapshot_pdf_data(db, report)
    settings = get_system_settings(db)
    active_template = f"reports/{settings.nongyne_report_template or 'nongyne_cyto_report_template.html'}"
    pdf_blob = pdf_service.generate_pdf_blob(data, template_name=active_template, is_preview=False)
    from app.services.consult_cover import prepend_consult_covers

    return prepend_consult_covers(db, pdf_blob, data, case_type="nongyne", case_id=report.case_id)


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
        settings = db.query(SystemSetting).first()
        if settings and settings.require_all_non_gyne_sign:
            pending = (
                db.query(NongyneReportSigner)
                .filter(
                    NongyneReportSigner.report_id == report_id,
                    NongyneReportSigner.signed_at.is_(None),
                    NongyneReportSigner.user_id != current_user.id,
                )
                .all()
            )
            if pending:
                raise HTTPException(
                    status_code=409,
                    detail=_outstanding_detail(
                        db, [{"user_id": s.user_id, "role": s.role} for s in pending]
                    ),
                )

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
        _stamp_snapshot_signed_at(db_report, current_user.id, now)

        # Enqueue after _stamp_snapshot_signed_at above, so the export
        # payload's signer list reflects the signature that was just
        # recorded rather than a stale pre-sync snapshot. Deliberately not
        # nested inside the case_id lookup below — the report itself
        # reaching PUBLISHED is the real terminal condition.
        his_export_crud.enqueue(
            db,
            resource_type="NongyneCytoReport",
            resource_id=db_report.id,
            accession_no=db_report.accession_no,
            payload_snapshot=build_nongyne_export_payload(db_report),
        )

        if db_report.case_id is not None:
            # The stains this sign-off carried reach the clinician now.
            nongyne_stain_crud.mark_case_stains_released(db, db_report.case_id, now)
            db_case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = "published"
                db_case.report_at = now
                # Re-freeze: an approver can be the first to see the case reach
                # a terminal state, and the diagnosis may have been revised
                # between publish and approval.
                cyto_path_qc.safe_capture_final(
                    db,
                    case_type="nongyne",
                    case=db_case,
                    pathologist_id=db_report.pathologist_id,
                )

    elif action in ["REJECT", "REQUEST_CHANGES"]:
        db_report.status = NongyneReportStatus.DRAFT

        if db_report.case_id is not None:
            # The sign-off didn't go out: its stains wait for the next one.
            nongyne_stain_crud.unmark_unreleased_stains(db, db_report.case_id)
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
    _stamp_snapshot_signed_at(signer.report, current_user.id, now)

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
