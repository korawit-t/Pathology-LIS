"""Tests for app/crud/surgical_block_event.py — the block timeline
aggregator, which merges auto-derived events from 6 different workflow
tables (processing, embedding, sectioning, staining, storage) plus manual
events into one chronologically-sorted list. Coverage focuses on the
inclusion/exclusion conditions for each auto-event and manual-event labeling,
since a wrongly-included or mis-ordered entry would misrepresent a block's
real chain-of-custody history."""

from datetime import datetime, timedelta, timezone

from app.crud.surgical_block_event import create_event, delete_event, get_timeline
from app.schemas.surgical_block_event import BlockEventCreate
from app.models.surgical_block_event import SurgicalBlockEvent
from app.models.embedding import EmbeddingRun, EmbeddingDetail
from app.models.sectioning import SectioningRun, SectioningDetail
from app.models.tissue_processing import TissueProcessingRun, TissueProcessingItem
from app.models.block_storage import BlockStorageRun, BlockStorageDetail
from app.models.surgical_block_stain import SurgicalBlockStain, SurgicalStainRun, SurgicalStainRunDetail

from tests.factories import make_signable_case, make_block, make_anatomical_pathology_test


class TestCreateAndDeleteEvent:
    def test_create_defaults_event_at_when_missing(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)

        event = create_event(db, block.id, BlockEventCreate(event_type="NOTE", note="hi"), performed_by_id=registrar.id)

        assert event.id is not None
        assert event.event_at is not None

    def test_delete_removes_event(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        event = create_event(db, block.id, BlockEventCreate(event_type="NOTE"), performed_by_id=registrar.id)

        delete_event(db, event.id)

        assert db.query(SurgicalBlockEvent).filter(SurgicalBlockEvent.id == event.id).first() is None

    def test_delete_missing_event_is_a_noop(self, db):
        delete_event(db, 999999)  # must not raise


class TestGetTimeline:
    def test_always_includes_grossed_entry(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)

        timeline = get_timeline(db, block.id)

        assert any(e.event_type == "GROSSED" for e in timeline)

    def test_processing_out_absent_until_completed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        run = TissueProcessingRun(
            run_number="PR-1", processor_name="M1", program_name="P1",
            created_by_id=registrar.id, block_in_total=1,
        )
        db.add(run)
        db.flush()
        db.add(TissueProcessingItem(run_id=run.id, block_id=block.id, status="in_machine"))
        db.commit()

        timeline = get_timeline(db, block.id)

        assert any(e.event_type == "PROCESSING_IN" for e in timeline)
        assert not any(e.event_type == "PROCESSING_OUT" for e in timeline)

    def test_processing_out_present_once_completed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        run = TissueProcessingRun(
            run_number="PR-2", processor_name="M1", program_name="P1",
            created_by_id=registrar.id, block_in_total=1, completed_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.flush()
        db.add(TissueProcessingItem(run_id=run.id, block_id=block.id, status="processed"))
        db.commit()

        timeline = get_timeline(db, block.id)
        assert any(e.event_type == "PROCESSING_OUT" for e in timeline)

    def test_sectioning_recut_gets_recut_label(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        run = SectioningRun(run_no="SR-1", user_id=registrar.id)
        db.add(run)
        db.flush()
        db.add(SectioningDetail(run_id=run.id, block_id=block.id, is_recut=True))
        db.commit()

        timeline = get_timeline(db, block.id)
        sectioned = next(e for e in timeline if e.event_type == "SECTIONED")
        assert "Recut" in sectioned.label

    def test_staining_entry_only_once_run_completed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(db)
        stain = SurgicalBlockStain(block_id=block.id, test_id=ap_test.id)
        db.add(stain)
        db.flush()
        run = SurgicalStainRun(run_no="STR-1", operator_id=registrar.id)  # no completed_at
        db.add(run)
        db.flush()
        db.add(SurgicalStainRunDetail(stain_run_id=run.id, stain_id=stain.id))
        db.commit()

        assert not any(e.event_type == "STAINED" for e in get_timeline(db, block.id))

        run.completed_at = datetime.now(timezone.utc)
        db.commit()

        assert any(e.event_type == "STAINED" for e in get_timeline(db, block.id))

    def test_manual_event_label_mapping(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        create_event(db, block.id, BlockEventCreate(event_type="SENT_TO_OUTLAB"), performed_by_id=registrar.id)

        timeline = get_timeline(db, block.id)
        manual = next(e for e in timeline if e.source == "manual")
        assert manual.label == "Sent to outlab"

    def test_entries_sorted_chronologically(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        now = datetime.now(timezone.utc)
        create_event(
            db, block.id, BlockEventCreate(event_type="NOTE", event_at=now + timedelta(days=1)),
            performed_by_id=registrar.id,
        )
        create_event(
            db, block.id, BlockEventCreate(event_type="NOTE", event_at=now - timedelta(days=1)),
            performed_by_id=registrar.id,
        )

        timeline = get_timeline(db, block.id)
        event_ats = [e.event_at for e in timeline]
        assert event_ats == sorted(event_ats)
