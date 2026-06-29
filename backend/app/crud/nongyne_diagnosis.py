from sqlalchemy.orm import Session
from sqlalchemy import desc, func as sql_func
from datetime import datetime
from app.utils.time import local_now

from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.patient import Patient
from app.models.organization import Hospital
from app.schemas.nongyne_diagnosis import (
    NongyneDiagnosisCreate,
    NongyneDiagnosisUpdate,
    NongyneDiagnosisRevise,
)

def get_nongyne_diagnosis_by_id(db: Session, diag_id: int):
    return db.query(NongyneDiagnosis).filter(NongyneDiagnosis.id == diag_id).first()

def get_diagnoses_by_case(db: Session, case_id: int):
    """Return all diagnoses for a case, newest first."""
    return (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id == case_id)
        .order_by(desc(NongyneDiagnosis.created_at))
        .all()
    )


def get_current_diagnosis(db: Session, case_id: int):
    """Return the single is_current diagnosis for a case."""
    return (
        db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id == case_id, NongyneDiagnosis.is_current.is_(True))
        .order_by(desc(NongyneDiagnosis.created_at))
        .first()
    )

def create_nongyne_diagnosis(db: Session, obj_in: NongyneDiagnosisCreate):
    if obj_in.diagnosis_order is not None:
        diagnosis_order = obj_in.diagnosis_order
    else:
        max_order = db.query(sql_func.max(NongyneDiagnosis.diagnosis_order))\
            .filter(NongyneDiagnosis.case_id == obj_in.case_id).scalar() or 0
        signed_exists = db.query(NongyneDiagnosis).filter(
            NongyneDiagnosis.case_id == obj_in.case_id,
            NongyneDiagnosis.status == "signed"
        ).first()
        diagnosis_order = (max_order + 1) if signed_exists else 1

    db_obj = NongyneDiagnosis(
        case_id=obj_in.case_id,
        gross_description=obj_in.gross_description,
        microscopic_description=obj_in.microscopic_description,
        diagnosis=obj_in.diagnosis,
        comment=obj_in.comment,
        status="draft",
        entry_type=obj_in.entry_type,
        diagnosis_order=diagnosis_order,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_nongyne_diagnosis(db: Session, db_obj: NongyneDiagnosis, obj_in: NongyneDiagnosisUpdate):
    update_data = obj_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_obj, field, value)

    if update_data.get("status") == "signed" and db_obj.diagnosis_at is None:
        db_obj.diagnosis_at = local_now()

    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def revise_nongyne_diagnosis(db: Session, old_diag_id: int, obj_in: NongyneDiagnosisRevise):
    """Create a new revision/addendum and retire the old version."""
    old_diag = get_nongyne_diagnosis_by_id(db, old_diag_id)
    if not old_diag:
        return None

    # Retire all current versions for this case
    db.query(NongyneDiagnosis).filter(
        NongyneDiagnosis.case_id == old_diag.case_id,
        NongyneDiagnosis.is_current.is_(True),
    ).update({"is_current": False}, synchronize_session=False)

    new_diag = NongyneDiagnosis(
        case_id=old_diag.case_id,
        previous_version_id=old_diag.id,
        diagnosis_order=old_diag.diagnosis_order,
        entry_type=obj_in.entry_type,
        microscopic_description=obj_in.microscopic_description,
        diagnosis=obj_in.diagnosis,
        comment=obj_in.comment,
        revision_reason=obj_in.revision_reason,
        status="draft",
        is_current=True,
    )

    db.add(new_diag)
    db.commit()
    db.refresh(new_diag)
    return new_diag

def delete_nongyne_diagnosis(db: Session, diag_id: int):
    db_obj = get_nongyne_diagnosis_by_id(db, diag_id)
    if db_obj:
        db.delete(db_obj)
        db.commit()
        return True
    return False

def prepare_nongyne_report_data(db: Session, case_id: int):
    case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not case:
        return None
        
    patient = db.query(Patient).filter(Patient.id == case.patient_id).first()
    hospital = db.query(Hospital).filter(Hospital.id == case.hospital_id).first()
    hospital_name = hospital.name if hospital else None
    
    active_diag = get_current_diagnosis(db, case_id)
    is_pending = not active_diag or active_diag.status != "signed"

    # Build signers list: prefer stored signers on diagnosis, fall back to case pathologist
    signers = []
    if active_diag and active_diag.signers:
        from app.models.user import User
        for s in active_diag.signers:
            u = db.query(User).filter(User.id == s.get("user_id")).first()
            if u:
                signers.append({
                    "full_name": u.full_name or "",
                    "report_name": u.report_name or u.full_name or "",
                    "role": s.get("role", "primary"),
                })
    elif case.pathologist:
        signers.append({
            "full_name": case.pathologist.full_name or "Unknown Pathologist",
            "report_name": case.pathologist.report_name or case.pathologist.full_name or "Unknown Pathologist",
            "role": "primary",
        })
        
    return {
        "lab_name_en_snapshot": "PATHOLOGY LABORATORY",
        "lab_address_snapshot": "123 Health Ave, Medical City",
        "report_logo_url_snapshot": None,
        "patient_title": patient.title.title if patient and patient.title else "",
        "patient_name": patient.name if patient else "Unknown",
        "patient_hn": case.hn,
        "patient_gender": patient.gender if patient else "",
        "patient_age_display": patient.age_display if patient else "",
        "accession_no": case.accession_no,
        "clinician_name": case.clinician_name,
        "hospital_name": hospital_name,
        "department_name": case.department.name if case.department else None,
        "registered_at": case.registered_at,
        "collect_at": case.collect_at,
        "reported_at": active_diag.diagnosis_at if active_diag else None,
        "clinical_history_snapshot": case.clinical_diagnosis or case.clinical_history,
        "specimen_site": case.collection_site,
        "specimen_description": case.specimen_type,
        "specimen_volume": case.received_volume_ml,
        "specimen_volume_unit": "ml",
        "is_pending": is_pending,
        "diagnosis_summary": active_diag.diagnosis if active_diag else "",
        "microscopic_summary": active_diag.microscopic_description if active_diag else "",
        "comment_summary": active_diag.comment if active_diag else "",
        "signers": signers
    }

