"""Tests for app/crud/his_export_log.py — the outbox mechanics (enqueue,
claim_batch, record_attempt_result, retry). resource_id is a polymorphic
reference with no DB-level FK (see model docstring), so these tests use
arbitrary integers rather than building real report rows — the outbox
logic itself doesn't care what's on the other end. Each test that doesn't
need a specific resource_id draws a random one (via _rid()) to avoid
colliding with real autoincrement report IDs created by other test files in
the same session, or with other rows left behind in the same run —
resource_id has no FK, so nothing stops the same int meaning two different
things across tests.

Real Postgres per conftest.py, so the partial unique index and
FOR UPDATE SKIP LOCKED are both exercised for real, not mocked."""

import random
from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

import app.his_export as his_export_config
from app.crud import his_export_log as crud
from app.his_export import DeliveryResult
from app.models.his_export_log import HisExportLog
from app.utils.time import local_now


def _rid() -> int:
    return random.randint(1_000_000, 999_999_999)


@pytest.fixture(autouse=True)
def _default_export_type(monkeypatch):
    """Most tests here want enqueue() to actually insert — default to a
    configured adapter type unless a test overrides it."""
    monkeypatch.setattr(his_export_config, "HIS_EXPORT_TYPE", "generic_webhook")
    monkeypatch.setattr(his_export_config, "HIS_EXPORT_MAX_ATTEMPTS", 8)
    monkeypatch.setattr(his_export_config, "HIS_EXPORT_BACKOFF_BASE_SECONDS", 10)
    monkeypatch.setattr(his_export_config, "HIS_EXPORT_BACKOFF_MAX_SECONDS", 100)


