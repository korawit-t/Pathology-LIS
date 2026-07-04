"""
Shared fixture factories for building a minimal, valid Surgical case chain
(Patient -> SurgicalCase -> SurgicalSpecimen) directly via the ORM.

No SurgicalDiagnosis/SurgicalReport factory is provided here on purpose —
those are created by the real save/finalize code paths themselves
(bulk_save_draft_orchestrator / finalize_and_snapshot_orchestrator) from a
BulkSaveDraft payload, so tests exercise the same code a real request does
rather than pre-seeding a shortcut.
"""

import uuid

from app.models.organization import Hospital
from app.models.patient import Patient
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.gyne_cyto_case import GyneCytologyCase


def make_hospital(db) -> Hospital:
    hospital = Hospital(
        name=f"Test Hospital {uuid.uuid4().hex[:8]}",
        code=f"H{uuid.uuid4().hex[:6]}",
    )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    return hospital


def make_patient(db, name: str = "Test Patient") -> Patient:
    patient = Patient(name=name)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def make_bare_case(db, registrar_id: int, hospital: Hospital = None, patient: Patient = None) -> SurgicalCase:
    """A SurgicalCase with no specimens — enough for consult-pdf and
    outlab-consult-run tests, which don't touch diagnoses/reports."""
    hospital = hospital or make_hospital(db)
    patient = patient or make_patient(db)
    case = SurgicalCase(
        accession_no=f"S26-{uuid.uuid4().hex[:8]}",
        patient_id=patient.id,
        registrar_id=registrar_id,
        hospital_id=hospital.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def make_signable_case(db, registrar_id: int, hospital: Hospital = None, patient: Patient = None):
    """A SurgicalCase with one SurgicalSpecimen, ready to receive a diagnosis
    via a BulkSaveDraft payload (see module docstring)."""
    case = make_bare_case(db, registrar_id, hospital=hospital, patient=patient)
    specimen = SurgicalSpecimen(
        case_id=case.id,
        specimen_label="A",
        specimen_name="Test Specimen",
    )
    db.add(specimen)
    db.commit()
    db.refresh(specimen)
    return case, specimen


def make_bare_nongyne_case(db, registrar_id: int, hospital: Hospital = None, patient: Patient = None) -> NongyneCytologyCase:
    """A NongyneCytologyCase with no diagnosis — diagnoses are created via the
    real create_nongyne_diagnosis/update_nongyne_diagnosis crud calls."""
    hospital = hospital or make_hospital(db)
    patient = patient or make_patient(db)
    case = NongyneCytologyCase(
        accession_no=f"N26-{uuid.uuid4().hex[:8]}",
        patient_id=patient.id,
        registrar_id=registrar_id,
        hospital_id=hospital.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def make_bare_gyne_case(db, registrar_id: int, hospital: Hospital = None, patient: Patient = None) -> GyneCytologyCase:
    """A GyneCytologyCase with no diagnosis — diagnoses are created via the
    real create_initial_diagnosis/update_diagnosis crud calls."""
    hospital = hospital or make_hospital(db)
    patient = patient or make_patient(db)
    case = GyneCytologyCase(
        accession_no=f"C26-{uuid.uuid4().hex[:8]}",
        patient_id=patient.id,
        registrar_id=registrar_id,
        hospital_id=hospital.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case
