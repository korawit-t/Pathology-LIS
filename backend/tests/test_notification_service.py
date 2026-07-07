"""Tests for app/services/notification_service.py. Same asyncio.run()
approach as test_llm_service.py for the async send_* functions (no
pytest-asyncio installed). httpx is mocked throughout for send_line_message/
send_slack_message; notify_signed_out/broadcast_to_channels are tested by
mocking the lower-level senders directly, since their own logic (rule/channel
lookup, per-item exception swallowing) is what's worth covering — not
re-proving the transport layer works."""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import app.services.notification_service as notification_service
from app.crud.notification_rule import upsert_rule
from app.crud.notification_channel import create_channel
from app.schemas.notification_rule import NotificationRuleUpdate
from app.schemas.notification_channel import NotificationChannelCreate


def _mock_async_client(status_code=200, text=""):
    response = MagicMock()
    response.status_code = status_code
    response.text = text

    client = MagicMock()
    client.post = AsyncMock(return_value=response)

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, client


class TestFillTemplate:
    def test_replaces_known_placeholders(self):
        result = notification_service._fill_template("HN: {hn}, Case: {id_case}", {"hn": "HN-001", "id_case": "S26-1"})

        assert result == "HN: HN-001, Case: S26-1"

    def test_unknown_placeholder_becomes_a_dash(self):
        result = notification_service._fill_template("Doctor: {clinician}", {})

        assert result == "Doctor: -"


class TestToBangkokStr:
    def test_naive_datetime_is_assumed_utc(self):
        naive = datetime(2026, 1, 15, 3, 0, 0)  # 03:00 UTC -> 10:00 Bangkok (+7)

        assert notification_service.to_bangkok_str(naive) == "15/01/2026 10:00"

    def test_timezone_aware_datetime_converts_correctly(self):
        aware = datetime(2026, 1, 15, 3, 0, 0, tzinfo=timezone.utc)

        assert notification_service.to_bangkok_str(aware) == "15/01/2026 10:00"


class TestSendLineMessage:
    def test_missing_credentials_raise_value_error(self):
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(notification_service.send_line_message({}, "hello"))

    def test_success_returns_sent_status(self, monkeypatch):
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(
            notification_service.send_line_message(
                {"channel_access_token": "tok", "to_user_id": "U123"}, "hello",
            )
        )

        assert result == {"status": "sent", "platform": "line", "response_code": 200}
        client.post.assert_called_once()

    def test_non_success_status_raises_runtime_error(self, monkeypatch):
        import pytest
        ctx, client = _mock_async_client(status_code=400, text="bad request")
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        with pytest.raises(RuntimeError):
            asyncio.run(
                notification_service.send_line_message(
                    {"channel_access_token": "tok", "to_user_id": "U123"}, "hello",
                )
            )


class TestSendSlackMessage:
    def test_missing_webhook_url_raises_value_error(self):
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(notification_service.send_slack_message({}, "hello"))

    def test_success_returns_sent_status(self, monkeypatch):
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(
            notification_service.send_slack_message({"webhook_url": "https://hooks.slack.com/x"}, "hello"),
        )

        assert result == {"status": "sent", "platform": "slack", "response_code": 200}


class TestSendTestNotification:
    def test_unsupported_platform_raises_value_error(self):
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(notification_service.send_test_notification("telegram", {}))

    def test_fills_dummy_data_into_the_default_template_for_line(self, monkeypatch):
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(
            notification_service.send_test_notification(
                "line", {"channel_access_token": "tok", "to_user_id": "U1"},
            )
        )

        sent_message = client.post.call_args.kwargs["json"]["messages"][0]["text"]
        assert "HN-TEST-001" in sent_message

    def test_uses_a_custom_template_when_provided(self, monkeypatch):
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(
            notification_service.send_test_notification(
                "line", {"channel_access_token": "tok", "to_user_id": "U1", "message_template": "Custom: {hn}"},
            )
        )

        sent_message = client.post.call_args.kwargs["json"]["messages"][0]["text"]
        assert sent_message == "Custom: HN-TEST-001"


class TestSendRealNotification:
    def test_fills_the_provided_data_dict_not_dummy_data(self, monkeypatch):
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(
            notification_service.send_real_notification(
                "line",
                {"channel_access_token": "tok", "to_user_id": "U1", "message_template": "HN: {hn}"},
                {"hn": "HN-REAL-999"},
            )
        )

        sent_message = client.post.call_args.kwargs["json"]["messages"][0]["text"]
        assert sent_message == "HN: HN-REAL-999"

    def test_unsupported_platform_raises_value_error(self):
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(notification_service.send_real_notification("telegram", {}, {}))


class TestBroadcastToChannels:
    def test_sends_to_every_channel_and_keeps_going_after_one_fails(self):
        ch_ok = MagicMock(platform="line", credentials={"a": 1})
        ch_fails = MagicMock(platform="slack", credentials={"b": 2})
        ch_after = MagicMock(platform="line", credentials={"c": 3})

        with patch.object(notification_service, "send_real_notification", new=AsyncMock(
            side_effect=[None, RuntimeError("boom"), None],
        )) as mock_send:
            asyncio.run(notification_service.broadcast_to_channels(
                [ch_ok, ch_fails, ch_after], "template {hn}", {"hn": "HN-1"},
            ))

        assert mock_send.call_count == 3  # the RuntimeError from the 2nd channel didn't stop the 3rd


class TestNotifySignedOut:
    def test_does_nothing_when_no_active_rule_exists(self, db):
        with patch.object(notification_service, "_send_line_sync") as mock_send:
            notification_service.notify_signed_out(db, {"hn": "HN-1"})

        mock_send.assert_not_called()

    def test_does_nothing_when_rule_is_active_but_has_no_channels(self, db):
        upsert_rule(db, "case_signed_out", NotificationRuleUpdate(is_active=True, channel_ids=[]))

        with patch.object(notification_service, "_send_line_sync") as mock_send:
            notification_service.notify_signed_out(db, {"hn": "HN-1"})

        mock_send.assert_not_called()

    def test_sends_to_each_active_channel_referenced_by_the_rule(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Ch1", credentials={"token": "x"}, is_active=True),
        )
        upsert_rule(
            db, "case_signed_out",
            NotificationRuleUpdate(is_active=True, channel_ids=[channel.id], message_template="Signed: {hn}"),
        )

        with patch.object(notification_service, "_send_line_sync") as mock_send:
            notification_service.notify_signed_out(db, {"hn": "HN-42"})

        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        assert args[1] == "Signed: HN-42"

    def test_skips_a_channel_that_is_inactive(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Ch2", credentials={}, is_active=False),
        )
        upsert_rule(db, "case_signed_out", NotificationRuleUpdate(is_active=True, channel_ids=[channel.id]))

        with patch.object(notification_service, "_send_line_sync") as mock_send:
            notification_service.notify_signed_out(db, {"hn": "HN-1"})

        mock_send.assert_not_called()

    def test_swallows_exceptions_from_the_underlying_sender(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Ch3", credentials={}, is_active=True),
        )
        upsert_rule(db, "case_signed_out", NotificationRuleUpdate(is_active=True, channel_ids=[channel.id]))

        with patch.object(notification_service, "_send_line_sync", side_effect=RuntimeError("network down")):
            notification_service.notify_signed_out(db, {"hn": "HN-1"})  # must not raise
