import json
import os
import re
import uuid
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy import func, or_
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
from app.crud.surgical_report_builder import (
    get_consult_pdf_thumbnails_base64,
    STORAGE_BASE,
    _calculate_patient_age,
)
from app.services.pdf_service import generate_consult_cover_pdf, generate_pdf_blob

UPLOAD_MOLECULAR_DIR = os.path.join(os.getcwd(), "uploads", "molecular")
os.makedirs(UPLOAD_MOLECULAR_DIR, exist_ok=True)


def _is_blank_rich_text(html: str | None) -> bool:
    """result_text is now rich HTML from the same TipTap editor Surgical's
    diagnosis fields use (see SimpleTiptapEditor.tsx) — an "empty" editor
    still emits "<p></p>", which is truthy as a plain string. Mirrors the
    frontend's stripHtmlToText()-then-trim() emptiness check (used for
    GrossEditView's own rich-text field) so a stray empty paragraph can't
    pass finalize validation as if it were a real result."""
    if not html:
        return True
    text = re.sub(r"<[^>]*>", "", html)
    text = text.replace("&nbsp;", "").strip()
    return not text


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
        selectinload(MolecularCase.reported_by),
    )


def _effective_hospital_id(case: MolecularCase) -> int | None:
    """The hospital a case actually belongs to, for access scoping.

    A parent-linked case carries no hospital_id of its own — its hospital
    lives on the originating Surgical case, exactly like HN/VN/AN (see
    _resolve_display_fields). Scoping on the raw column alone would deny an
    external account every parent-linked case, since
    assert_hospital_scoped_access treats a None hospital as out of scope.
    """
    parent = case.parent_case
    return parent.hospital_id if parent else case.hospital_id