class TestEnqueue:
    def test_noop_when_type_is_none(self, db, monkeypatch):
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_TYPE", "none")
        rid = _rid()

        result = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=rid,
            accession_no="S26-0001", payload_snapshot={"a": 1},
        )
        db.commit()

        assert result is None
        assert db.query(HisExportLog).filter(HisExportLog.resource_id == rid).count() == 0

    def test_inserts_pending_row(self, db):
        row = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=_rid(),
            accession_no="S26-0002", payload_snapshot={"diagnosis_text": "test"},
        )
        db.commit()

        assert row is not None
        assert row.status == "pending"
        assert row.adapter_type == "generic_webhook"
        assert row.attempt_count == 0
        assert row.max_attempts == 8
        assert row.payload_snapshot == {"diagnosis_text": "test"}
        assert row.next_attempt_at is not None

    def test_idempotent_when_already_active(self, db):
        rid = _rid()
        first = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=rid,
            accession_no="S26-0003", payload_snapshot={"v": 1},
        )
        db.commit()

        second = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=rid,
            accession_no="S26-0003", payload_snapshot={"v": 2},
        )
        db.commit()

        assert second.id == first.id
        assert second.payload_snapshot == {"v": 1}  # unchanged, not overwritten
        count = db.query(HisExportLog).filter(
            HisExportLog.resource_type == "SurgicalReport", HisExportLog.resource_id == rid,
        ).count()
        assert count == 1

    def test_new_row_allowed_once_previous_is_terminal(self, db):
        rid = _rid()
        first = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=rid,
            accession_no="S26-0004", payload_snapshot={"v": 1},
        )
        db.commit()
        first.status = "sent"
        db.commit()

        second = crud.enqueue(
            db, resource_type="SurgicalReport", resource_id=rid,
            accession_no="S26-0004", payload_snapshot={"v": 2},
        )
        db.commit()

        assert second.id != first.id
        count = db.query(HisExportLog).filter(
            HisExportLog.resource_type == "SurgicalReport", HisExportLog.resource_id == rid,
        ).count()
        assert count == 2

    def test_partial_unique_index_rejects_duplicate_active_row_below_app_layer(self, db):
        """Belt-and-suspenders: even bypassing enqueue()'s own pre-check, the
        DB itself refuses a second active row for the same resource."""
        rid = _rid()
        db.add(HisExportLog(
            resource_type="SurgicalReport", resource_id=rid, status="pending",
            next_attempt_at=local_now(), attempt_count=0, max_attempts=8,
        ))
        db.commit()

        db.add(HisExportLog(
            resource_type="SurgicalReport", resource_id=rid, status="processing",
            next_attempt_at=local_now(), attempt_count=0, max_attempts=8,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


class TestClaimBatch:
    def test_claims_due_pending_rows(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="pending",
            next_attempt_at=local_now() - timedelta(seconds=5), attempt_count=0, max_attempts=8,
        )
        db.add(row)
        db.commit()

        claimed = crud.claim_batch(db, batch_size=10, stale_after_seconds=300)

        ids = [r.id for r in claimed]
        assert row.id in ids
        db.refresh(row)
        assert row.status == "processing"
        assert row.claimed_at is not None

    def test_does_not_claim_future_pending_rows(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="pending",
            next_attempt_at=local_now() + timedelta(hours=1), attempt_count=0, max_attempts=8,
        )
        db.add(row)
        db.commit()

        claimed = crud.claim_batch(db, batch_size=10, stale_after_seconds=300)

        assert row.id not in [r.id for r in claimed]

    def test_reclaims_stale_processing_rows(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="processing",
            claimed_at=local_now() - timedelta(seconds=600),
            next_attempt_at=local_now(), attempt_count=1, max_attempts=8,
        )
        db.add(row)
        db.commit()

        claimed = crud.claim_batch(db, batch_size=10, stale_after_seconds=300)

        assert row.id in [r.id for r in claimed]

    def test_does_not_reclaim_fresh_processing_rows(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="processing",
            claimed_at=local_now(),
            next_attempt_at=local_now(), attempt_count=1, max_attempts=8,
        )
        db.add(row)
        db.commit()

        claimed = crud.claim_batch(db, batch_size=10, stale_after_seconds=300)

        assert row.id not in [r.id for r in claimed]

    def test_ignores_terminal_statuses(self, db):
        resource_ids = [_rid() for _ in range(3)]
        for resource_id, status in zip(resource_ids, ("sent", "dead_letter", "cancelled")):
            db.add(HisExportLog(
                resource_type="SurgicalReport", resource_id=resource_id, status=status,
                next_attempt_at=local_now() - timedelta(seconds=5), attempt_count=0, max_attempts=8,
            ))
        db.commit()

        claimed = crud.claim_batch(db, batch_size=50, stale_after_seconds=300)

        assert all(r.resource_id not in resource_ids for r in claimed)


class TestRecordAttemptResult:
    def test_success_marks_sent(self, db):
        row = crud.enqueue(db, resource_type="SurgicalReport", resource_id=_rid(), accession_no="S26-0020", payload_snapshot={})
        db.commit()

        crud.record_attempt_result(db, log_id=row.id, result=DeliveryResult(
            success=True, reference_id="ref-123", response_snapshot={"status_code": 200},
        ))
        db.refresh(row)

        assert row.status == "sent"
        assert row.sent_at is not None
        assert row.his_reference_id == "ref-123"
        assert row.error_message is None

    def test_failure_with_budget_left_schedules_backoff_retry(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="processing",
            attempt_count=0, max_attempts=8, next_attempt_at=local_now(),
        )
        db.add(row)
        db.commit()

        before = local_now()
        crud.record_attempt_result(db, log_id=row.id, result=DeliveryResult(success=False, error_message="boom"))
        db.refresh(row)

        assert row.status == "pending"
        assert row.attempt_count == 1
        assert row.error_message == "boom"
        # backoff = BASE * 2**(1-1) = BASE (monkeypatched to 10s)
        assert row.next_attempt_at >= before + timedelta(seconds=9)
        assert row.next_attempt_at <= before + timedelta(seconds=15)

    def test_failure_at_max_attempts_dead_letters(self, db):
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="processing",
            attempt_count=2, max_attempts=3, next_attempt_at=local_now(),
        )
        db.add(row)
        db.commit()

        crud.record_attempt_result(db, log_id=row.id, result=DeliveryResult(success=False, error_message="still failing"))
        db.refresh(row)

        assert row.status == "dead_letter"
        assert row.attempt_count == 3


class TestRetry:
    def test_retry_dead_letter_creates_new_pending_row(self, db, admin_user):
        user, _ = admin_user
        old = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), accession_no="S26-0030",
            status="dead_letter", attempt_count=8, max_attempts=8,
            payload_snapshot={"diagnosis_text": "x"},
        )
        db.add(old)
        db.commit()

        new_row = crud.retry(db, log_id=old.id, current_user=user)

        assert new_row.id != old.id
        assert new_row.status == "pending"
        assert new_row.attempt_count == 0
        assert new_row.triggered_by == "manual"
        assert new_row.created_by_user_id == user.id
        assert new_row.payload_snapshot == {"diagnosis_text": "x"}
        db.refresh(old)
        assert old.status == "dead_letter"  # untouched, immutable history

    def test_retry_missing_log_raises_404(self, db, admin_user):
        from fastapi import HTTPException
        user, _ = admin_user

        with pytest.raises(HTTPException) as exc_info:
            crud.retry(db, log_id=999999, current_user=user)
        assert exc_info.value.status_code == 404

    def test_retry_active_row_raises_400(self, db, admin_user):
        from fastapi import HTTPException
        user, _ = admin_user
        row = HisExportLog(
            resource_type="SurgicalReport", resource_id=_rid(), status="pending",
            attempt_count=0, max_attempts=8, next_attempt_at=local_now(),
        )
        db.add(row)
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            crud.retry(db, log_id=row.id, current_user=user)
        assert exc_info.value.status_code == 400
