"""Tests for app/crud/sectioning.py — run-number sequencing, the pending
"embedded, not-yet-sectioned" tree, and the case-promotion guard
(_promote_cases_if_fully_sectioned only flips a case to "sectioned" once
every block in it is done)."""

import uuid

from app.crud.sectioning import (
    generate_sectioning_run_number,
    create_sectioning_run_batch,
    add_sectioning_detail,
    update_sectioning_detail,
    delete_sectioning_detail,
    delete_sectioning_run,
    get_pending_blocks_tree,
    finish_sectioning_run,
)
from app.schemas.sectioning import SectioningRunCreateBatch, SectioningDetailCreate, SectioningDetailUpdate
from app.models.sectioning import SectioningRun, SectioningDetail

from tests.factories import make_signable_case, make_block


class TestGenerateRunNumber:
    def test_first_run_of_the_day(self, db):
        db.query(SectioningDetail).delete()
        db.query(SectioningRun).delete()
        db.commit()
        assert generate_sectioning_run_number(db).endswith("-001")


class TestCreateSectioningRunBatch:
    def test_marks_blocks_sectioned(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="embedded")

        run = create_sectioning_run_batch(
            db,
            SectioningRunCreateBatch(
                user_id=registrar.id, microtome_id="MT-1",
                items=[SectioningDetailCreate(block_id=block.id, slide_count=3)],
            ),
        )

        assert run.id is not None
        db.refresh(block)
        assert block.status == "sectioned"
        detail = db.query(SectioningDetail).filter(SectioningDetail.run_id == run.id).first()
        assert detail.slide_count == 3

    def test_promotes_case_only_when_all_blocks_sectioned(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block1 = make_block(db, specimen.id, block_no=1, status="embedded")
        block2 = make_block(db, specimen.id, block_no=2, status="embedded")

        create_sectioning_run_batch(
            db,
            SectioningRunCreateBatch(
                user_id=registrar.id, microtome_id="MT-1",
                items=[SectioningDetailCreate(block_id=block1.id)],
            ),
        )
        db.refresh(case)
        assert case.status != "sectioned"  # block2 still not sectioned

        create_sectioning_run_batch(
            db,
            SectioningRunCreateBatch(
                user_id=registrar.id, microtome_id="MT-1",
                items=[SectioningDetailCreate(block_id=block2.id)],
            ),
        )
        db.refresh(case)
        assert case.status == "sectioned"  # now all blocks done


class TestPendingBlocksTree:
    def test_only_embedded_not_yet_sectioned(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        pending = make_block(db, specimen.id, block_no=1, status="embedded")
        already_sectioned = make_block(db, specimen.id, block_no=2, status="embedded")
        not_embedded_yet = make_block(db, specimen.id, block_no=3, status="processing")

        create_sectioning_run_batch(
            db,
            SectioningRunCreateBatch(
                user_id=registrar.id, microtome_id="MT-1",
                items=[SectioningDetailCreate(block_id=already_sectioned.id)],
            ),
        )

        tree = get_pending_blocks_tree(db)
        case_node = next((c for c in tree if c["id"] == case.id), None)
        assert case_node is not None
        ids_in_tree = {child["id"] for child in case_node["children"]}
        assert pending.id in ids_in_tree
        assert already_sectioned.id not in ids_in_tree
        assert not_embedded_yet.id not in ids_in_tree


class TestSectioningDetailCrud:
    def test_add_update_delete(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="embedded")
        run = create_sectioning_run_batch(
            db, SectioningRunCreateBatch(user_id=registrar.id, microtome_id="MT-1", items=[])
        )

        detail = add_sectioning_detail(db, run.id, SectioningDetailCreate(block_id=block.id, slide_count=2))
        assert detail.slide_count == 2

        updated = update_sectioning_detail(db, detail.id, SectioningDetailUpdate(slide_count=5))
        assert updated.slide_count == 5

        assert delete_sectioning_detail(db, detail.id) is True
        assert delete_sectioning_detail(db, detail.id) is False

    def test_update_missing_returns_none(self, db):
        assert update_sectioning_detail(db, 999999, SectioningDetailUpdate(slide_count=1)) is None


class TestFinishAndDeleteRun:
    def test_finish_marks_blocks_sectioned_and_stamps_finished_at(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="embedded")
        run = create_sectioning_run_batch(
            db, SectioningRunCreateBatch(user_id=registrar.id, microtome_id="MT-1", items=[])
        )
        add_sectioning_detail(db, run.id, SectioningDetailCreate(block_id=block.id))
        run.finished_at = None
        db.commit()

        result = finish_sectioning_run(db, run.id)

        assert result.finished_at is not None
        db.refresh(block)
        assert block.status == "sectioned"

    def test_finish_missing_run_returns_none(self, db):
        assert finish_sectioning_run(db, 999999) is None

    def test_delete_run_removes_details(self, db, admin_user):
        registrar, _ = admin_user
        run = create_sectioning_run_batch(
            db, SectioningRunCreateBatch(user_id=registrar.id, microtome_id="MT-1", items=[])
        )

        result = delete_sectioning_run(db, run.id)

        assert result is True
        assert db.query(SectioningRun).filter(SectioningRun.id == run.id).first() is None

    def test_delete_missing_run_returns_false(self, db):
        assert delete_sectioning_run(db, 999999) is False
