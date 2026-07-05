"""Tests for app/crud/tissue_processing.py — run-number generation, the
grossed-status guard on run creation, the block_ids diff logic in update_run,
and complete_processing_run's processed/missing block handling."""

from datetime import datetime

import pytest
from fastapi import HTTPException

from app.crud.tissue_processing import (
    generate_run_number,
    create_processing_run,
    get_pending_blocks_tree,
    update_run,
    update_run_status,
    complete_processing_run,
    create_processor_machine,
    update_processor_machine,
    delete_processor_machine,
)
from app.schemas.tissue_processing import (
    TissueProcessingRunCreate,
    TissueProcessingRunUpdate,
    TissueProcessingRunEdit,
    ProcessorMachineCreate,
    ProcessorMachineUpdate,
)
from app.models.tissue_processing import TissueProcessingRun, TissueProcessingItem
from app.models.surgical_block import SurgicalBlock

from tests.factories import make_signable_case, make_block


class TestGenerateRunNumber:
    def test_first_run_of_the_day(self, db):
        db.query(TissueProcessingItem).delete()
        db.query(TissueProcessingRun).delete()
        db.commit()
        assert generate_run_number(db).endswith("-01")


class TestCreateProcessingRun:
    def test_rejects_blocks_not_grossed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processing")  # not "grossed"

        with pytest.raises(HTTPException) as exc:
            create_processing_run(
                db,
                TissueProcessingRunCreate(
                    processor_name="Machine-1", program_name="Program-1",
                    start_at=datetime.now(), block_ids=[block.id], created_by_id=registrar.id,
                ),
            )
        assert exc.value.status_code == 400

    def test_creates_run_items_and_marks_blocks_processing(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")

        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="Machine-1", program_name="Program-1",
                start_at=datetime.now(), block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        assert run.block_in_total == 1
        item = db.query(TissueProcessingItem).filter(TissueProcessingItem.run_id == run.id).first()
        assert item.block_id == block.id
        assert item.status == "in_machine"
        db.refresh(block)
        assert block.status == "processing"


class TestPendingBlocksTree:
    def test_only_grossed_blocks_included(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        grossed = make_block(db, specimen.id, block_no=1, status="grossed")
        processing = make_block(db, specimen.id, block_no=2, status="processing")

        tree = get_pending_blocks_tree(db)
        case_node = next((c for c in tree if c["code"] == case.accession_no), None)
        assert case_node is not None
        ids_in_tree = {child["id"] for child in case_node["children"]}
        assert grossed.id in ids_in_tree
        assert processing.id not in ids_in_tree


class TestUpdateRun:
    def test_adding_block_creates_item_and_marks_processing(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block1 = make_block(db, specimen.id, block_no=1, status="grossed")
        block2 = make_block(db, specimen.id, block_no=2, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block1.id], created_by_id=registrar.id,
            ),
        )

        updated = update_run(db, run.id, TissueProcessingRunEdit(block_ids=[block1.id, block2.id]))

        assert updated.block_in_total == 2
        db.refresh(block2)
        assert block2.status == "processing"
        item2 = db.query(TissueProcessingItem).filter(
            TissueProcessingItem.run_id == run.id, TissueProcessingItem.block_id == block2.id
        ).first()
        assert item2 is not None

    def test_removing_block_deletes_item_and_reverts_to_grossed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block1 = make_block(db, specimen.id, block_no=1, status="grossed")
        block2 = make_block(db, specimen.id, block_no=2, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block1.id, block2.id], created_by_id=registrar.id,
            ),
        )

        update_run(db, run.id, TissueProcessingRunEdit(block_ids=[block1.id]))

        db.refresh(block2)
        assert block2.status == "grossed"
        assert db.query(TissueProcessingItem).filter(
            TissueProcessingItem.run_id == run.id, TissueProcessingItem.block_id == block2.id
        ).count() == 0

    def test_missing_run_returns_none(self, db):
        assert update_run(db, 999999, TissueProcessingRunEdit(remark="x")) is None


class TestCompleteProcessingRun:
    def test_all_confirmed_marks_processed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        result = complete_processing_run(db, run.id, user_id=registrar.id, confirmed_block_ids=[block.id])

        assert result.status == "completed"
        db.refresh(block)
        assert block.status == "processed"
        item = db.query(TissueProcessingItem).filter(TissueProcessingItem.run_id == run.id).first()
        assert item.status == "completed"
        db.refresh(case)
        assert case.is_processed is True
        assert case.status == "processed"

    def test_missing_confirmed_block_reverts_to_grossed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        complete_processing_run(db, run.id, user_id=registrar.id, confirmed_block_ids=[])

        db.refresh(block)
        assert block.status == "grossed"  # missing -> sent back, not "processed"
        item = db.query(TissueProcessingItem).filter(TissueProcessingItem.run_id == run.id).first()
        assert item.status == "missing"

    def test_no_confirmed_ids_treats_all_as_processed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        complete_processing_run(db, run.id, user_id=registrar.id)  # confirmed_block_ids=None

        db.refresh(block)
        assert block.status == "processed"

    def test_missing_run_returns_none(self, db):
        assert complete_processing_run(db, 999999) is None


class TestUpdateRunStatus:
    def test_completed_status_routes_to_complete_processing_run(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        result = update_run_status(db, run.id, status="completed", user_id=registrar.id)

        assert result.status == "completed"
        assert result.completed_at is not None

    def test_other_status_just_sets_field(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_processing_run(
            db,
            TissueProcessingRunCreate(
                processor_name="M1", program_name="P1", start_at=datetime.now(),
                block_ids=[block.id], created_by_id=registrar.id,
            ),
        )

        result = update_run_status(db, run.id, status="paused")

        assert result.status == "paused"
        assert result.completed_at is None


class TestProcessorMachineCrud:
    def test_create_update_delete(self, db):
        machine = create_processor_machine(db, ProcessorMachineCreate(name="Leica ASP300"))
        assert machine.id is not None

        updated = update_processor_machine(db, machine.id, ProcessorMachineUpdate(is_active=False))
        assert updated.is_active is False

        assert delete_processor_machine(db, machine.id) is True
        assert delete_processor_machine(db, machine.id) is False  # already gone