def _effective_hospital_col():
    """SQL form of _effective_hospital_id, for filtering in a query.

    Only valid once SurgicalCase has been outer-joined on parent_case_id; the
    join leaves SurgicalCase.hospital_id NULL for standalone cases, so the
    coalesce falls through to the case's own column. Parent first, mirroring
    _effective_hospital_id.
    """
    return func.coalesce(SurgicalCase.hospital_id, MolecularCase.hospital_id)


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
        # Live values, not frozen at registration like the PDF's age is — these
        # exist to identify the patient in a worklist row, not to be reported.
        "patient_gender": getattr(patient, "gender", None) if patient else None,
        "patient_age_display": getattr(patient, "age_display", None) if patient else None,
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
        "reported_by_name": (
            (case.reported_by.full_name or case.reported_by.username)
            if case.reported_by
            else None
        ),
        "is_print": case.is_print,
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
        # Hospital this case is scoped by — resolved through the parent, unlike
        # the raw `hospital_id` above, which stays standalone-only because the
        # edit form seeds its hospital picker from it. Deliberately absent from
        # MolecularCaseResponse (so it is dropped on serialisation): it exists
        # for the router's assert_hospital_scoped_access call, not for clients.
        "effective_hospital_id": _effective_hospital_id(case),
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
    clinician: str | None = None,
    hospital_ids: list[int] | None = None,
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
    query = _apply_case_filters(query, search, clinician, hospital_ids)

    cases = (
        query.order_by(MolecularCase.registered_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_to_response_dict(c) for c in cases]


def _apply_case_filters(
    query,
    search: str | None,
    clinician: str | None,
    hospital_ids: list[int] | None = None,
):
    """Shared search/clinician/hospital filtering for the list and print-queue
    queries — all three have to reach through parent_case_id for the
    parent-linked cases, whose HN/accession/patient/hospital all live on the
    Surgical case.

    The parent join is made once, here, for whichever of the three needs it:
    joining SurgicalCase a second time would raise an ambiguous-alias error.

    `hospital_ids=None` means unrestricted (internal lab staff). An empty list
    matches nothing, and so does a case whose effective hospital is NULL —
    scoping fails closed, same as assert_hospital_scoped_access.
    """
    if search or clinician or hospital_ids is not None:
        query = query.outerjoin(SurgicalCase, MolecularCase.parent_case_id == SurgicalCase.id)
    if hospital_ids is not None:
        query = query.filter(_effective_hospital_col().in_(hospital_ids))
    if search:
        s = f"%{search.strip()}%"
        query = (
            query.outerjoin(
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
    if clinician:
        c = f"%{clinician.strip()}%"
        query = query.filter(
            or_(
                MolecularCase.clinician_name.ilike(c),
                SurgicalCase.clinician_name.ilike(c),
            )
        )
    return query


def get_molecular_print_queue(
    db: Session,
    page: int = 1,
    size: int = 10,
    search: str | None = None,
    is_print: bool | None = None,
    unprinted_first: bool = False,
    hospital_ids: list[int] | None = None,
) -> dict:
    """Reported Molecular cases for the print queue, in the same
    {items, total, page, size} envelope the Surgical/Gyne/Non-Gyne report
    queues return.

    Only "reported" cases appear: those are Molecular's equivalent of a
    published report, and an unfinalized case has no PDF worth handing to a
    clinician. Cancelled cases are excluded the same way the list query
    excludes them.
    """
    query = _base_query(db).filter(
        MolecularCase.is_cancelled == False,  # noqa: E712
        MolecularCase.status == "reported",
    )
    if is_print is not None:
        query = query.filter(MolecularCase.is_print == is_print)
    query = _apply_case_filters(query, search, clinician=None, hospital_ids=hospital_ids)

    total = query.count()

    # The print queue asks for everything still waiting to be printed up front,
    # newest first within each group — same ordering as the other three queues.
    order_by = [MolecularCase.reported_at.desc()]
    if unprinted_first:
        order_by.insert(0, MolecularCase.is_print.asc())

    cases = query.order_by(*order_by).offset((page - 1) * size).limit(size).all()
    return {
        "items": [_to_response_dict(c) for c in cases],
        "total": total,
        "page": page,
        "size": size,
    }


def set_molecular_print_status(db: Session, case_id: int, is_print: bool) -> dict | None:
    case = _get_case_obj(db, case_id)
    if not case:
        return None
    case.is_print = is_print
    db.commit()
    return get_molecular_case(db, case_id)


def count_molecular_cases(
    db: Session,
    status: str | None = None,
    is_outlab: bool | None = None,
    hospital_ids: list[int] | None = None,
) -> int:
    """Row count only, for the dashboard tiles.

    Deliberately its own query rather than ``len(get_molecular_cases(...))``:
    that helper caps at ``limit`` and hydrates every row through
    ``_to_response_dict``, so counting with it is both wrong past the cap and
    needlessly expensive. Applies the same is_cancelled / status / is_outlab
    filters so the count always agrees with the list it summarises.
    """
    query = (
        db.query(func.count(MolecularCase.id))
        .select_from(MolecularCase)
        .filter(MolecularCase.is_cancelled == False)  # noqa: E712
    )
    if status:
        query = query.filter(MolecularCase.status == status)
    if is_outlab is not None:
        query = query.filter(MolecularCase.is_outlab == is_outlab)
    if hospital_ids is not None:
        query = query.outerjoin(
            SurgicalCase, MolecularCase.parent_case_id == SurgicalCase.id
        ).filter(_effective_hospital_col().in_(hospital_ids))
    return query.scalar() or 0


def get_molecular_case(db: Session, case_id: int) -> dict | None:
    case = _base_query(db).filter(MolecularCase.id == case_id).first()
    if not case:
        return None
    return _to_response_dict(case)


def _get_case_obj(db: Session, case_id: int) -> MolecularCase | None:
    return db.query(MolecularCase).filter(MolecularCase.id == case_id).first()


def get_reported_molecular_case_for_stain(db: Session, stain_id: int) -> MolecularCase | None:
    """Used by crud.surgical_block_stain.delete_stain() to BLOCK deleting a
    stain order whose Molecular case has already been reported — a signed-off
    clinical result. Undoing that should require explicitly cancelling the
    Molecular case itself (its own Cancel action), not happen as a side
    effect of removing an unrelated stain-order row. Still-pending cases (or
    already-cancelled ones) are not blocking — those fall through to
    cancel_or_delete_molecular_case_for_stain's hard-delete/soft-cancel path."""
    return (
        db.query(MolecularCase)
        .filter(
            MolecularCase.stain_id == stain_id,
            MolecularCase.status == "reported",
            MolecularCase.is_cancelled == False,  # noqa: E712
        )
        .first()
    )


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
    if _is_blank_rich_text(case.result_text) and not case.outlab_pdf_path:
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
            "vn": parent.vn,
            "an": parent.an,
            "hospital": parent.hospital,
            "department": parent.department,
            "clinician_name": parent.clinician_name,
            "collect_at": parent.collect_at,
        }
    return {
        "patient": case.patient,
        "hn": case.hn,
        "vn": case.vn,
        "an": case.an,
        "hospital": case.hospital,
        "department": case.department,
        "clinician_name": case.clinician_name,
        "collect_at": case.collect_at,
    }


def build_molecular_barcode_value(fields: dict, accession_no: str, setting) -> tuple[str, str]:
    """Barcode value for a Molecular case, mirroring surgical's
    _build_barcode_value: visit number with the OPD prefix, else admission
    number with the IPD prefix, so HOSxP resolves every case type the same way.

    Takes the already-resolved `fields` from _resolve_display_fields rather
    than the case itself, because a parent-linked Molecular case carries no
    VN/AN of its own — those live on the parent Surgical case, same as HN.

    Returns (barcode_value, barcode_type_label).
    """
    vn = ((fields.get("vn") or "")).strip()
    an = ((fields.get("an") or "")).strip()

    opd_prefix = (setting.barcode_opd_prefix or "2") if setting else "2"
    ipd_prefix = (setting.barcode_ipd_prefix or "3") if setting else "3"
    type_code = (setting.barcode_molecular_type_code or "11") if setting else "11"

    if vn:
        return f"{opd_prefix}{type_code}{vn}", f"OPD VN: {vn}"
    if an:
        return f"{ipd_prefix}{type_code}{an}", f"IPD AN: {an}"
    return (accession_no or ""), "Accession No."


def build_molecular_barcode_labels(
    db: Session, case_ids: list[int], hospital_ids: list[int] | None = None
) -> list[dict]:
    """Label-sheet rows for barcode_label_template.html, one per Molecular case.

    Unlike the report footer this is NOT gated on the case having a VN/AN:
    build_molecular_barcode_value's accession-number fallback is scanned for
    in-lab tracking, not by the HIS — same rule the other label sheets follow.

    `hospital_ids` scopes an external account to its own hospitals: the caller
    hands in arbitrary ids, and a label carries the patient's name and HN.
    Out-of-scope ids are skipped rather than raising, so one stray id in a
    selection does not fail the whole sheet.
    """
    from app.services.barcode_service import generate_code39_base64_img

    setting = get_system_settings(db)
    labels = []
    for cid in case_ids:
        case = _base_query(db).filter(MolecularCase.id == cid).first()
        if not case:
            continue
        if hospital_ids is not None and _effective_hospital_id(case) not in hospital_ids:
            continue
        fields = _resolve_display_fields(case)
        patient = fields["patient"]
        title = getattr(patient, "title", None) if patient else None
        hospital = fields["hospital"]

        barcode_value, barcode_type = build_molecular_barcode_value(
            fields, case.accession_no, setting
        )
        svg, width_mm, height_mm = generate_code39_base64_img(barcode_value)

        labels.append({
            "accession_no": case.accession_no,
            "patient_title": (title.title if title else "") or "",
            "patient_name": patient.name if patient else "",
            "patient_ln": (patient.ln if patient else "") or "",
            "patient_hn": fields["hn"],
            "patient_age_display": (patient.age_display if patient else None) or "-",
            "patient_gender": patient.gender if patient else "",
            "hospital_name": hospital.name if hospital else None,
            "barcode_svg": svg,
            "barcode_value": barcode_value,
            "barcode_type": barcode_type,
            "barcode_width_mm": width_mm,
            "barcode_height_mm": height_mm,
        })
    return labels


def _build_footer_barcode(fields: dict, accession_no: str, setting) -> dict:
    """Footer-barcode fields for a Molecular PDF, or {} when there is nothing
    the HIS could resolve.

    Empty when the case has no VN/AN: build_molecular_barcode_value falls back
    to the accession number for the label sheet's benefit, but on the report
    that is a barcode the HIS cannot resolve, so the footer is left off
    entirely instead — same rule the other three case types apply via
    has_scannable_visit().
    """
    from app.services.barcode_service import generate_report_footer_barcode

    if not ((fields.get("vn") or "").strip() or (fields.get("an") or "").strip()):
        return {}

    barcode_value, barcode_type = build_molecular_barcode_value(fields, accession_no, setting)
    svg, width_mm, height_mm = generate_report_footer_barcode(barcode_value)
    return {
        "barcode_svg": svg,
        "barcode_value": barcode_value,
        "barcode_type": barcode_type,
        "barcode_width_mm": width_mm,
        "barcode_height_mm": height_mm,
    }


def get_outlab_pdf_with_cover(db: Session, case_id: int, with_barcode: bool = False) -> bytes | None:
    """The uploaded out-lab PDF with a cover sheet (lab header + patient/
    accession info + one image per page of the PDF) prepended — reuses the
    exact same template/rasterize/merge pipeline as the Surgical/Non-Gyne
    external-consult cover sheet (`consult_cover_template.html` via
    `generate_consult_cover_pdf`/`get_consult_pdf_thumbnails_base64`).
    Regenerated fresh on every call, same as those report-PDF endpoints —
    no cache, no snapshot table (Molecular has no separate "report" row to
    freeze thumbnails against).

    Returns the cover ALONE — the external lab's file is not appended after it.
    Every page of that file is already reproduced on a cover page as a
    full-size image, so appending the original only added a second copy of the
    same content with no lab header and no footer barcode. Those extra pages
    could not be scanned into the HIS, which in a printed stack makes them
    pages staff have to identify and set aside by hand. The uploaded file
    itself is untouched on disk at outlab_pdf_path; this is about what the
    combined report hands out, not about discarding the source.

    with_barcode therefore covers the whole document, not just its front."""
    case = (
        db.query(MolecularCase)
        .options(
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.hospital),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.department),
            selectinload(MolecularCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.hospital),
            selectinload(MolecularCase.department),
            selectinload(MolecularCase.reported_by),
        )
        .filter(MolecularCase.id == case_id)
        .first()
    )
    if not case or not case.outlab_pdf_path or not os.path.exists(case.outlab_pdf_path):
        return None

    # Rendered sharper than the shared default (1000px/150dpi): with nothing
    # appended, this image IS the lab's report rather than a preview sitting in
    # front of it. The cover fits an A4 source page at about 74% — header and
    # page have to share the sheet — so fine print lands smaller than the lab
    # set it, and the pixels have to hold up to a magnifier or an on-screen
    # zoom. 1600px across the ~156mm it is drawn at is roughly 260 DPI on
    # paper, against 163 before. Passed here rather than changed in
    # get_consult_pdf_thumbnails_base64, whose default still serves the
    # Surgical and Gyne covers, where the full-size original does follow.
    thumbnails = get_consult_pdf_thumbnails_base64(
        case.outlab_pdf_path, max_width=1600, dpi=200
    )
    if not thumbnails:
        # Rasterizing failed (unreadable/corrupt upload, or PyMuPDF missing).
        # Hand back the lab's own file rather than nothing: a report with no
        # header still beats no report, and this is the only path that has it.
        with open(case.outlab_pdf_path, "rb") as f:
            return f.read()

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
        # Who signed the case out, in the cover's "Digitally Signed by" slot —
        # the same slot the Surgical consult cover and the Gyne out-lab cover
        # fill, and built the same way they build it (report_name is the name a
        # user has chosen to appear on reports; a username must never reach a
        # signature line). Molecular has no separate approval step for the
        # uploaded file — no outlab_result_approved_by_id the way Gyne has — so
        # finalizing the case IS the sign-out, and reported_by is the signer.
        # Stays empty until then, so a pending case's cover claims no signer.
        "consult_pdf_approved_by_snapshot": (
            (case.reported_by.report_name or case.reported_by.full_name)
            if case.reported_by
            else None
        ),
        "consult_pdf_approved_at_snapshot": case.reported_at,
    }
    if with_barcode:
        report_data.update(_build_footer_barcode(fields, case.accession_no, settings))

    return generate_consult_cover_pdf(report_data)


