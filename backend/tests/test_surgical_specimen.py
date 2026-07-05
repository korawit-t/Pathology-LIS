"""Tests for app/crud/surgical_specimen.py — the gross-description
completeness check driving case status (grossed/in-progress, with a guard
against downgrading a case that's already further along), and the
delete-specimen guard blocking deletion once a block has entered tissue
processing (plus the re-labeling that follows a successful delete)."""

from app.crud.surgical_specimen import (
    update_specimen_gross,
    update_specimen_gross_draft,
    create_specimen,
    delete_specimen,
    update_specimen,
)
from app.schemas.surgical_specimen import SurgicalSpecimenUpdate, SurgicalSpecimenCreate
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.tissue_processing import TissueProcessingItem

import pytest
from fastapi import HTTPException

from tests.factories import make_signable_case


class TestUpdateSpecimenGross:
    def test_complete_description_marks_case_grossed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        updated = update_specimen_gross(
            db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p>Pink-tan tissue</p>"), registrar.id
        )

        assert updated.updated_by_id == registrar.id
        db.refresh(case)
        assert case.is_grossed is True
        assert case.status == "grossed"
        assert case.gross_at is not None

    def test_empty_description_keeps_case_in_progress(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        update_specimen_gross(db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p></p>"), registrar.id)

        db.refresh(case)
        assert case.is_grossed is False
        assert case.status == "in progress"

    def test_already_past_gross_status_not_downgraded_when_incomplete(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "stained"
        db.commit()

        update_specimen_gross(db, specimen.id, SurgicalSpecimenUpdate(gross_description=""), registrar.id)

        db.refresh(case)
        assert case.status == "stained"  # not reverted to "in progress"

    def test_already_past_gross_status_not_overwritten_when_complete(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "stained"
        db.commit()

        update_specimen_gross(db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p>Text</p>"), registrar.id)

        db.refresh(case)
        assert case.status == "stained"  # not reset back to "grossed"
        assert case.is_grossed is True  # flag itself still gets set

    def test_gross_at_not_overwritten_once_set(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        update_specimen_gross(db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p>First</p>"), registrar.id)
        db.refresh(case)
        first_gross_at = case.gross_at

        update_specimen_gross(db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p>Edited</p>"), registrar.id)

        db.refresh(case)
        assert case.gross_at == first_gross_at

    def test_missing_specimen_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        assert update_specimen_gross(db, 999999, SurgicalSpecimenUpdate(gross_description="x"), registrar.id) is None


class TestUpdateSpecimenGrossDraft:
    def test_does_not_change_case_status(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        original_status = case.status

        update_specimen_gross_draft(db, specimen.id, SurgicalSpecimenUpdate(gross_description="<p>Draft</p>"), registrar.id)

        db.refresh(case)
        assert case.status == original_status
        assert case.is_grossed is False


class TestCreateSpecimen:
    def test_labels_increment_alphabetically(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen_a = make_signable_case(db, registrar_id=registrar.id)  # "A" already exists

        specimen_b = create_specimen(
            db, SurgicalSpecimenCreate(surgical_case_id=case.id, specimen_name="Second"), registrar.id
        )

        assert specimen_b.specimen_label == "B"


class TestDeleteSpecimen:
    def test_blocked_when_block_sent_to_processing(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        from tests.factories import make_block
        block = make_block(db, specimen.id, status="processing")

        from app.models.tissue_processing import TissueProcessingRun
        run = TissueProcessingRun(
            run_number="PR-TEST-001", processor_name="M1", program_name="P1",
            created_by_id=registrar.id, block_in_total=1,
        )
        db.add(run)
        db.flush()
        db.add(TissueProcessingItem(run_id=run.id, block_id=block.id, status="in_machine"))
        db.commit()

        with pytest.raises(HTTPException) as exc:
            delete_specimen(db, specimen.id, registrar.id)
        assert exc.value.status_code == 400
        assert db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen.id).first() is not None

    def test_relabels_remaining_specimens_after_delete(self, db, admin_user):
        registrar, _ = admin_user
        case, spec_a = make_signable_case(db, registrar_id=registrar.id)
        spec_b = create_specimen(db, SurgicalSpecimenCreate(surgical_case_id=case.id, specimen_name="B"), registrar.id)
        spec_c = create_specimen(db, SurgicalSpecimenCreate(surgical_case_id=case.id, specimen_name="C"), registrar.id)

        result = delete_specimen(db, spec_b.id, registrar.id)

        assert result is True
        db.refresh(spec_c)
        assert spec_c.specimen_label == "B"  # re-labeled to fill the gap

    def test_missing_specimen_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        assert delete_specimen(db, 999999, registrar.id) is None


class TestUpdateSpecimen:
    def test_updates_provided_fields_and_stamps_audit(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        updated = update_specimen(db, specimen.id, SurgicalSpecimenUpdate(specimen_name="Renamed"), registrar.id)

        assert updated.specimen_name == "Renamed"
        assert updated.updated_by_id == registrar.id

    def test_missing_specimen_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        assert update_specimen(db, 999999, SurgicalSpecimenUpdate(specimen_name="x"), registrar.id) is None
