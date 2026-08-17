"""Tests for app/utils/block_workflow.py — the Grossing → Tissue Processing →
Embedding → Sectioning → H&E step gate.

Two things are covered: the pending lists each stage offers (a block must not be
listed before it cleared the previous stage) and the write paths (scanning a
stale list or calling the API directly must not skip a stage). The whole gate is
a no-op when enable_tissue_processing_workflow is off, since that setting means
the lab stains straight off the grossing bench.

Every test sets the SystemSetting singleton explicitly — it's a real-DB row
shared by the whole session, so relying on whatever an earlier test left behind
would make these order-dependent.
"""

import pytest
from fastapi import HTTPException

from app.crud.embedding import (
    add_multiple_blocks_to_embedding,
    create_embedding_run,
    get_embedding_pending_tree,
)
from app.crud.sectioning import create_sectioning_run_batch
from app.crud.stain_run import create_he_batch_run, create_stain_run
from app.crud.surgical_block_stain import (
    create_stain as create_block_stain,
    get_stains,
    get_stains_tree,
)
from app.schemas.sectioning import SectioningDetailCreate, SectioningRunCreateBatch
from app.schemas.stain_run import StainRunCreate
from app.schemas.surgical_block_stain import StainCreate
from app.utils.block_workflow import is_stepped_workflow_enabled

from tests.factories import (
    clear_system_settings,
    make_anatomical_pathology_test,
    make_block,
    make_signable_case,
    make_system_setting,
)


def _stepped(db, enabled: bool):
    make_system_setting(db, enable_tissue_processing_workflow=enabled)


def _he_stain_on(db, status: str):
    """A pending H&E order on a block sitting at `status`, plus its case."""
    from app.models.user import User

    registrar = db.query(User).first()
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id, status=status)
    he_test = make_anatomical_pathology_test(db, system_code="HE_ROUTINE", category="Histology")
    stain = create_block_stain(db, StainCreate(block_id=block.id, test_id=he_test.id))
    return case, block, he_test, stain


class TestIsSteppedWorkflowEnabled:
    def test_defaults_to_enabled_when_no_settings_row_exists(self, db):
        clear_system_settings(db)
        assert is_stepped_workflow_enabled(db) is True

    def test_reads_the_setting(self, db):
        _stepped(db, False)
        assert is_stepped_workflow_enabled(db) is False


class TestHeStainingPendingTree:
    """create_block seeds a pending H&E order the moment a block is grossed, so
    without a block-status gate every freshly grossed block would be offered for
    staining."""

    def test_hides_a_block_that_has_not_been_sectioned(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "grossed")

        tree = get_stains_tree(db, status="pending", test_id=he_test.id)

        assert not any(node["title"] == case.accession_no for node in tree)

    def test_hides_an_embedded_but_uncut_block(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "embedded")

        tree = get_stains_tree(db, status="pending", test_id=he_test.id)

        assert not any(node["title"] == case.accession_no for node in tree)

    def test_lists_a_sectioned_block(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "sectioned")

        tree = get_stains_tree(db, status="pending", test_id=he_test.id)

        assert any(node["title"] == case.accession_no for node in tree)

    def test_lists_a_consult_block(self, db, admin_user):
        """An out-lab consult rewrites every block of the case to "consult",
        losing its pipeline stage — those blocks must stay stainable when the
        slides come back rather than falling off the worklist."""
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "consult")

        tree = get_stains_tree(db, status="pending", test_id=he_test.id)

        assert any(node["title"] == case.accession_no for node in tree)

    def test_lists_a_grossed_block_when_the_stepped_workflow_is_off(self, db, admin_user):
        _stepped(db, False)
        case, block, he_test, stain = _he_stain_on(db, "grossed")

        tree = get_stains_tree(db, status="pending", test_id=he_test.id)

        assert any(node["title"] == case.accession_no for node in tree)


class TestPendingStainList:
    """The flat pending list behind StainRun's selection modal gets the same
    gate as the H&E tree, so the two worklists can't disagree about what's
    ready to stain."""

    def test_pending_excludes_an_uncut_block(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "grossed")

        pending = get_stains(db, status="pending", limit=500)

        assert stain.id not in {s.id for s in pending}

    def test_pending_includes_a_sectioned_block(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "sectioned")

        pending = get_stains(db, status="pending", limit=500)

        assert stain.id in {s.id for s in pending}


class TestEmbeddingPendingTree:
    def test_only_lists_blocks_out_of_the_processor(self, db, admin_user):
        _stepped(db, True)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        grossed = make_block(db, specimen.id, block_no=1, status="grossed")
        processed = make_block(db, specimen.id, block_no=2, status="processed")

        tree = get_embedding_pending_tree(db)
        node = next(n for n in tree if n["id"] == case.id)
        listed_ids = {child["id"] for child in node["children"]}

        assert processed.id in listed_ids
        assert grossed.id not in listed_ids


class TestWritePathGate:
    def test_embedding_rejects_a_block_that_skipped_processing(self, db, admin_user):
        _stepped(db, True)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="grossed")
        run = create_embedding_run(db, registrar.id)

        with pytest.raises(HTTPException) as exc:
            add_multiple_blocks_to_embedding(db, run.id, [block.id])

        assert exc.value.status_code == 400
        db.rollback()
        db.refresh(block)
        assert block.status == "grossed"

    def test_embedding_accepts_a_processed_block(self, db, admin_user):
        _stepped(db, True)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")
        run = create_embedding_run(db, registrar.id)

        add_multiple_blocks_to_embedding(db, run.id, [block.id])

        db.refresh(block)
        assert block.status == "embedded"

    def test_sectioning_rejects_a_block_that_was_never_embedded(self, db, admin_user):
        _stepped(db, True)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")

        with pytest.raises(HTTPException) as exc:
            create_sectioning_run_batch(
                db,
                SectioningRunCreateBatch(
                    user_id=registrar.id,
                    microtome_id="M-01",
                    items=[SectioningDetailCreate(block_id=block.id, slide_count=1)],
                ),
            )

        assert exc.value.status_code == 400
        db.rollback()
        db.refresh(block)
        assert block.status == "processed"

    def test_he_batch_run_rejects_an_uncut_block(self, db, admin_user):
        _stepped(db, True)
        case, block, he_test, stain = _he_stain_on(db, "embedded")

        with pytest.raises(HTTPException) as exc:
            create_he_batch_run(db, {"items": [{"block_id": stain.id}]}, operator_id=None)

        assert exc.value.status_code == 400
        db.rollback()
        db.refresh(stain)
        assert stain.status == "pending"

    def test_stain_run_rejects_an_uncut_block(self, db, admin_user):
        _stepped(db, True)
        registrar, _ = admin_user
        case, block, he_test, stain = _he_stain_on(db, "grossed")

        with pytest.raises(HTTPException) as exc:
            create_stain_run(db, StainRunCreate(stain_ids=[stain.id]), user_id=registrar.id)

        assert exc.value.status_code == 400

    def test_he_batch_run_allows_a_grossed_block_when_the_stepped_workflow_is_off(
        self, db, admin_user
    ):
        _stepped(db, False)
        case, block, he_test, stain = _he_stain_on(db, "grossed")

        create_he_batch_run(db, {"items": [{"block_id": stain.id}]}, operator_id=None)

        db.refresh(stain)
        assert stain.status == "stained"