def _build_molecular_report_data(db: Session, case: MolecularCase, with_barcode: bool = False) -> dict:
    """Assembles the report_data dict for the free-text result PDF (see
    get_molecular_result_pdf) — mirrors get_outlab_pdf_with_cover's
    data-gathering (same _resolve_display_fields reuse, same inline
    lab-header/logo-URL resolution) but has no out-lab PDF/thumbnails
    involved, and adds the free-text result content fields instead."""
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

    # Freeze age as of registration, same convention Surgical uses, rather
    # than the live patient.age_display property (which would drift with
    # wall-clock time on every re-render of an old case).
    age_info = (
        _calculate_patient_age(patient.birth_date, ref_date=case.registered_at.date())
        if patient and patient.birth_date and case.registered_at
        else {"display": "-"}
    )

    return {
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
        "patient_age_display": age_info["display"],
        "accession_no": case.accession_no,
        "clinician_name": fields["clinician_name"],
        "hospital_name": hospital.name if hospital else None,
        "department_name": department.name if department else None,
        "collect_at": fields["collect_at"],
        "registered_at": case.registered_at,
        "reported_at": case.reported_at,
        "test_name": case.ap_test.name if case.ap_test else None,
        "result_text": case.result_text,
        "assist_pathologist_name": (
            (case.assist_pathologist.full_name or case.assist_pathologist.username)
            if case.assist_pathologist
            else None
        ),
        "reported_by_name": (
            (case.reported_by.full_name or case.reported_by.username)
            if case.reported_by
            else None
        ),
        "status": case.status,
        "is_preview": case.status != "reported",
        **(_build_footer_barcode(fields, case.accession_no, settings) if with_barcode else {}),
    }


