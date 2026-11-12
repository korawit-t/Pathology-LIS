"""External-consult cover sheets in front of a report PDF — one cover per
consult round the report carries (its consult_ids_snapshot), oldest first.

Reports issued before outlab_consult_requests existed have no
consult_ids_snapshot; they keep printing their own single
consult_pdf_*_snapshot cover through pdf_service.prepend_consult_cover.
"""
import io
import json
import logging

from sqlalchemy.orm import Session, selectinload

from app.services.pdf_service import (
    PYPDF_AVAILABLE,
    generate_consult_cover_pdf,
    prepend_consult_cover,
)

if PYPDF_AVAILABLE:
    from pypdf import PdfWriter

logger = logging.getLogger(__name__)


def _darken_hex(hex_color: str, factor: float = 0.65) -> str:
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def cover_header_for_case(db: Session, case_type: str, case_id: int) -> dict:
    """Lab header + patient block for a cover, read from the case — the gyne
    and non-gyne PDF data don't carry the surgical snapshot's field names and
    types the cover template expects (same build as the gyne out-lab result
    cover in crud.gyne_cyto_case)."""
    from app.core.config import BACKEND_DIR
    from app.crud.organization import resolve_lab_header
    from app.crud.outlab_consult_request import case_model
    from app.crud.system_setting import get_settings as get_system_settings
    from app.models.patient import Patient
    from app.utils.storage_paths import file_uri, find_for_report

    model = case_model(case_type)
    case = (
        db.query(model)
        .options(
            selectinload(model.patient).selectinload(Patient.title),
            selectinload(model.hospital),
            selectinload(model.department),
        )
        .filter(model.id == case_id)
        .first()
    )
    if case is None:
        return {}

    patient = case.patient
    title = getattr(patient, "title", None) if patient else None
    settings = get_system_settings(db)
    lab_name_en, lab_address, logo_path = resolve_lab_header(case.hospital, settings)
    logo_url = None
    if logo_path:
        full = find_for_report(logo_path, "logo")
        logo_url = file_uri(full) if full else None
    primary_color = settings.report_primary_color if settings else None

    return {
        "font_path": (BACKEND_DIR / "assets" / "fonts").as_uri(),
        "primary_color": primary_color,
        "primary_color_dark": _darken_hex(primary_color) if primary_color else None,
        "report_logo_url_snapshot": logo_url,
        "lab_name_en_snapshot": lab_name_en,
        "lab_address_snapshot": lab_address,
        "patient_title": title.title if title else "",
        "patient_name": patient.name if patient else "",
        "patient_ln": patient.ln if patient else "",
        "patient_hn": case.hn,
        "patient_gender": patient.gender if patient else "",
        "patient_age_display": patient.age_display if patient else "-",
        "accession_no": case.accession_no,
        "clinician_name": case.clinician_name,
        "hospital_name": case.hospital.name if case.hospital else None,
        "department_name": case.department.name if case.department else None,
        "collect_at": case.collect_at,
        "registered_at": case.registered_at,
        "reported_at": case.report_at,
    }


def _approver_name(consult) -> str | None:
    user = consult.approved_by
    return (user.report_name or user.full_name) if user else None


def render_consult_covers(db: Session, consult_ids: list[int], header: dict) -> list[bytes]:
    from app.crud.outlab_consult_request import thumbnails_for
    from app.models.outlab_consult_request import OutlabConsultRequest

    rows = (
        db.query(OutlabConsultRequest)
        .options(selectinload(OutlabConsultRequest.approved_by))
        .filter(OutlabConsultRequest.id.in_(consult_ids))
        .all()
    )
    by_id = {r.id: r for r in rows}

    covers = []
    for consult_id in consult_ids:
        consult = by_id.get(consult_id)
        if consult is None:
            logger.warning("Report references missing consult %s", consult_id)
            continue
        thumbnails = thumbnails_for(consult)
        if not thumbnails:
            logger.warning("Consult %s has no readable PDF — cover skipped", consult.consult_no)
            continue
        covers.append(
            generate_consult_cover_pdf(
                {
                    **header,
                    "consult_pdf_thumbnail_snapshot": json.dumps(thumbnails),
                    "consult_pdf_approved_by_snapshot": _approver_name(consult),
                    "consult_pdf_approved_at_snapshot": consult.approved_at,
                    "consult_no": consult.consult_no,
                    "consult_destination_lab": consult.destination_lab,
                    "consult_external_ref": consult.external_ref,
                    "consult_external_pathologist": consult.external_pathologist,
                    "consult_result_received_at": consult.result_received_at,
                }
            )
        )
    return covers


def prepend_consult_covers(
    db: Session,
    main_pdf_bytes: bytes,
    report_data: dict,
    *,
    case_type: str,
    case_id: int,
) -> bytes:
    """Call after generate_pdf_blob(), which fills report_data["font_path"]
    that the surgical header relies on."""
    consult_ids = report_data.get("consult_ids_snapshot")
    if consult_ids is None:
        return prepend_consult_cover(main_pdf_bytes, report_data)
    if not consult_ids or not PYPDF_AVAILABLE:
        return main_pdf_bytes

    header = report_data if case_type == "surgical" else cover_header_for_case(db, case_type, case_id)
    covers = render_consult_covers(db, list(consult_ids), header)
    if not covers:
        return main_pdf_bytes

    writer = PdfWriter()
    for cover in covers:
        writer.append(io.BytesIO(cover))
    writer.append(io.BytesIO(main_pdf_bytes))
    merged = io.BytesIO()
    writer.write(merged)
    return merged.getvalue()
