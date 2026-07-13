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
from app.models.system_setting import SystemSetting
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.schemas.surgical_bulk import BulkSaveDraft, DiagnosisEntry
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.nongyne_cyto_report import publish_nongyne_report


def make_hospital(db) -> Hospital:
    hospital = Hospital(
        name=f"Test Hospital {uuid.uuid4().hex[:12]}",
        code=f"H{uuid.uuid4().hex[:12]}",
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
        accession_no=f"S26-{uuid.uuid4().hex[:12]}",
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


def make_block(db, specimen_id: int, block_no: int = 1, status: str = "grossed") -> SurgicalBlock:
    block = SurgicalBlock(specimen_id=specimen_id, block_no=block_no, status=status)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


def make_block_stain(db, block_id: int, test_id: int = None, slide_no: int = 1, status: str = "pending") -> SurgicalBlockStain:
    stain = SurgicalBlockStain(block_id=block_id, test_id=test_id, slide_no=slide_no, status=status)
    db.add(stain)
    db.commit()
    db.refresh(stain)
    return stain


def make_bare_nongyne_case(db, registrar_id: int, hospital: Hospital = None, patient: Patient = None) -> NongyneCytologyCase:
    """A NongyneCytologyCase with no diagnosis — diagnoses are created via the
    real create_nongyne_diagnosis/update_nongyne_diagnosis crud calls."""
    hospital = hospital or make_hospital(db)
    patient = patient or make_patient(db)
    case = NongyneCytologyCase(
        accession_no=f"N26-{uuid.uuid4().hex[:12]}",
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
        accession_no=f"C26-{uuid.uuid4().hex[:12]}",
        patient_id=patient.id,
        registrar_id=registrar_id,
        hospital_id=hospital.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def build_bulk_save_payload(case_id, specimen_id, pathologist_id, **overrides) -> BulkSaveDraft:
    """Canonical BulkSaveDraft for a single-specimen, single-signer save —
    the same shape finalize_and_snapshot_orchestrator/bulk_save_draft_orchestrator
    tests build on top of. Pass overrides (e.g. is_out_lab_consult=True,
    diagnosis_mode="integrated") to adapt for a specific scenario."""
    fields = dict(
        case_id=case_id,
        diagnosis_mode="individual",
        gross_descriptions={},
        diagnoses={specimen_id: DiagnosisEntry(diagnosis="Test diagnosis", microscopic_description="Test micro.")},
        pathologists=[{"user_id": pathologist_id, "role": "primary"}],
        signed_by_id=pathologist_id,
    )
    fields.update(overrides)
    return BulkSaveDraft(**fields)


def make_system_setting(db, **overrides) -> SystemSetting:
    """(Re)creates the single SystemSetting row with the given overrides.

    The app treats SystemSetting as a singleton — app/crud/surgical_report.py
    does `db.query(SystemSetting).first()` with no filter — so any existing
    row is cleared first to keep tests order-independent regardless of what
    other tests committed earlier in the same session."""
    db.query(SystemSetting).delete()
    setting = SystemSetting(**overrides)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def clear_system_settings(db) -> None:
    """Ensures no SystemSetting row exists, for tests exercising the
    "no settings row at all" fallback behavior in surgical_report.py."""
    db.query(SystemSetting).delete()
    db.commit()


def make_anatomical_pathology_test(
    db, category: str = "Cytology", system_code: str = None, name: str = "Test AP Test"
) -> AnatomicalPathologyTest:
    """`system_code` is globally unique — if a prior test already committed a
    row with that code (e.g. "PAP_ROUTINE"), reuse it instead of trying to
    delete-and-recreate (a later test's stains may already reference it by
    FK, so blind deletion isn't safe here the way it is for SystemSetting)."""
    if system_code:
        existing = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.system_code == system_code)
            .first()
        )
        if existing:
            return existing
    test = AnatomicalPathologyTest(name=name, category=category, system_code=system_code)
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


def make_pending_gyne_report(db, registrar_id: int, pathologist_id: int):
    """Case + current GyneDiagnosis + a real GyneCytoReport in PENDING_APPROVAL,
    with a 'primary' GyneReportSigner already signed for pathologist_id.

    Passes is_abnormal=True to publish_gyne_report — this is the only
    deterministic way to land in PENDING_APPROVAL. When is_abnormal=False,
    publish_gyne_report either random-QC-samples the report to pending review
    (flaky) or, when the publisher is a pathologist (as here) and not
    sampled, publishes it directly (see gyne_cyto_report.py's
    `if not flagged_for_review: db_report.status = PUBLISHED` branch) — so
    is_abnormal=False would NOT reliably produce a pending report here.

    Returns (case, report)."""
    case = make_bare_gyne_case(db, registrar_id=registrar_id)
    create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
    report = publish_gyne_report(
        db, case.id,
        signers=[{"user_id": pathologist_id, "role": "primary"}],
        current_user_id=pathologist_id,
        is_abnormal=True,
    )
    db.refresh(case)
    return case, report


def make_pending_nongyne_report(db, registrar_id: int, pathologist_id: int):
    """Case + current NongyneDiagnosis + a real NongyneCytoReport in
    PENDING_APPROVAL, with a 'primary' NongyneReportSigner already signed.

    publish_nongyne_report only routes to PENDING_APPROVAL when
    enable_non_gyne_approve_system is on (mirrors Surgical's
    enable_approve_system) — force it here without wiping any other settings
    a calling test may have already configured (unlike make_system_setting,
    which deletes and recreates the whole row).

    Returns (case, report)."""
    existing_settings = db.query(SystemSetting).first()
    if existing_settings:
        existing_settings.enable_non_gyne_approve_system = True
        db.commit()
    else:
        make_system_setting(db, enable_non_gyne_approve_system=True)

    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))
    report = publish_nongyne_report(
        db, case.id,
        signers=[{"user_id": pathologist_id, "role": "primary"}],
        current_user_id=pathologist_id,
    )
    db.refresh(case)
    return case, report
