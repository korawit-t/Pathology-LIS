"""Tests for app/crud/patient.py — the search-vs-browse split in
get_patients (only aggregates "Hospital: HN" strings across a patient's
cases when a search term is given; a plain browse skips the join/group-by
entirely) and standard CRUD."""

import uuid

from app.crud.patient import (
    get_patients,
    get_patient,
    get_patient_by_cid,
    create_patient,
    update_patient,
    delete_patient,
)
from app.schemas.patient import PatientCreate, PatientUpdate
from app.models.patient import Patient

from tests.factories import make_patient, make_bare_case, make_hospital


class TestGetPatients:
    def test_search_matches_name(self, db):
        unique = uuid.uuid4().hex[:8]
        patient = make_patient(db, name=f"Findable-{unique}")

        results = get_patients(db, q=unique)

        assert any(p.id == patient.id for p in results)

    def test_search_matches_cid(self, db):
        unique_cid = uuid.uuid4().hex[:13]
        patient = Patient(name="CID Search Test", cid=unique_cid)
        db.add(patient)
        db.commit()

        results = get_patients(db, q=unique_cid)

        assert any(p.id == patient.id for p in results)

    def test_search_matches_case_hn_and_aggregates_hospital_label(self, db, admin_user):
        registrar, _ = admin_user
        unique_hn = f"HN-{uuid.uuid4().hex[:8]}"
        hospital = make_hospital(db)
        patient = make_patient(db, name="HN Search Test")
        case = make_bare_case(db, registrar_id=registrar.id, hospital=hospital, patient=patient)
        case.hn = unique_hn
        db.commit()

        results = get_patients(db, q=unique_hn)

        found = next((p for p in results if p.id == patient.id), None)
        assert found is not None
        assert hospital.name in found.hn
        assert unique_hn in found.hn

    def test_no_query_returns_plain_list_without_grouping(self, db):
        patient = make_patient(db)

        results = get_patients(db, q=None, limit=1000)

        assert any(p.id == patient.id for p in results)


class TestGetPatient:
    def test_missing_returns_none(self, db):
        assert get_patient(db, 999999) is None

    def test_found(self, db):
        patient = make_patient(db)
        assert get_patient(db, patient.id).id == patient.id


class TestGetPatientByCid:
    def test_missing_returns_none(self, db):
        assert get_patient_by_cid(db, "nonexistent-cid") is None

    def test_found(self, db):
        unique_cid = uuid.uuid4().hex[:13]
        patient = Patient(name="CID Lookup Test", cid=unique_cid)
        db.add(patient)
        db.commit()

        assert get_patient_by_cid(db, unique_cid).id == patient.id


class TestCreatePatient:
    def test_creates_patient(self, db):
        patient = create_patient(db, PatientCreate(name="New Patient"))

        assert patient.id is not None
        assert patient.name == "New Patient"


class TestUpdatePatient:
    def test_missing_returns_none(self, db):
        assert update_patient(db, 999999, PatientUpdate(name="x")) is None

    def test_updates_only_provided_fields(self, db):
        patient = make_patient(db, name="Original Name")

        updated = update_patient(db, patient.id, PatientUpdate(ln="NewLastName"))

        assert updated.ln == "NewLastName"
        assert updated.name == "Original Name"


class TestDeletePatient:
    def test_missing_returns_false(self, db):
        assert delete_patient(db, 999999) is False

    def test_deletes_existing(self, db):
        patient = make_patient(db)

        assert delete_patient(db, patient.id) is True
        assert db.query(Patient).filter(Patient.id == patient.id).first() is None
