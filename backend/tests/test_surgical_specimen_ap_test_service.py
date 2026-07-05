"""Tests for app/crud/surgical_specimen_ap_test_service.py — ordering an AP
test onto a specimen auto-promotes the case to "pending immuno"/"pending
special stains" depending on category, and removing one recalculates the
case status from whatever AP tests remain across the whole case (falling
back to "pending diagnosis" once none are IHC/Histochem) — never touching a
case that's already in a terminal status (published/cancelled/completed)."""

from app.crud.surgical_specimen_ap_test_service import (
    create_specimen_test,
    get_specimen_tests,
    delete_specimen_test,
)
from app.schemas.surgical_specimen_ap_test import SpecimenAPTestCreate
from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest

from tests.factories import make_signable_case, make_anatomical_pathology_test


class TestCreateSpecimenTest:
    def test_ihc_test_promotes_case_to_pending_immuno(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Ki67")

        create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id))

        db.refresh(case)
        assert case.status == "pending immuno"

    def test_histochem_test_promotes_case_to_pending_special_stains(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        histochem_test = make_anatomical_pathology_test(db, category="Histochem", name="PAS")

        create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=histochem_test.id))

        db.refresh(case)
        assert case.status == "pending special stains"

    def test_other_category_leaves_case_status_untouched(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        original_status = case.status
        routine_test = make_anatomical_pathology_test(db, category="Histology", name="Routine HE")

        create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=routine_test.id))

        db.refresh(case)
        assert case.status == original_status

    def test_terminal_status_case_not_overwritten(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "published"
        db.commit()
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="p53")

        create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id))

        db.refresh(case)
        assert case.status == "published"


class TestGetSpecimenTests:
    def test_filters_to_specimen(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, name="Test A")
        item = create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ap_test.id))

        result = get_specimen_tests(db, specimen.id)

        assert [r.id for r in result] == [item.id]


class TestDeleteSpecimenTest:
    def test_missing_returns_none(self, db):
        assert delete_specimen_test(db, 999999) is None

    def test_falls_back_to_pending_diagnosis_when_no_ihc_or_histochem_remain(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER")
        item = create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id))
        db.refresh(case)
        assert case.status == "pending immuno"

        delete_specimen_test(db, item.id)

        db.refresh(case)
        assert case.status == "pending diagnosis"

    def test_reverts_to_histochem_when_ihc_removed_but_histochem_remains(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="CK20")
        histochem_test = make_anatomical_pathology_test(db, category="Histochem", name="Congo Red")
        ihc_item = create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id))
        create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=histochem_test.id))

        delete_specimen_test(db, ihc_item.id)

        db.refresh(case)
        assert case.status == "pending special stains"

    def test_terminal_status_case_not_recalculated(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Bcl2")
        item = create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id))
        case.status = "cancelled"
        db.commit()

        delete_specimen_test(db, item.id)

        db.refresh(case)
        assert case.status == "cancelled"

    def test_deletes_the_row(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, name="Test B")
        item = create_specimen_test(db, SpecimenAPTestCreate(surgical_specimen_id=specimen.id, ap_test_id=ap_test.id))

        delete_specimen_test(db, item.id)

        assert db.query(SurgicalSpecimenAPTest).filter(SurgicalSpecimenAPTest.id == item.id).first() is None
