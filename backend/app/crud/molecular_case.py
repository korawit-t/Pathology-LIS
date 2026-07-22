import io
import json
import os
import uuid
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.models.molecular_case import MolecularCase
from app.models.surgical_case import SurgicalCase
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_block import SurgicalBlock
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.patient import Patient
from app.schemas.molecular_case import MolecularCaseCreate, MolecularCaseUpdate
from app.utils.file_handler import validate_and_sanitize
from app.utils.time import local_now
from app.crud.organization import resolve_lab_header
from app.crud.system_setting import get_settings as get_system_settings
from app.crud.surgical_report_builder import get_consult_pdf_thumbnails_base64, STORAGE_BASE
from app.services.pdf_service import generate_consult_cover_pdf

try:
    from pypdf import PdfWriter
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

UPLOAD_MOLECULAR_DIR = os.path.join(os.getcwd(), "uploads", "molecular")
os.makedirs(UPLOAD_MOLECULAR_DIR, exist_ok=True)


def _darken_hex(hex_color: str, factor: float = 0.65) -> str:
    """Return a darkened version of a hex color (e.g. #0056b3 -> #003a8c)."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def _get_next_molecular_accession_no(db: Session) -> str:
    from app.models.system_setting import SystemSetting

    current_year_short = local_now().strftime("%y")
    settings = db.query(SystemSetting).first()
    letter = (settings.molecular_accession_prefix or "M") if settings else "M"
    prefix = f"{letter}{current_year_short}-"

    # ป้องกันเลขซ้ำหากมีการสั่งพร้อมกัน
    last_case = (
        db.query(MolecularCase.accession_no)
        .filter(MolecularCase.accession_no.like(f"{prefix}%"))
        .order_by(MolecularCase.accession_no.desc())
        .with_for_update()
        .first()
    )

    if last_case:
        try:
            new_run_number = int(last_case[0].split("-")[1]) + 1
        except (IndexError, ValueError):
            new_run_number = 1
    else:
        new_run_number = 1

    return f"{prefix}{new_run_number:05d}"


def create_molecular_case_from_stain(
    db: Session,
    stain: SurgicalBlockStain,
    ap_test: AnatomicalPathologyTest,
    registrar_id: int,
    assist_pathologist_id: int | None = None,
) -> MolecularCase:
    """Called from crud.surgical_block_stain.create_stain() whenever a Molecular-category
    test is ordered — spawns a new M26- case with the originating Surgical case as parent.
    assist_pathologist_id defaults to the ordering pathologist (registrar_id) — the common
    case, ordering from within the Surgical report's own block/IHC page — but callers that
    collect it explicitly (e.g. the Molecular "From Surgical Case" registration form) may
    override it."""
    block = db.get(SurgicalBlock, stain.block_id)
    if not block or not block.specimen_id:
        return None
    specimen = block.specimen
    if not specimen:
        return None

    accession_no = _get_next_molecular_accession_no(db)
    db_obj = MolecularCase(
        accession_no=accession_no,
        parent_case_id=specimen.case_id,
        stain_id=stain.id,
        ap_test_id=ap_test.id,
        status="pending",
        is_outlab=bool(ap_test.is_external),
        registrar_id=registrar_id,
        assist_pathologist_id=assist_pathologist_id if assist_pathologist_id is not None else registrar_id,
    )
    db.add(db_obj)
    db.flush()
    return db_obj


def create_standalone_molecular_case(
    db: Session, obj_in: MolecularCaseCreate, registrar_id: int
) -> MolecularCase:
    """Registers a Molecular case with no parent Surgical case — patient/hospital/etc.
    are entered directly, same intake fields as Surgical/Non-Gyne registration."""
    ap_test = db.get(AnatomicalPathologyTest, obj_in.ap_test_id)
    accession_no = _get_next_molecular_accession_no(db)
    db_obj = MolecularCase(
        accession_no=accession_no,
        parent_case_id=None,
        stain_id=None,
        ap_test_id=obj_in.ap_test_id,
        patient_id=obj_in.patient_id,
        hospital_id=obj_in.hospital_id,
        department_id=obj_in.department_id,
        medical_scheme_id=obj_in.medical_scheme_id,
        hn=obj_in.hn,
        an=obj_in.an,
        vn=obj_in.vn,
        clinical_diagnosis=obj_in.clinical_diagnosis,
        clinician_name=obj_in.clinician_name,
        collect_at=obj_in.collect_at,
        status="pending",
        is_outlab=bool(ap_test.is_external) if ap_test else False,
        registrar_id=registrar_id,
        assist_pathologist_id=obj_in.assist_pathologist_id,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def _base_query(db: Session):
    return db.query(MolecularCase).options(
        selectinload(MolecularCase.parent_case)
        .selectinload(SurgicalCase.patient)
        .selectinload(Patient.title),
        selectinload(MolecularCase.patient).selectinload(Patient.title),
        selectinload(MolecularCase.ap_test),
        selectinload(MolecularCase.assist_pathologist),
    )


def _to_response_dict(case: MolecularCase) -> dict:
    parent = case.parent_case
    # Standalone cases carry their own patient/hn; parent-linked cases resolve
    # through the originating Surgical case instead (kept in sync there).
    patient = parent.patient if parent else case.patient
    patient_name = None
    patient_ref = None
    if patient:
        title = getattr(patient, "title", None)
        parts = [getattr(title, "title", None), patient.name, patient.ln]
        patient_name = " ".join(p for p in parts if p) or None
        # Only surface a `patient` ref for standalone cases — this is what
        # seeds the edit form's patient picker; parent-linked cases have no
        # patient_id of their own to edit.
        if not parent:
            patient_ref = {
                "id": patient.id,
                "hn": getattr(patient, "hn", None),
                "name": patient.name,
                "ln": patient.ln,
                "gender": getattr(patient, "gender", None),
                "cid": getattr(patient, "cid", None),
                "title": {"id": title.id, "title": title.title} if title else None,
            }
    hn = parent.hn if parent else case.hn

    return {
        "id": case.id,
        "accession_no": case.accession_no,
        "parent_case_id": case.parent_case_id,
        "parent_case_accession_no": parent.accession_no if parent else None,
        "patient_name": patient_name,
        "hn": hn,
        "stain_id": case.stain_id,
        "ap_test_id": case.ap_test_id,
        "test_name": case.ap_test.name if case.ap_test else None,
        "status": case.status,
        "is_outlab": case.is_outlab,
        "result_text": case.result_text,
        "outlab_pdf_path": case.outlab_pdf_path,
        "outlab_pdf_received_at": case.outlab_pdf_received_at,
        "registrar_id": case.registrar_id,
        "registered_at": case.registered_at,
        "reported_by_id": case.reported_by_id,
        "reported_at": case.reported_at,
        "assist_pathologist_id": case.assist_pathologist_id,
        "assist_pathologist_name": (
            (case.assist_pathologist.full_name or case.assist_pathologist.username)
            if case.assist_pathologist
            else None
        ),
        "is_cancelled": case.is_cancelled,
        "cancelled_at": case.cancelled_at,
        "cancel_reason": case.cancel_reason,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "patient_id": case.patient_id,
        "patient": patient_ref,
        "hospital_id": case.hospital_id,
        "department_id": case.department_id,
        "medical_scheme_id": case.medical_scheme_id,
        "an": case.an,
        "vn": case.vn,
        "clinical_diagnosis": case.clinical_diagnosis,
        "clinician_name": case.clinician_name,
        "collect_at": case.collect_at,
    }


def get_molecular_cases(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
    is_outlab: bool | None = None,
    parent_case_id: int | None = None,
    stain_id: int | None = None,
    search: str | None = None,
) -> list[dict]:
    query = _base_query(db).filter(MolecularCase.is_cancelled == False)  # noqa: E712
    if status:
        query = query.filter(MolecularCase.status == status)
    if is_outlab is not None:
        query = query.filter(MolecularCase.is_outlab == is_outlab)
    if parent_case_id is not None:
        query = query.filter(MolecularCase.parent_case_id == parent_case_id)
    if stain_id is not None:
        query = query.filter(MolecularCase.stain_id == stain_id)
    if search:
        s = f"%{search.strip()}%"
        query = (
            query.outerjoin(SurgicalCase, MolecularCase.parent_case_id == SurgicalCase.id)
            .outerjoin(
                Patient,
                or_(Patient.id == MolecularCase.patient_id, Patient.id == SurgicalCase.patient_id),
            )
            .filter(
                or_(
                    MolecularCase.accession_no.ilike(s),
                    MolecularCase.hn.ilike(s),
                    SurgicalCase.accession_no.ilike(s),
                    SurgicalCase.hn.ilike(s),
                    Patient.name.ilike(s),
                    Patient.ln.ilike(s),
                )
            )
        )

    cases = (
        query.order_by(MolecularCase.registered_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_to_response_dict(c) for c in cases]


def get_molecular_case(db: Session, case_id: int) -> dict | None:
    case = _base_query(db).filter(MolecularCase.id == case_id).first()
    if not case:
        return None
    return _to_response_dict(case)


def _get_case_obj(db: Session, case_id: int) -> MolecularCase | None:
    return db.query(MolecularCase).filter(MolecularCase.id == case_id).first()


def cancel_or_delete_molecular_case_for_stain(db: Session, stain_id: int, actor_id: int | None) -> None:
    """Called from crud.surgical_block_stain.delete_stain() when the deleted
    stain had auto-spawned a Molecular case (see create_molecular_case_from_stain).
    Hard-deletes the case if nothing has happened to it yet — still pending,
    never cancelled, no result text, no out-lab PDF — the same "nothing done
    yet" threshold Surgical/Non-Gyne use to allow a hard Delete instead of a
    soft Cancel. Otherwise soft-cancels it so the accession and whatever was
    already recorded are preserved for the audit trail. Caller is responsible
    for running this BEFORE deleting the stain row itself (stain_id is ON
    DELETE SET NULL on this FK, so the lookup below wouldn't find it after)."""
    case = db.query(MolecularCase).filter(MolecularCase.stain_id == stain_id).first()
    if not case:
        return

    untouched = (
        case.status == "pending"
        and not case.is_cancelled
        and not case.result_text
        and not case.outlab_pdf_path
    )
    if untouched:
        db.delete(case)
    else:
        case.is_cancelled = True
        case.cancelled_at = local_now()
        case.cancelled_by_id = actor_id
        case.cancel_reason = "Parent stain order was deleted"
    db.flush()


_DEMOGRAPHIC_FIELDS = {
    "patient_id", "ap_test_id", "hospital_id", "department_id", "medical_scheme_id",
    "hn", "an", "vn", "clinical_diagnosis", "clinician_name", "collect_at",
}


def update_molecular_case(db: Session, case_id: int, obj_in: MolecularCaseUpdate) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None
    update_data = obj_in.model_dump(exclude_unset=True)
    if case.parent_case_id is not None and _DEMOGRAPHIC_FIELDS & update_data.keys():
        raise ValueError("Demographic fields can only be edited on standalone Molecular cases.")
    for field, value in update_data.items():
        setattr(case, field, value)
    db.commit()
    return get_molecular_case(db, case_id)


def finalize_molecular_case(db: Session, case_id: int, reported_by_id: int, result_text: str | None = None) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None
    if result_text is not None:
        case.result_text = result_text
    if not (case.result_text or case.outlab_pdf_path):
        raise ValueError("A result summary or an out-lab PDF is required before finalizing.")
    case.status = "reported"
    case.reported_by_id = reported_by_id
    case.reported_at = local_now()
    db.commit()
    return get_molecular_case(db, case_id)


def cancel_molecular_case(db: Session, case_id: int, reason: str | None, cancelled_by_id: int) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None
    case.is_cancelled = True
    case.cancelled_at = local_now()
    case.cancelled_by_id = cancelled_by_id
    case.cancel_reason = reason
    db.commit()
    return get_molecular_case(db, case_id)


def save_outlab_pdf(db: Session, case_id: int, file: UploadFile, received_at: str | None) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None

    data, ext = validate_and_sanitize(file, allowed="pdf")

    if case.outlab_pdf_path and os.path.exists(case.outlab_pdf_path):
        os.remove(case.outlab_pdf_path)

    unique_filename = f"molecular_{case.id}_{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_MOLECULAR_DIR, unique_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(data)

    case.outlab_pdf_path = file_path
    case.outlab_pdf_received_at = (
        datetime.fromisoformat(received_at) if received_at else local_now()
    )
    db.commit()
    return get_molecular_case(db, case_id)


def clear_outlab_pdf(db: Session, case_id: int) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None
    if case.outlab_pdf_path and os.path.exists(case.outlab_pdf_path):
        os.remove(case.outlab_pdf_path)
    case.outlab_pdf_path = None
    case.outlab_pdf_received_at = None
    db.commit()
    return get_molecular_case(db, case_id)


def _resolve_display_fields(case: MolecularCase) -> dict:
    """Case-level display fields, resolved through the parent Surgical case
    when this is a parent-linked (ordered-on-block) Molecular case — mirrors
    the same parent-fallback pattern _to_response_dict already uses."""
    parent = case.parent_case
    if parent:
        return {
            "patient": parent.patient,
            "hn": parent.hn,
            "hospital": parent.hospital,
            "department": parent.department,
            "clinician_name": parent.clinician_name,
            "collect_at": parent.collect_at,
        }
    return {
        "patient": case.patient,
        "hn": case.hn,
        "hospital": case.hospital,
        "department": case.department,
        "clinician_name": case.clinician_name,
        "collect_at": case.collect_at,
    }


def get_outlab_pdf_with_cover(db: Session, case_id: int) -> bytes | None:
    """The uploaded out-lab PDF with a cover sheet (lab header + patient/
    accession info + one image per page of the PDF) prepended — reuses the
    exact same template/rasterize/merge pipeline as the Surgical/Non-Gyne
    external-consult cover sheet (`consult_cover_template.html` via
    `generate_consult_cover_pdf`/`get_consult_pdf_thumbnails_base64`).
    Regenerated fresh on every call, same as those report-PDF endpoints —
    no cache, no snapshot table (Molecular has no separate "report" row to
    freeze thumbnails against)."""
    case = (
        db.query(MolecularCase)
        .options(
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.hospital),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.department),
            selectinload(MolecularCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.hospital),
            selectinload(MolecularCase.department),
        )
        .filter(MolecularCase.id == case_id)
        .first()
    )
    if not case or not case.outlab_pdf_path or not os.path.exists(case.outlab_pdf_path):
        return None

    with open(case.outlab_pdf_path, "rb") as f:
        main_bytes = f.read()

    if not PYPDF_AVAILABLE:
        return main_bytes

    thumbnails = get_consult_pdf_thumbnails_base64(case.outlab_pdf_path)
    if not thumbnails:
        return main_bytes

    fields = _resolve_display_fields(case)
    patient = fields["patient"]
    title = getattr(patient, "title", None) if patient else None
    hospital = fields["hospital"]
    department = fields["department"]

    settings = get_system_settings(db)
    lab_name_en, lab_address, logo_path = resolve_lab_header(hospital, settings)
    logo_url = None
    if logo_path:
        full = STORAGE_BASE / logo_path.removeprefix("/storage/")
        logo_url = full.as_uri() if full.exists() else None

    primary_color = settings.report_primary_color if settings else None
    font_path = STORAGE_BASE.parent / "assets" / "fonts"

    report_data = {
        "font_path": font_path.as_uri(),
        "primary_color": primary_color,
        "primary_color_dark": _darken_hex(primary_color) if primary_color else None,
        "report_logo_url_snapshot": logo_url,
        "lab_name_en_snapshot": lab_name_en,
        "lab_address_snapshot": lab_address,
        "patient_title": title.title if title else "",
        "patient_name": patient.name if patient else "",
        "patient_ln": patient.ln if patient else "",
        "patient_hn": fields["hn"],
        "patient_gender": patient.gender if patient else "",
        "patient_age_display": patient.age_display if patient else "-",
        "accession_no": case.accession_no,
        "clinician_name": fields["clinician_name"],
        "hospital_name": hospital.name if hospital else None,
        "department_name": department.name if department else None,
        "collect_at": fields["collect_at"],
        "registered_at": case.registered_at,
        "reported_at": case.reported_at,
        "consult_pdf_thumbnail_snapshot": json.dumps(thumbnails),
    }

    cover_bytes = generate_consult_cover_pdf(report_data)

    writer = PdfWriter()
    writer.append(io.BytesIO(cover_bytes))
    writer.append(io.BytesIO(main_bytes))
    merged_io = io.BytesIO()
    writer.write(merged_io)
    return merged_io.getvalue()
