"""Tests for app/crud/patient.py — search_patients/get_patients (server-side
search by name, CID or the HN of any case type, "Hospital: HN" labels from
every case type, newest first, with a total), the delete guard (a patient with
cases of any type is refused), and standard CRUD."""

import uuid

import pytest
from fastapi import HTTPException

from app.crud.patient import (
    count_patient_cases,
    search_patients,
    get_patients,
    get_patient,
    get_patient_by_cid,
    create_patient,
    update_patient,
    delete_patient,
)
from app.schemas.patient import PatientCreate, PatientUpdate
from app.models.patient import Patient
from app.models.molecular_case import MolecularCase
from app.models.surgical_case import SurgicalCase

from tests.factories import (
    make_anatomical_pathology_test,
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_hospital,
    make_patient,
)


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

    def test_no_query_lists_patients(self, db):
        patient = make_patient(db)

        results = get_patients(db, q=None, limit=1000)

        assert any(p.id == patient.id for p in results)

    @pytest.mark.parametrize("make_case", [make_bare_gyne_case, make_bare_nongyne_case])
    def test_search_matches_cytology_case_hn(self, db, admin_user, make_case):
        # The old query joined only surgical_cases, so a patient whose only
        # case is gyne or non-gyne could not be found by HN.
        registrar, _ = admin_user
        unique_hn = f"HN-{uuid.uuid4().hex[:8]}"
        hospital = make_hospital(db)
        patient = make_patient(db, name="Cyto HN Search")
        case = make_case(db, registrar_id=registrar.id, hospital=hospital, patient=patient)
        case.hn = unique_hn
        db.commit()

        results = get_patients(db, q=unique_hn)

        assert [p.id for p in results] == [patient.id]
        assert results[0].hn == f"{hospital.name}: {unique_hn}"

    def test_hn_labels_cover_every_case_type_once(self, db, admin_user):
        registrar, _ = admin_user
        hosp_a, hosp_b = make_hospital(db), make_hospital(db)
        patient = make_patient(db, name=f"Multi-{uuid.uuid4().hex[:8]}")
        hn_a, hn_b = f"A{uuid.uuid4().hex[:8]}", f"B{uuid.uuid4().hex[:8]}"
        surgical = make_bare_case(db, registrar_id=registrar.id, hospital=hosp_a, patient=patient)
        gyne = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hosp_a, patient=patient)
        nongyne = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hosp_b, patient=patient)
        surgical.hn, gyne.hn, nongyne.hn = hn_a, hn_a, hn_b
        db.commit()

        found = next(p for p in get_patients(db, q=patient.name) if p.id == patient.id)

        # Same hospital + HN on a surgical and a gyne case shows once.
        assert sorted(found.hn.split(", ")) == sorted(
            [f"{hosp_a.name}: {hn_a}", f"{hosp_b.name}: {hn_b}"]
        )

    def test_browse_also_carries_hn_labels(self, db, admin_user):
        # The registration HN chips and the management page's HN column both
        # read p.hn, so it is filled without a search term too.
        registrar, _ = admin_user
        hospital = make_hospital(db)
        patient = make_patient(db)
        case = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hospital, patient=patient)
        case.hn = f"HN-{uuid.uuid4().hex[:8]}"
        db.commit()

        found = next(p for p in get_patients(db, q=None, limit=1000) if p.id == patient.id)

        assert found.hn == f"{hospital.name}: {case.hn}"

    def test_search_matches_last_name_and_full_name(self, db):
        unique = uuid.uuid4().hex[:8]
        patient = Patient(name=f"Somchai{unique}", ln=f"Jaidee{unique}")
        db.add(patient)
        db.commit()

        assert [p.id for p in get_patients(db, q=f"Jaidee{unique}")] == [patient.id]
        assert [p.id for p in get_patients(db, q=f"Somchai{unique} Jaidee")] == [patient.id]

    def test_like_wildcards_in_the_term_are_literal(self, db):
        unique = uuid.uuid4().hex[:8]
        make_patient(db, name=f"Wild-{unique}")

        assert get_patients(db, q=f"Wild_{unique}") == []
        assert get_patients(db, q=f"%{unique}") == []


class TestSearchPatients:
    def test_pages_newest_first_with_total(self, db):
        unique = uuid.uuid4().hex[:8]
        created = [make_patient(db, name=f"Paged-{unique}-{i}") for i in range(5)]
        newest_first = [p.id for p in reversed(created)]

        first, total = search_patients(db, q=f"Paged-{unique}", skip=0, limit=2)
        second, _ = search_patients(db, q=f"Paged-{unique}", skip=2, limit=2)

        assert total == 5
        assert [p.id for p in first] == newest_first[:2]
        assert [p.id for p in second] == newest_first[2:4]

    def test_finds_a_patient_past_the_first_hundred(self, db):
        # The management page used to load 100 rows and filter in the browser.
        target = make_patient(db, name=f"Needle-{uuid.uuid4().hex[:8]}")
        db.add_all([Patient(name=f"Hay-{i}") for i in range(105)])
        db.commit()

        items, total = search_patients(db, q=target.name, limit=20)

        assert total == 1
        assert items[0].id == target.id


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

    def test_refuses_patient_with_surgical_case_and_keeps_the_case(self, db, admin_user):
        # Surgical cases used to be cascade-deleted along with the patient.
        registrar, _ = admin_user
        patient = make_patient(db)
        case = make_bare_case(db, registrar_id=registrar.id, patient=patient)

        with pytest.raises(HTTPException) as exc:
            delete_patient(db, patient.id)

        assert exc.value.status_code == 409
        assert "Surgical 1" in exc.value.detail
        db.expire_all()
        assert db.get(Patient, patient.id) is not None
        assert db.get(SurgicalCase, case.id) is not None

    @pytest.mark.parametrize(
        "make_case, label",
        [(make_bare_gyne_case, "Gyne 1"), (make_bare_nongyne_case, "Non-gyne 1")],
    )
    def test_refuses_patient_with_cytology_case(self, db, admin_user, make_case, label):
        # These used to fail on the NOT NULL foreign key with a bare 500.
        registrar, _ = admin_user
        patient = make_patient(db)
        make_case(db, registrar_id=registrar.id, patient=patient)

        with pytest.raises(HTTPException) as exc:
            delete_patient(db, patient.id)

        assert exc.value.status_code == 409
        assert label in exc.value.detail
        assert db.get(Patient, patient.id) is not None

    def test_counts_every_case_type(self, db, admin_user):
        registrar, _ = admin_user
        patient = make_patient(db)
        make_bare_case(db, registrar_id=registrar.id, patient=patient)
        make_bare_case(db, registrar_id=registrar.id, patient=patient)
        make_bare_gyne_case(db, registrar_id=registrar.id, patient=patient)
        make_bare_nongyne_case(db, registrar_id=registrar.id, patient=patient)
        db.add(
            MolecularCase(
                # Not "M26-…": _get_next_molecular_accession_no reads the highest
                # M26- number, and a hex suffix would reset later tests to M26-00001.
                accession_no=f"MTEST-{uuid.uuid4().hex[:12]}",
                patient_id=patient.id,
                ap_test_id=make_anatomical_pathology_test(db, category="Molecular").id,
                registrar_id=registrar.id,
            )
        )
        db.commit()

        assert count_patient_cases(db, patient.id) == {
            "Surgical": 2,
            "Gyne": 1,
            "Non-gyne": 1,
            "Molecular": 1,
        }
