from typing import Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, literal, or_, select, union
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session, selectinload

from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.molecular_case import MolecularCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.organization import Hospital
from app.models.patient import Patient
from app.models.surgical_case import SurgicalCase
from app.schemas.patient import PatientCreate, PatientUpdate

# Every case type that points at patients.id. A patient registered through any
# of them is the same row here, so search, the HN labels and the delete guard
# have to look at all of them — not just surgical.
CASE_MODELS = (
    (SurgicalCase, "Surgical"),
    (GyneCytologyCase, "Gyne"),
    (NongyneCytologyCase, "Non-gyne"),
    (MolecularCase, "Molecular"),
)


def _hn_label_rows(patient_ids: Iterable[int]):
    """(patient_id, "Hospital: HN") for every case of these patients, deduped
    across case types — one patient with a surgical and a gyne case under the
    same HN gets that label once."""
    parts = [
        select(
            model.patient_id.label("patient_id"),
            (Hospital.name + ": " + model.hn).label("label"),
        )
        .select_from(model)
        .join(Hospital, model.hospital_id == Hospital.id)
        .where(model.patient_id.in_(patient_ids), model.hn.isnot(None), model.hn != "")
        for model, _ in CASE_MODELS
    ]
    return union(*parts).subquery()


def _attach_hns(db: Session, patients: List[Patient]) -> List[Patient]:
    """Set p.hn to "รพ.ก: 123, รพ.ข: 456" — the format usePatientSearch splits
    on ", " and ": " to fill hospital + HN in the registration forms."""
    ids = [p.id for p in patients]
    if not ids:
        return patients
    rows = _hn_label_rows(ids)
    labels = dict(
        db.query(
            rows.c.patient_id,
            # string_agg(label, ', ' ORDER BY label) — ORDER BY goes after the separator
            func.string_agg(rows.c.label, aggregate_order_by(literal(", "), rows.c.label)),
        )
        .group_by(rows.c.patient_id)
        .all()
    )
    for p in patients:
        p.hn = labels.get(p.id)
    return patients


def _search_filter(term: str):
    """Name, last name, "name ln", CID, or the HN on any of the patient's cases."""
    hn_matches = union(
        *[
            select(model.patient_id).where(
                model.patient_id.isnot(None), model.hn.icontains(term, autoescape=True)
            )
            for model, _ in CASE_MODELS
        ]
    )
    return or_(
        Patient.name.icontains(term, autoescape=True),
        Patient.ln.icontains(term, autoescape=True),
        func.concat_ws(" ", Patient.name, Patient.ln).icontains(term, autoescape=True),
        Patient.cid.icontains(term, autoescape=True),
        Patient.id.in_(hn_matches),
    )


def search_patients(
    db: Session, q: Optional[str] = None, skip: int = 0, limit: int = 20
) -> Tuple[List[Patient], int]:
    """One page of patients (newest first) plus the total that matches.

    Searching is done here in SQL, not on a page the browser already has —
    a page that only ever loaded 100 rows could not find anyone past them."""
    query = db.query(Patient)
    term = (q or "").strip()
    if term:
        query = query.filter(_search_filter(term))
    total = query.count()
    patients = (
        query.options(selectinload(Patient.title))
        .order_by(Patient.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return _attach_hns(db, patients), total


def get_patients(db: Session, q: str = None, skip: int = 0, limit: int = 20):
    patients, _ = search_patients(db, q=q, skip=skip, limit=limit)
    return patients


def get_patient(db: Session, patient_id: int):
    return db.query(Patient).filter(Patient.id == patient_id).first()


def get_patient_by_cid(db: Session, cid: str):
    return db.query(Patient).filter(Patient.cid == cid).first()


def create_patient(db: Session, patient: PatientCreate):
    # ✅ Logic Simple: ใช้ ID ที่ส่งมาจาก patient Schema โดยตรง

    # 1. เตรียมข้อมูล Patient
    # patient.dict() จะรวมทุก field ใน PatientCreate (รวมถึง medical_scheme_id)
    patient_data = patient.dict()

    # 2. Save Patient
    db_patient = Patient(**patient_data)
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def update_patient(db: Session, patient_id: int, patient_data: PatientUpdate):
    db_patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not db_patient:
        return None

    for key, value in patient_data.dict(exclude_unset=True).items():
        setattr(db_patient, key, value)

    db.commit()
    db.refresh(db_patient)
    return db_patient


def count_patient_cases(db: Session, patient_id: int) -> dict:
    """{"Surgical": 2, "Gyne": 1} — only the case types this patient has."""
    counts = {}
    for model, label in CASE_MODELS:
        n = db.query(func.count(model.id)).filter(model.patient_id == patient_id).scalar()
        if n:
            counts[label] = n
    return counts


def delete_patient(db: Session, patient_id: int):
    """Delete a patient who has no cases at all.

    A patient with cases is refused (409) whatever the case type. Before this,
    surgical cases were cascade-deleted with the patient while a gyne or
    non-gyne case made the delete fail on the NOT NULL foreign key."""
    db_patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not db_patient:
        return False
    counts = count_patient_cases(db, patient_id)
    if counts:
        summary = ", ".join(f"{label} {n}" for label, n in counts.items())
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ลบคนไข้รายนี้ไม่ได้ เพราะยังมีเคสในระบบ ({summary})",
        )
    db.delete(db_patient)
    db.commit()
    return True
