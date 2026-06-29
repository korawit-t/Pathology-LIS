from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.patient import Patient
from app.models.surgical_case import SurgicalCase
from app.models.organization import Hospital
from app.schemas.patient import PatientCreate, PatientUpdate
from app.models.organization import MedicalScheme


from sqlalchemy import or_, func  # 🌟 เพิ่ม func เข้ามา


def get_patients(db: Session, q: str = None, skip: int = 0, limit: int = 20):
    # รวม "ชื่อโรงพยาบาล: HN" เข้าด้วยกัน
    # PostgreSQL: func.string_agg | SQLite: func.group_concat
    hn_with_hospital = func.string_agg(
        Hospital.name + ": " + SurgicalCase.hn, ", "
    ).label("all_hns")

    query = (
        db.query(Patient, hn_with_hospital)
        .outerjoin(SurgicalCase, Patient.id == SurgicalCase.patient_id)
        .outerjoin(Hospital, SurgicalCase.hospital_id == Hospital.id)
        .group_by(Patient.id)
    )

    if q and q.strip():
        search_filter = f"%{q}%"
        query = query.filter(
            or_(
                Patient.name.ilike(search_filter),
                Patient.cid.ilike(search_filter),
                SurgicalCase.hn.ilike(search_filter),
            )
        )
        results = query.limit(limit).all()

        output = []
        for p, hns in results:
            p.hn = hns  # ค่าที่ได้จะเป็น "รพ.ก: 123, รพ.ข: 456"
            output.append(p)
        return output

    return db.query(Patient).offset(skip).limit(limit).all()


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


def delete_patient(db: Session, patient_id: int):
    db_patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if db_patient:
        db.delete(db_patient)
        db.commit()
        return True
    return False
