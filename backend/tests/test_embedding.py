"""Tests for app/crud/embedding.py — run-number sequencing (daily prefix +
sequence, with a reuse-empty-run optimization and a UniqueViolation retry
loop on the race), and add_multiple_blocks_to_embedding's case-promotion
guard (only flips a case to "embedded" once every block in it has been
embedded, mirroring the same pattern already covered for sectioning)."""

from app.crud.embedding import (
    generate_embedding_run_no,
    create_embedding_run,
    add_multiple_blocks_to_embedding,
    get_pending_blocks,
    get_embedding_pending_tree,
    delete_empty_embedding_run,
)
from app.models.embedding import EmbeddingRun, EmbeddingDetail

from tests.factories import make_signable_case, make_block


class TestGenerateEmbeddingRunNo:
    def test_first_run_of_the_day(self, db):
        db.query(EmbeddingDetail).delete()
        db.query(EmbeddingRun).delete()
        db.commit()
        assert generate_embedding_run_no(db).endswith("-0001")


class TestCreateEmbeddingRun:
    def test_reuses_empty_run_for_same_user_same_day(self, db, admin_user):
        registrar, _ = admin_user
        run1 = create_embedding_run(db, registrar.id)
        run2 = create_embedding_run(db, registrar.id)

        assert run1.id == run2.id

    def test_different_users_get_different_runs(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        run1 = create_embedding_run(db, path1.id)
        run2 = create_embedding_run(db, path2.id)

        assert run1.id != run2.id

    def test_run_no_not_reused_once_it_has_details(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")
        run1 = create_embedding_run(db, registrar.id)
        add_multiple_blocks_to_embedding(db, run1.id, [block.id])

        run2 = create_embedding_run(db, registrar.id)

        assert run2.id != run1.id


class TestAddMultipleBlocksToEmbedding:
    def test_marks_blocks_embedded(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")
        run = create_embedding_run(db, registrar.id)

        details = add_multiple_blocks_to_embedding(db, run.id, [block.id])

        assert len(details) == 1
        db.refresh(block)
        assert block.status == "embedded"

    def test_promotes_case_only_when_all_blocks_embedded(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block1 = make_block(db, specimen.id, block_no=1, status="processed")
        block2 = make_block(db, specimen.id, block_no=2, status="processed")
        run = create_embedding_run(db, registrar.id)

        add_multiple_blocks_to_embedding(db, run.id, [block1.id])
        db.refresh(case)
        assert case.status != "embedded"  # block2 still not embedded

        add_multiple_blocks_to_embedding(db, run.id, [block2.id])
        db.refresh(case)
        assert case.status == "embedded"


class TestGetPendingBlocks:
    def test_only_processed_status(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        pending = make_block(db, specimen.id, block_no=1, status="processed")
        not_pending = make_block(db, specimen.id, block_no=2, status="grossed")

        result_ids = [b.id for b in get_pending_blocks(db)]

        assert pending.id in result_ids
        assert not_pending.id not in result_ids


class TestGetEmbeddingPendingTree:
    def test_groups_processed_blocks_by_case(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")

        tree = get_embedding_pending_tree(db)

        case_node = next((c for c in tree if c["id"] == case.id), None)
        assert case_node is not None
        assert any(child["id"] == block.id for child in case_node["children"])


class TestDeleteEmptyEmbeddingRun:
    def test_deletes_run_with_no_details(self, db, admin_user):
        registrar, _ = admin_user
        run = create_embedding_run(db, registrar.id)

        assert delete_empty_embedding_run(db, run.id) is True
        assert db.query(EmbeddingRun).filter(EmbeddingRun.id == run.id).first() is None

    def test_refuses_to_delete_run_with_details(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, status="processed")
        run = create_embedding_run(db, registrar.id)
        add_multiple_blocks_to_embedding(db, run.id, [block.id])

        assert delete_empty_embedding_run(db, run.id) is False
        assert db.query(EmbeddingRun).filter(EmbeddingRun.id == run.id).first() is not None

    def test_missing_run_returns_false(self, db):
        assert delete_empty_embedding_run(db, 999999) is False
