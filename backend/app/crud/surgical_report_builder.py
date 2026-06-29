from pathlib import Path
import os
import base64
import io
import logging
import re
from PIL import Image
from sqlalchemy.orm import Session
from datetime import date
from app.utils.time import local_now
from dateutil.relativedelta import relativedelta
from collections import defaultdict
from app.models.surgical_case import SurgicalCase
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport, ReportStatus, ReportType, ReportSigner
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.models.tumor_registry import TumorRegistry

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_BASE = BASE_DIR / "uploads"

GROSS_UPLOAD_DIR = STORAGE_BASE / "gross_images"
MICRO_UPLOAD_DIR = STORAGE_BASE / "microscopic_images"


def _darken_hex(hex_color: str, factor: float = 0.65) -> str:
    """Return a darkened version of a hex color (e.g. #0056b3 → #003a8c)."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def get_image_base64_from_path(file_path: str, max_width: int = 1024):
    """
    แปลงไฟล์ภาพเป็น Base64 พร้อมย่อขนาดอัตโนมัติ
    เพื่อป้องกันปัญหา PDF Generator ค้างจากข้อมูลที่หนักเกินไป
    """
    if not file_path or not os.path.exists(file_path):
        return None

    try:
        with Image.open(file_path) as img:
            # Flatten any transparency onto white before converting to JPEG.
            # Direct convert("RGB") fills transparent pixels with black — use
            # paste-with-mask instead so transparent areas become white (paper colour).
            if img.mode in ("RGBA", "LA"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.getchannel("A"))
                img = bg
            elif img.mode == "P":
                img = img.convert("RGBA")
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.getchannel("A"))
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")

            if img.width > max_width:
                ratio = max_width / float(img.width)
                new_height = int(float(img.height) * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=75, optimize=True)

            encoded_string = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return f"data:image/jpeg;base64,{encoded_string}"

    except Exception as e:
        logger.error("Error encoding image: %s", e)
        return None


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


def _build_submitted_text(label: str, is_entirely_submitted: bool, blocks: list) -> str:
    """Build the 'Representative sections are submitted: A1(3, desc), A2...' line."""
    if not blocks:
        return ""
    prefix = "Entirely submitted" if is_entirely_submitted else "Representative sections are submitted"
    parts = []
    for b in blocks:
        code = f"{label}{b['block_no']}"
        desc = (b.get("tissue_description") or "").strip()
        tc = b.get("tissue_count")
        if b.get("is_tissue_uncountable"):
            parts.append(f"{code}(multiple fragments{', ' + desc if desc else ''})")
        elif tc and desc:
            parts.append(f"{code}({tc}, {desc})")
        elif tc:
            parts.append(f"{code}({tc})")
        elif desc:
            parts.append(f"{code}({desc})")
        else:
            parts.append(code)
    return f"{prefix}: {', '.join(parts)}"


def _prepare_specimen_and_images(
    db: Session, db_case, active_specimen_ids, STORAGE_BASE
):
    spec_texts = []
    gross_images_payload = []
    micro_images_payload = []

    sorted_specimens = sorted(db_case.specimens, key=lambda x: x.specimen_label or "")
    active_specimens = [
        s for s in sorted_specimens
        if active_specimen_ids is None or s.id in active_specimen_ids
    ]

    for s in active_specimens:
        label = s.specimen_label or ""
        name = s.specimen_name or ""
        spec_texts.append(f"{label}: {name}")

        if hasattr(s, "gross_images") and s.gross_images:
            for g_img in s.gross_images:
                if getattr(g_img, "show_in_report", True) is False:
                    continue
                rel_url = g_img.image_url.removeprefix("/storage/")
                g_path = BASE_DIR / "uploads" / rel_url
                if g_path.exists():
                    g_b64 = get_image_base64_from_path(str(g_path), max_width=600)
                    if g_b64:
                        gross_images_payload.append(
                            {
                                "base64": g_b64,
                                "image_url": g_img.image_url,
                                "label": s.specimen_label,
                            }
                        )

        if hasattr(s, "microscopic_images") and s.microscopic_images:
            for m_img in s.microscopic_images:
                if getattr(m_img, "show_in_report", True) is False:
                    continue
                m_path = BASE_DIR / "uploads" / m_img.image_url.removeprefix("/storage/")
                m_b64 = get_image_base64_from_path(str(m_path), max_width=800)
                if m_b64:
                    micro_images_payload.append(
                        {
                            "base64": m_b64,
                            "image_url": m_img.image_url,
                            "label": s.specimen_label,
                            "desc": getattr(m_img, "description", "-"),
                            "mag": getattr(m_img, "magnification", "-"),
                            "stain": getattr(m_img, "stain", "-"),
                        }
                    )

    gross_footer_parts = []
    if db_case.gross_examiner_id:
        ex = db.query(User).filter(User.id == db_case.gross_examiner_id).first()
        if ex:
            gross_footer_parts.append(f"Examiner: {ex.report_name or ex.name}")
    if db_case.gross_assistant_id:
        asst = db.query(User).filter(User.id == db_case.gross_assistant_id).first()
        if asst:
            gross_footer_parts.append(f"Assistant: {asst.report_name or asst.name}")
    if db_case.gross_at:
        gross_footer_parts.append(
            f"Date of Examination: {db_case.gross_at.strftime('%d/%m/%Y')}"
        )
    gross_footer_text = (
        f"<br/><i>({', '.join(gross_footer_parts)})</i>" if gross_footer_parts else ""
    )

    submitted_sections = []
    for s in active_specimens:
        blocks = (
            db.query(SurgicalBlock)
            .filter(SurgicalBlock.specimen_id == s.id)
            .order_by(SurgicalBlock.block_no.asc())
            .all()
        )
        submitted_sections.append({
            "specimen_label": s.specimen_label or "",
            "specimen_name": s.specimen_name or "",
            "is_entirely_submitted": bool(getattr(s, "is_entirely_submitted", False)),
            "blocks": [
                {
                    "block_no": b.block_no,
                    "tissue_count": b.tissue_count,
                    "tissue_description": b.tissue_description or "",
                    "is_tissue_uncountable": bool(b.is_tissue_uncountable),
                }
                for b in blocks
            ],
        })

    gross_combined = []
    for s, ss in zip(active_specimens, submitted_sections):
        label = ss["specimen_label"]
        name = ss["specimen_name"]
        if s.gross_description:
            clean_gross = re.sub(r"<p>(.*?)</p>", lambda m: m.group(1) + "<br/>", s.gross_description.strip(), flags=re.DOTALL)
            clean_gross = re.sub(r"(<br\s*/?>){2,}", "<br/>", clean_gross)
            clean_gross = clean_gross.strip().rstrip("<br/>").rstrip("<br />")
            gross_text = f"<b>{label}: {name}</b><br/>{clean_gross}"
        else:
            gross_text = f"<b>{label}: {name}</b>"

        submitted_line = _build_submitted_text(label, ss["is_entirely_submitted"], ss["blocks"])
        if submitted_line:
            gross_text += f"<br/>{submitted_line}"

        gross_combined.append(gross_text)

    gross_summary = "<br/>".join(gross_combined)
    if gross_footer_text:
        gross_summary += gross_footer_text

    return {
        "spec_summary": "\n".join(spec_texts),
        "gross_summary": gross_summary,
        "gross_images": gross_images_payload,
        "micro_images": micro_images_payload,
        "sorted_specimens": sorted_specimens,
        "submitted_sections": submitted_sections,
    }


def _get_grouped_diagnoses(db: Session, case_id: int):
    all_raw_diags = (
        db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.case_id == case_id).all()
    )

    final_list = [d for d in all_raw_diags if d.status == "signed"]

    draft_map = {}
    for d in all_raw_diags:
        if d.status == "draft":
            key = d.surgical_specimen_id if d.surgical_specimen_id else "integrated"
            if key not in draft_map or d.id > draft_map[key].id:
                draft_map[key] = d

    final_list.extend(draft_map.values())

    order_groups = defaultdict(list)
    for d in final_list:
        order_groups[d.diagnosis_order].append(d)

    return order_groups


def _get_microscopic_summary(order_groups):
    latest_micro = {}

    for order in sorted(order_groups.keys()):
        for d in order_groups[order]:
            raw_text = d.microscopic_description or ""
            strip_html = re.sub(r"<[^>]*>", "", raw_text).replace("&nbsp;", "").strip()

            if strip_html and d.specimen:
                clean = re.sub(r"<p>(.*?)</p>", lambda m: m.group(1) + "<br/>", raw_text.strip(), flags=re.DOTALL)
                clean = re.sub(r"(<br\s*/?>){2,}", "<br/>", clean)
                clean = clean.strip().rstrip("<br/>").rstrip("<br />")
                latest_micro[d.surgical_specimen_id] = {
                    "label": d.specimen.specimen_label or "",
                    "name": d.specimen.specimen_name or "",
                    "text": clean,
                }

    if not latest_micro:
        return None

    sorted_ids = sorted(latest_micro.keys(), key=lambda x: latest_micro[x]["label"])

    micro_texts = [
        f"<b>{latest_micro[sid]['label']}: {latest_micro[sid]['name']}</b><br/>{latest_micro[sid]['text']}"
        for sid in sorted_ids
    ]

    return "<br/>".join(micro_texts)


def _get_diagnosis_html_summary(
    db: Session,
    db_case,
    order_groups: dict,
    current_mode: str,
    spec_data: dict,
    show_specimen_name: bool,
    cumulative_sort_direction: str = "desc",
    is_cumulative: bool = True,
):
    diag_texts = []
    comment_texts = []
    all_micro_images = []
    ROLE_PRIORITY = {"primary": 1, "consultant": 2, "co-signer": 3, "resident": 4}

    all_sorted_orders = sorted(
        order_groups.keys(), reverse=(cumulative_sort_direction == "desc")
    )

    display_orders = all_sorted_orders if is_cumulative else all_sorted_orders[:1]

    for order in display_orders:
        raw_items = order_groups[order]

        is_integrated_round = any(
            str(d.diagnosis_level).endswith("CASE") for d in raw_items
        )
        round_mode = "integrated" if is_integrated_round else "individual"
        if current_mode == "clean" and is_integrated_round:
            round_mode = "clean"

        if round_mode in ["clean", "integrated"]:
            case_items = [d for d in raw_items if d.surgical_specimen_id is None]
            diags_in_order = (
                [sorted(case_items, key=lambda x: x.id, reverse=True)[0]]
                if case_items
                else raw_items
            )
        else:
            diags_in_order = sorted(
                [d for d in raw_items if d.surgical_specimen_id is not None],
                key=lambda x: x.specimen.specimen_label if x.specimen else "",
            )

        if not diags_in_order:
            continue

        first_diag = diags_in_order[0]
        entry_label = "DIAGNOSIS"
        all_types = [d.entry_type for d in diags_in_order if d.entry_type]
        for t in ["Revised", "Corrected", "Addendum"]:
            if t in all_types:
                entry_label = t.upper()
                break

        fmt_date = (first_diag.diagnosis_at or local_now()).strftime(
            "%d/%m/%Y %H:%M"
        )
        reason_inline = (
            f" ({first_diag.entry_type} Reason: {first_diag.revision_reason})"
            if (
                first_diag.entry_type in ["Revised", "Corrected"]
                and first_diag.revision_reason
            )
            else ""
        )

        diag_texts.append(
            f"<div style='margin-top: 12px; margin-bottom: 6px;'>"
            f"<b style='font-size: 13px;'>{entry_label} REPORT</b> "
            f"<small style='color: #666;'>(Dated: {fmt_date})</small>{reason_inline}</div>"
        )

        all_available_labels = sorted(
            [
                s.specimen_label
                for s in spec_data.get("sorted_specimens", [])
                if s.specimen_label
            ]
        )
        if all_available_labels:
            label_range = (
                f"{all_available_labels[0]}-{all_available_labels[-1]}"
                if len(all_available_labels) > 1
                else all_available_labels[0]
            )
        else:
            label_range = "Unknown"

        for d in diags_in_order:
            spec = d.specimen
            spec_display = ""

            if round_mode == "clean":
                spec_display = ""
            elif round_mode == "integrated":
                spec_display = f"<b>{label_range}:</b>"
            else:
                if spec:
                    spec_display = (
                        f"<b>{spec.specimen_label}: {spec.specimen_name}</b>"
                        if show_specimen_name
                        else f"<b>{spec.specimen_label}:</b>"
                    )
                else:
                    spec_display = f"<b>{label_range}:</b>"

            clean_diag = (
                (d.diagnosis or "").replace("</p>", "<br/>").replace("<p>", "").strip()
            )
            if clean_diag.endswith("<br/>"):
                clean_diag = clean_diag[:-5]

            sep = " " if round_mode == "clean" or not show_specimen_name else "<br/>"
            diag_texts.append(
                f"<div style='margin-bottom: 8px; line-height: 1.4;'><b style='display: inline;'>{spec_display}</b><span>{sep}{clean_diag}</span></div>"
            )

            if d.comment:
                comment_label = (
                    "Integrated"
                    if round_mode == "integrated"
                    else (spec.specimen_label if spec else "Unknown")
                )
                comment_texts.append(
                    f"<b>{comment_label} ({entry_label}):</b> {d.comment}"
                )

            if (
                order == all_sorted_orders[0]
                and spec
                and hasattr(spec, "microscopic_images")
            ):
                for img in spec.microscopic_images:
                    if not any(
                        x["image_url"] == img.image_url for x in all_micro_images
                    ):
                        all_micro_images.append(
                            {
                                "image_url": img.image_url,
                                "magnification": img.magnification,
                                "stain": img.stain,
                            }
                        )

        signers = (
            db.query(ReportSigner)
            .join(SurgicalReport)
            .filter(
                SurgicalReport.case_id == db_case.id,
                SurgicalReport.status != "cancelled",
                ReportSigner.diagnosis_order == order,
            )
            .all()
        )

        if signers:
            signers.sort(key=lambda x: ROLE_PRIORITY.get(x.role, 99))
            names_str = ", ".join(
                [
                    f"{s.user.report_name or s.user.full_name} ({s.role.capitalize()})"
                    for s in signers
                ]
            )
            diag_texts.append(
                f"<div style='font-size: 11px; color: #475569;'><i>Digitally Signed by: {names_str}</i></div>"
            )
            diag_texts.append(
                "<hr style='border: 0; border-top: 1px dashed #cbd5e1; margin: 8px 0;' />"
            )

    return {
        "diagnosis_html": "".join(diag_texts),
        "comment_summary": "<br/>".join(comment_texts),
        "micro_images": all_micro_images,
        "latest_order": all_sorted_orders[0] if all_sorted_orders else None,
    }


def _get_icd_o_for_report(db: Session, case_id: int) -> dict | None:
    tr = db.query(TumorRegistry).filter(TumorRegistry.surgical_case_id == case_id).first()
    if not tr:
        return None
    if not tr.topography_code and not tr.morphology_code:
        return None
    return {
        "topography_code": tr.topography_code,
        "topography_desc": tr.topography_desc,
        "morphology_code": tr.morphology_code,
        "morphology_desc": tr.morphology_desc,
        "grade": tr.grade,
        "pt": tr.pt,
        "pn": tr.pn,
        "pm": tr.pm,
    }


def prepare_report_data(
    db: Session, case_id: int, active_specimen_ids: list[int] = None, preview_overrides: dict = None
):
    ROLE_PRIORITY = {"primary": 1, "consultant": 2, "co-signer": 3, "resident": 4}

    settings = db.query(SystemSetting).first()

    is_approve_enabled = settings.enable_approve_system if settings else False
    show_specimen_name = settings.show_specimen_name if settings else True

    lab_name_th = settings.lab_name_th if settings else "ชื่อห้องปฏิบัติการ"
    lab_name_en = settings.lab_name_en if settings else "Laboratory Name"
    lab_address = settings.lab_address if settings else ""
    footer_text = (settings.surgical_report_footer or settings.report_footer_text or "") if settings else ""
    primary_color = settings.report_primary_color if settings else None
    primary_color_dark = _darken_hex(primary_color) if primary_color else None

    logo_url = settings.report_logo_url if settings else None

    db_case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    if not db_case:
        return None

    spec_data = _prepare_specimen_and_images(
        db, db_case, active_specimen_ids, STORAGE_BASE
    )
    order_groups = _get_grouped_diagnoses(db, case_id)

    diag_summary = _get_diagnosis_html_summary(
        db,
        db_case,
        order_groups,
        db_case.diagnosis_mode or "individual",
        spec_data,
        settings.show_specimen_name if settings else True,
    )

    final_pathologist_name = "Not Specified"

    actual_latest_order = max(order_groups.keys()) if order_groups else None

    if actual_latest_order is not None:
        latest_signers = (
            db.query(ReportSigner)
            .join(SurgicalReport, ReportSigner.report_id == SurgicalReport.id)
            .filter(
                SurgicalReport.case_id == db_case.id,
                SurgicalReport.status != "cancelled",
                ReportSigner.diagnosis_order == actual_latest_order,
            )
            .all()
        )

        if latest_signers:
            latest_signers.sort(key=lambda x: ROLE_PRIORITY.get(x.role, 99))

            unique_names = []
            for s in latest_signers:
                name = s.user.report_name or s.user.full_name
                if name not in unique_names:
                    unique_names.append(name)

            final_pathologist_name = ", ".join(unique_names)

        elif db_case.pathologist:
            final_pathologist_name = (
                db_case.pathologist.report_name or db_case.pathologist.full_name
            )

    elif db_case.pathologist:
        final_pathologist_name = (
            db_case.pathologist.report_name or db_case.pathologist.full_name
        )

    current_version_count = (
        db.query(SurgicalReport)
        .filter(
            SurgicalReport.case_id == case_id,
            SurgicalReport.status.in_([ReportStatus.PUBLISHED, ReportStatus.PENDING_APPROVAL]),
        )
        .count()
    )
    next_version = current_version_count + 1

    ref_date = db_case.created_at.date() if db_case.created_at else date.today()
    age_info = _calculate_patient_age(db_case.patient.birth_date, ref_date)

    now = local_now()
    if is_approve_enabled:
        target_status = ReportStatus.PENDING_APPROVAL
        published_at_value = None
    else:
        target_status = ReportStatus.PUBLISHED
        published_at_value = now

    overrides = preview_overrides or {}
    is_pending_val = overrides.get("is_pending", db_case.is_pending)
    pending_reason_val = overrides.get("pending_reason", db_case.pending_reason if db_case.is_pending else None)

    return {
        "case_id": db_case.id,
        "accession_no": db_case.accession_no,
        "patient_title": (
            db_case.patient.title.title
            if (db_case.patient and db_case.patient.title)
            else None
        ),
        "patient_name": db_case.patient.name if db_case.patient else "Unknown",
        "patient_ln": db_case.patient.ln if db_case.patient else None,
        "patient_hn": db_case.hn,
        "patient_cid": db_case.patient.cid if db_case.patient else None,
        "patient_birth_date": db_case.patient.birth_date if db_case.patient else None,
        "patient_age": age_info["years"],
        "patient_age_display": age_info["display"],
        "patient_gender": db_case.patient.gender if db_case.patient else None,
        "lab_name_th_snapshot": lab_name_th,
        "lab_name_en_snapshot": lab_name_en,
        "lab_address_snapshot": lab_address,
        "report_footer_snapshot": footer_text,
        "collect_at": db_case.collect_at,
        "registered_at": db_case.created_at,
        "hospital_id": db_case.hospital_id,
        "hospital_name": db_case.hospital.name if db_case.hospital else None,
        "department_name": db_case.department.name if db_case.department else None,
        "clinician_name": db_case.clinician_name,
        "has_malignancy": db_case.has_malignancy,
        "has_critical": db_case.has_critical,
        "is_pending": is_pending_val,
        "pending_reason": pending_reason_val,
        "clinical_history_snapshot": db_case.clinical_diagnosis,
        "specimen_summary": spec_data["spec_summary"],
        "gross_description_summary": spec_data["gross_summary"],
        "submitted_sections_snapshot": spec_data["submitted_sections"],
        "gross_images": spec_data["gross_images"],
        "micro_images": spec_data["micro_images"],
        "microscopic_summary": _get_microscopic_summary(order_groups),
        "diagnosis_summary": diag_summary["diagnosis_html"],
        "pathologist_name": final_pathologist_name,
        "report_type": ReportType.FINAL.value,
        "status": target_status,
        "version_no": next_version,
        "published_at": published_at_value,
        "reported_at": local_now(),
        "consult_pdf_path_snapshot": db_case.consult_pdf_path,
        "primary_color": primary_color,
        "primary_color_dark": primary_color_dark,
        "show_icd_o_in_report": settings.show_icd_o_in_report if settings else False,
        "icd_o_data": _get_icd_o_for_report(db, case_id) if (settings and settings.show_icd_o_in_report) else None,
    }
