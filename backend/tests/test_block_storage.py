"""Tests for app/crud/block_storage.py — block storage/dispose lifecycle."""

import uuid

from app.crud.block_storage import (
    generate_block_storage_run_number,
    get_pending_storage_blocks_tree,
    create_block_storage_run_batch,
    dispose_block_details,
    delete_block_storage_run,
)
from app.schemas.block_storage import BlockStorageRunCreateBatch, BlockStorageDetailCreate
from app.models.surgical_block import SurgicalBlock
from app.models.block_storage import BlockStorageDetail

from tests.factories import make_signable_case, make_block


class TestGenerateRunNumber:
    def test_first_run_of_the_day(self, db, admin_user):
        from app.models.block_storage import BlockStorageRun
        db.query(BlockStorageDetail).delete()
        db.query(BlockStorageRun).delete()
        db.commit()
        assert generate_block_storage_run_number(db).endswith("-001")

    def test_increments_sequence_same_day(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")

        run1 = create_block_storage_run_batch(
            db, BlockStorageRunCreateBatch(user_id=registrar.id, items=[BlockStorageDetailCreate(block_id=block.id)])
        )
        second_no = generate_block_storage_run_number(db)
        assert second_no != run1.run_no
        assert int(second_no.split("-")[-1]) == int(run1.run_no.split("-")[-1]) + 1


class TestPendingStorageBlocksTree:
    def test_includes_sectioned_and_stained_excludes_stored(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        pending_block = make_block(db, specimen.id, block_no=1, status="sectioned")
        stained_block = make_block(db, specimen.id, block_no=2, status="stained")
        grossed_block = make_block(db, specimen.id, block_no=3, status="grossed")

        create_block_storage_run_batch(
            db, BlockStorageRunCreateBatch(user_id=registrar.id, items=[BlockStorageDetailCreate(block_id=pending_block.id)])
        )

        tree = get_pending_storage_blocks_tree(db)
        case_node = next((c for c in tree if c["id"] == case.id), None)
        assert case_node is not None
        block_ids_in_tree = {child["id"] for child in case_node["children"]}

        assert stained_block.id in block_ids_in_tree
        assert pending_block.id not in block_ids_in_tree  # already stored
        assert grossed_block.id not in block_ids_in_tree  # not yet sectioned/stained


class TestCreateBlockStorageRunBatch:
    def test_creates_run_details_and_marks_blocks_stored(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")

        run = create_block_storage_run_batch(
            db,
            BlockStorageRunCreateBatch(
                user_id=registrar.id,
                items=[BlockStorageDetailCreate(block_id=block.id, storage_location="Shelf-1")],
            ),
        )

        assert run.id is not None
        detail = db.query(BlockStorageDetail).filter(BlockStorageDetail.run_id == run.id).first()
        assert detail.block_id == block.id
        assert detail.storage_location == "Shelf-1"
        db.refresh(block)
        assert block.status == "stored"


class TestDisposeBlockDetails:
    def test_marks_discarded_with_stamp(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")
        run = create_block_storage_run_batch(
            db, BlockStorageRunCreateBatch(user_id=registrar.id, items=[BlockStorageDetailCreate(block_id=block.id)])
        )
        detail = db.query(BlockStorageDetail).filter(BlockStorageDetail.run_id == run.id).first()

        result = dispose_block_details(db, [detail.id], user_id=registrar.id)

        assert result[0].discard_status is True
        assert result[0].discard_at is not None
        assert result[0].discard_by_id == registrar.id


class TestDeleteBlockStorageRun:
    def test_reverts_block_status_and_deletes(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="sectioned")
        run = create_block_storage_run_batch(
            db, BlockStorageRunCreateBatch(user_id=registrar.id, items=[BlockStorageDetailCreate(block_id=block.id)])
        )

        result = delete_block_storage_run(db, run.id)

        assert result is True
        db.refresh(block)
        assert block.status == "sectioned"
        from app.models.block_storage import BlockStorageRun
        assert db.query(BlockStorageRun).filter(BlockStorageRun.id == run.id).first() is None

    def test_missing_run_returns_false(self, db):
        assert delete_block_storage_run(db, 999999) is False
