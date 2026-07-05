from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, literal, or_, select, union_all
from sqlalchemy.orm import Session

from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.organization import Department, Hospital, MedicalScheme, Title
from app.models.patient import Patient
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen


def _patient_name_expr():
    return func.concat_ws(" ", Title.title, Patient.name, Patient.ln)


def _apply_common_filters(
    query,
    model,
    search: Optional[str],
    status: Optional[List[str]],
    hospital_id: Optional[int],
    medical_scheme_id: Optional[int],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
):
    if search:
        s = f"%{search}%"
        query = query.where(
            or_(model.accession_no.ilike(s), model.hn.ilike(s), Patient.name.ilike(s))
        )
    if status:
        query = query.where(model.status.in_(status))
    if hospital_id is not None:
        query = query.where(model.hospital_id == hospital_id)
    if medical_scheme_id is not None:
        query = query.where(model.medical_scheme_id == medical_scheme_id)
    if date_from is not None:
        query = query.where(model.registered_at >= date_from)
    if date_to is not None:
        query = query.where(model.registered_at <= date_to)
    return query


def _surgical_branch(**filters):
    specimen_subq = (
        select(SurgicalSpecimen.specimen_name)
        .where(SurgicalSpecimen.case_id == SurgicalCase.id)
        .order_by(SurgicalSpecimen.id.asc())
        .limit(1)
        .correlate(SurgicalCase)
        .scalar_subquery()
    )
    query = (
        select(
            literal("surgical").label("case_type"),
            SurgicalCase.id.label("id"),
            SurgicalCase.accession_no.label("accession_no"),
            SurgicalCase.hn.label("hn"),
            _patient_name_expr().label("patient_name"),
            Hospital.name.label("hospital_name"),
            Department.name.label("department_name"),
            MedicalScheme.name.label("medical_scheme_name"),
            specimen_subq.label("specimen"),
            SurgicalCase.status.label("status"),
            SurgicalCase.registered_at.label("registered_at"),
            SurgicalCase.clinician_name.label("clinician_name"),
            SurgicalCase.is_express.label("is_express"),
            and_(
                SurgicalCase.is_out_lab_consult.is_(True),
                SurgicalCase.consult_pdf_path.is_(None),
            ).label("consult"),
            SurgicalCase.is_grossed.label("wf_grossed"),
            SurgicalCase.is_processed.label("wf_processed"),
            SurgicalCase.is_slide_prepped.label("wf_slide_prepped"),
            literal(False).label("wf_screened"),
            SurgicalCase.is_reported.label("wf_reported"),
        )
        .join(Patient, Patient.id == SurgicalCase.patient_id)
        .outerjoin(Title, Title.id == Patient.title_id)
        .outerjoin(Hospital, Hospital.id == SurgicalCase.hospital_id)
        .outerjoin(Department, Department.id == SurgicalCase.department_id)
        .outerjoin(MedicalScheme, MedicalScheme.id == SurgicalCase.medical_scheme_id)
    )
    return _apply_common_filters(query, SurgicalCase, **filters)


def _gyne_branch(**filters):
    query = (
        select(
            literal("gyne").label("case_type"),
            GyneCytologyCase.id.label("id"),
            GyneCytologyCase.accession_no.label("accession_no"),
            GyneCytologyCase.hn.label("hn"),
            _patient_name_expr().label("patient_name"),
            Hospital.name.label("hospital_name"),
            Department.name.label("department_name"),
            MedicalScheme.name.label("medical_scheme_name"),
            GyneCytologyCase.specimen_type.label("specimen"),
            GyneCytologyCase.status.label("status"),
            GyneCytologyCase.registered_at.label("registered_at"),
            GyneCytologyCase.clinician_name.label("clinician_name"),
            GyneCytologyCase.is_express.label("is_express"),
            and_(
                GyneCytologyCase.is_out_lab_consult.is_(True),
                GyneCytologyCase.consult_pdf_path.is_(None),
            ).label("consult"),
            literal(False).label("wf_grossed"),
            literal(False).label("wf_processed"),
            literal(False).label("wf_slide_prepped"),
            GyneCytologyCase.is_screened.label("wf_screened"),
            GyneCytologyCase.is_reported.label("wf_reported"),
        )
        .join(Patient, Patient.id == GyneCytologyCase.patient_id)
        .outerjoin(Title, Title.id == Patient.title_id)
        .outerjoin(Hospital, Hospital.id == GyneCytologyCase.hospital_id)
        .outerjoin(Department, Department.id == GyneCytologyCase.department_id)
        .outerjoin(MedicalScheme, MedicalScheme.id == GyneCytologyCase.medical_scheme_id)
    )
    return _apply_common_filters(query, GyneCytologyCase, **filters)


def _nongyne_branch(**filters):
    query = (
        select(
            literal("nongyne").label("case_type"),
            NongyneCytologyCase.id.label("id"),
            NongyneCytologyCase.accession_no.label("accession_no"),
            NongyneCytologyCase.hn.label("hn"),
            _patient_name_expr().label("patient_name"),
            Hospital.name.label("hospital_name"),
            Department.name.label("department_name"),
            MedicalScheme.name.label("medical_scheme_name"),
            NongyneCytologyCase.specimen_type.label("specimen"),
            NongyneCytologyCase.status.label("status"),
            NongyneCytologyCase.registered_at.label("registered_at"),
            NongyneCytologyCase.clinician_name.label("clinician_name"),
            NongyneCytologyCase.is_express.label("is_express"),
            and_(
                NongyneCytologyCase.is_out_lab_consult.is_(True),
                NongyneCytologyCase.consult_pdf_path.is_(None),
            ).label("consult"),
            literal(False).label("wf_grossed"),
            literal(False).label("wf_processed"),
            literal(False).label("wf_slide_prepped"),
            NongyneCytologyCase.is_screened.label("wf_screened"),
            NongyneCytologyCase.is_reported.label("wf_reported"),
        )
        .join(Patient, Patient.id == NongyneCytologyCase.patient_id)
        .outerjoin(Title, Title.id == Patient.title_id)
        .outerjoin(Hospital, Hospital.id == NongyneCytologyCase.hospital_id)
        .outerjoin(Department, Department.id == NongyneCytologyCase.department_id)
        .outerjoin(MedicalScheme, MedicalScheme.id == NongyneCytologyCase.medical_scheme_id)
    )
    return _apply_common_filters(query, NongyneCytologyCase, **filters)


_BRANCH_BUILDERS = {
    "surgical": _surgical_branch,
    "gyne": _gyne_branch,
    "nongyne": _nongyne_branch,
}


def get_unified_cases(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    status: Optional[List[str]] = None,
    hospital_id: Optional[int] = None,
    medical_scheme_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    case_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    filters = dict(
        search=search,
        status=status,
        hospital_id=hospital_id,
        medical_scheme_id=medical_scheme_id,
        date_from=date_from,
        date_to=date_to,
    )
    selected_types = case_types or list(_BRANCH_BUILDERS.keys())
    branches = [_BRANCH_BUILDERS[t](**filters) for t in selected_types if t in _BRANCH_BUILDERS]

    if not branches:
        return {"items": [], "total": 0}

    unioned = union_all(*branches).subquery("unified")

    total = db.execute(select(func.count()).select_from(unioned)).scalar_one()

    rows = (
        db.execute(
            select(unioned)
            .order_by(unioned.c.registered_at.desc(), unioned.c.accession_no.desc())
            .offset(skip)
            .limit(limit)
        )
        .mappings()
        .all()
    )

    return {"items": [dict(row) for row in rows], "total": total}