def get_molecular_result_pdf(db: Session, case_id: int, with_barcode: bool = False) -> bytes | None:
    """Live-generated PDF of a Molecular case's free-text in-house result —
    regenerated fresh on every call from the current row, same as
    get_outlab_pdf_with_cover; Molecular has no snapshot/versioning table to
    freeze a report against (unlike Surgical's surgical_reports), matching
    its deliberately single-signer, no-addendum design. Always renders
    something (a "no result yet" placeholder pre-finalize) rather than 404ing
    on missing content — only 404s if the case itself doesn't exist."""
    case = (
        db.query(MolecularCase)
        .options(
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.hospital),
            selectinload(MolecularCase.parent_case).selectinload(SurgicalCase.department),
            selectinload(MolecularCase.patient).selectinload(Patient.title),
            selectinload(MolecularCase.hospital),
            selectinload(MolecularCase.department),
            selectinload(MolecularCase.ap_test),
            selectinload(MolecularCase.assist_pathologist),
            selectinload(MolecularCase.reported_by),
        )
        .filter(MolecularCase.id == case_id)
        .first()
    )
    if not case:
        return None

    report_data = _build_molecular_report_data(db, case, with_barcode=with_barcode)
    return generate_pdf_blob(
        report_data,
        template_name="reports/molecular_report_template.html",
        is_preview=report_data["is_preview"],
    )
