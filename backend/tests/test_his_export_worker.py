"""Tests for app/his_export/worker.py's per-row processing and poll-cycle
logic. Same asyncio.run() approach as test_notification_service.py (no
pytest-asyncio installed). The adapter and PDF loader are mocked here —
their own behavior is covered by test_his_export_generic_webhook.py and the
pdf_service/report-builder tests respectively; this file is about the
worker's own orchestration (claim -> attempt -> record, error isolation)."""

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import app.his_export as his_export_config
import app.his_export.worker as worker
from app.his_export import DeliveryResult
from app.models.his_export_log import HisExportLog
from app.utils.time import local_now

from tests.test_his_export_log import _rid


def _pending_row(db, **overrides):
    fields = dict(
        resource_type="SurgicalReport", resource_id=_rid(), accession_no="S26-W001",
        status="pending", attempt_count=0, max_attempts=8, next_attempt_at=local_now() - timedelta(seconds=1),
        payload_snapshot={"diagnosis_text": "test"},
    )
    fields.update(overrides)
    row = HisExportLog(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestProcessOne:
    def test_success_marks_row_sent(self, db, monkeypatch):
        row = _pending_row(db)
        mock_adapter = AsyncMock()
        mock_adapter.send = AsyncMock(return_value=DeliveryResult(success=True, reference_id="ref-1"))
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", False)

        asyncio.run(worker._process_one(row.id, row.resource_type, row.resource_id, row.accession_no, row.payload_snapshot))

        db.refresh(row)
        assert row.status == "sent"
        assert row.his_reference_id == "ref-1"
        mock_adapter.send.assert_called_once_with({"diagnosis_text": "test"})

    def test_failure_schedules_retry(self, db, monkeypatch):
        row = _pending_row(db)
        mock_adapter = AsyncMock()
        mock_adapter.send = AsyncMock(return_value=DeliveryResult(success=False, error_message="unreachable"))
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", False)

        asyncio.run(worker._process_one(row.id, row.resource_type, row.resource_id, row.accession_no, row.payload_snapshot))

        db.refresh(row)
        assert row.status == "pending"
        assert row.attempt_count == 1
        assert row.error_message == "unreachable"

    def test_adapter_exception_is_recorded_as_failure_not_a_crash(self, db, monkeypatch):
        row = _pending_row(db)
        mock_adapter = AsyncMock()
        mock_adapter.send = AsyncMock(side_effect=RuntimeError("adapter blew up"))
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", False)

        # Must not raise.
        asyncio.run(worker._process_one(row.id, row.resource_type, row.resource_id, row.accession_no, row.payload_snapshot))

        db.refresh(row)
        assert row.status == "pending"
        assert row.attempt_count == 1
        assert "adapter blew up" in row.error_message

    def test_pdf_inclusion_adds_pdf_base64_to_payload(self, db, monkeypatch):
        row = _pending_row(db, payload_snapshot={"diagnosis_text": "test"})
        mock_adapter = AsyncMock()
        mock_adapter.send = AsyncMock(return_value=DeliveryResult(success=True))
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", True)
        monkeypatch.setattr(worker, "_load_pdf_base64", AsyncMock(return_value="ZmFrZS1wZGY="))

        asyncio.run(worker._process_one(row.id, row.resource_type, row.resource_id, row.accession_no, row.payload_snapshot))

        sent_payload = mock_adapter.send.call_args.args[0]
        assert sent_payload["pdf_base64"] == "ZmFrZS1wZGY="
        assert sent_payload["diagnosis_text"] == "test"  # original fields preserved
        # never persisted back onto the row's stored snapshot
        db.refresh(row)
        assert "pdf_base64" not in (row.payload_snapshot or {})

    def test_pdf_generation_failure_still_attempts_delivery_without_pdf(self, db, monkeypatch):
        row = _pending_row(db)
        mock_adapter = AsyncMock()
        mock_adapter.send = AsyncMock(return_value=DeliveryResult(success=True))
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", True)
        monkeypatch.setattr(worker, "_load_pdf_base64", AsyncMock(side_effect=RuntimeError("weasyprint blew up")))

        asyncio.run(worker._process_one(row.id, row.resource_type, row.resource_id, row.accession_no, row.payload_snapshot))

        sent_payload = mock_adapter.send.call_args.args[0]
        assert "pdf_base64" not in sent_payload
        db.refresh(row)
        assert row.status == "sent"  # delivery still succeeded, just without the PDF


class TestPollOnce:
    def test_processes_claimed_rows_and_isolates_per_row_failure(self, db, monkeypatch):
        good = _pending_row(db, accession_no="S26-W010")
        bad = _pending_row(db, accession_no="S26-W011")

        mock_adapter = AsyncMock()

        async def _send(payload):
            if payload.get("marker") == "bad":
                raise RuntimeError("boom")
            return DeliveryResult(success=True)

        mock_adapter.send = AsyncMock(side_effect=_send)
        monkeypatch.setattr(worker, "get_his_export_adapter", lambda: mock_adapter)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_INCLUDE_PDF", False)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_BATCH_SIZE", 50)
        monkeypatch.setattr(his_export_config, "HIS_EXPORT_STALE_PROCESSING_SECONDS", 300)
        bad.payload_snapshot = {"marker": "bad"}
        db.commit()

        # Must not raise even though one row's adapter call blows up.
        asyncio.run(worker._poll_once())

        db.refresh(good)
        db.refresh(bad)
        assert good.status == "sent"
        assert bad.status == "pending"  # failed, but scheduled for retry — not stuck
        assert bad.attempt_count == 1
