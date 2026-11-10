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


class TestMaskedNamePlaceholders:
    def test_name_short_and_clinician_short_are_masked(self):
        result = notification_service._fill_template(
            "{name_short} / {clinician_short}",
            {"name": "นาย สมชาย ใจดี", "clinician": "พญ.สุดา ใจงาม"},
        )

        assert result == "นาย สม*** ใจ*** / พญ. สุด*** ใจ***"

    def test_a_value_the_caller_passes_wins(self):
        result = notification_service._fill_template(
            "{name_short}", {"name": "นาย สมชาย ใจดี", "name_short": "custom"},
        )

        assert result == "custom"

    def test_no_source_name_means_a_dash(self):
        assert notification_service._fill_template("{name_short}|{clinician_short}", {}) == "-|-"

    def test_frontend_triggered_events_get_them_too(self, monkeypatch):
        """trigger_event hands the frontend's data dict straight to
        send_real_notification, which must still offer the masked forms."""
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(notification_service.send_real_notification(
            "line",
            {"channel_access_token": "tok", "to_user_id": "U1", "message_template": "{hn} {name_short}"},
            {"hn": "HN-9", "name": "นาง มาลี แก้วตา"},
        ))

        assert client.post.call_args.kwargs["json"]["messages"][0]["text"] == "HN-9 นาง มา*** แก้***"


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


def _mock_sync_client(status_code=200, text="", json_body=None):
    response = MagicMock()
    response.status_code = status_code
    response.text = text
    if json_body is None:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = json_body

    client = MagicMock()
    client.post = MagicMock(return_value=response)

    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=client)
    ctx.__exit__ = MagicMock(return_value=False)
    return ctx, client


def _mock_moph_async_client(json_body, status_code=200, text=""):
    ctx, client = _mock_async_client(status_code=status_code, text=text)
    response = client.post.return_value
    if json_body is None:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = json_body
    return ctx, client


_MOPH_KEYS = {"client_key": "ck-test", "secret_key": "sk-test"}
# The replies listed in MOPH's "API Document MOPH Notify".
_MOPH_OK = {"message": "Success", "message_code": 200}
_MOPH_UNAUTHORIZED = {"message": "Unauthorized", "message_code": 401}
_MOPH_BAD_FORMAT = {"message": "messages error", "message_code": 401}


class TestSendMophNotifyMessage:
    def test_missing_keys_raise_value_error(self):
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(notification_service.send_moph_notify_message({"client_key": "only-one"}, "hello"))

    def test_posts_to_the_documented_endpoint_with_both_keys_as_headers(self, monkeypatch):
        ctx, client = _mock_moph_async_client(_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(notification_service.send_moph_notify_message(_MOPH_KEYS, "hello"))

        args, kwargs = client.post.call_args
        assert args[0] == "https://morpromt2f.moph.go.th/api/notify/send"
        assert kwargs["headers"]["client-key"] == "ck-test"
        assert kwargs["headers"]["secret-key"] == "sk-test"
        assert kwargs["json"] == {"messages": [{"type": "text", "text": "hello"}]}
        assert result == {"status": "sent", "platform": "moph_notify", "response_code": 200}

    def test_custom_base_url_on_moph_go_th_is_used(self, monkeypatch):
        ctx, client = _mock_moph_async_client(_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(notification_service.send_moph_notify_message(
            {**_MOPH_KEYS, "base_url": "https://uat.moph.go.th/"}, "hello",
        ))

        assert client.post.call_args.args[0] == "https://uat.moph.go.th/api/notify/send"

    def test_base_url_off_moph_go_th_is_refused_before_any_request(self, monkeypatch):
        """The keys ride on every request; a base_url anywhere but moph.go.th
        would hand them to whoever runs that host."""
        import pytest
        async_client = MagicMock()
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", async_client)

        for bad in (
            "http://morpromt2f.moph.go.th",          # not https
            "https://moph.go.th.evil.example",       # suffix trick
            "https://evilmoph.go.th",                # no dot boundary
            "https://evil.example/x.moph.go.th",     # moph only in the path
            "https://user@morpromt2f.moph.go.th",    # userinfo
            "https://evil.example\\@morpromt2f.moph.go.th",  # parser disagreement
        ):
            with pytest.raises(ValueError):
                asyncio.run(notification_service.send_moph_notify_message({**_MOPH_KEYS, "base_url": bad}, "hi"))

        async_client.assert_not_called()

    def test_refusal_inside_an_http_200_is_still_an_error(self, monkeypatch):
        """The document gives the failures as message_code 401 in the body
        and never says the HTTP status changes — so a 200 must not be
        trusted on its own."""
        import pytest
        ctx, _ = _mock_moph_async_client(_MOPH_UNAUTHORIZED, status_code=200)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        with pytest.raises(RuntimeError, match="Unauthorized.*client-key or secret-key is wrong"):
            asyncio.run(notification_service.send_moph_notify_message(_MOPH_KEYS, "hello"))

    def test_refusal_with_an_http_401_names_the_reason(self, monkeypatch):
        import pytest
        ctx, _ = _mock_moph_async_client(_MOPH_BAD_FORMAT, status_code=401)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        with pytest.raises(RuntimeError, match="messages error.*format LINE accepts"):
            asyncio.run(notification_service.send_moph_notify_message(_MOPH_KEYS, "hello"))

    def test_a_200_without_message_code_is_not_taken_as_sent(self, monkeypatch):
        """e.g. a proxy's HTML page: nothing says the message went out."""
        import pytest
        ctx, _ = _mock_moph_async_client(None, status_code=200, text="<html>proxy</html>")
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        with pytest.raises(RuntimeError, match="proxy"):
            asyncio.run(notification_service.send_moph_notify_message(_MOPH_KEYS, "hello"))

    def test_send_test_notification_routes_moph_notify(self, monkeypatch):
        ctx, client = _mock_moph_async_client(_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(notification_service.send_test_notification("moph_notify", _MOPH_KEYS))

        sent = client.post.call_args.kwargs["json"]["messages"][0]["text"]
        assert "HN-TEST-001" in sent

    def test_send_real_notification_routes_moph_notify(self, monkeypatch):
        ctx, client = _mock_moph_async_client(_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(notification_service.send_real_notification(
            "moph_notify", {**_MOPH_KEYS, "message_template": "HN: {hn}"}, {"hn": "HN-REAL-7"},
        ))

        assert client.post.call_args.kwargs["json"]["messages"][0]["text"] == "HN: HN-REAL-7"


class TestSendMophNotifySync:
    def test_sends_with_both_keys(self, monkeypatch):
        ctx, client = _mock_sync_client(json_body=_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "Client", MagicMock(return_value=ctx))

        notification_service._send_moph_notify_sync(_MOPH_KEYS, "hello")

        args, kwargs = client.post.call_args
        assert args[0] == "https://morpromt2f.moph.go.th/api/notify/send"
        assert kwargs["headers"]["secret-key"] == "sk-test"

    def test_bad_base_url_or_missing_keys_send_nothing(self, monkeypatch):
        sync_client = MagicMock()
        monkeypatch.setattr(notification_service.httpx, "Client", sync_client)

        notification_service._send_moph_notify_sync({}, "hello")
        notification_service._send_moph_notify_sync({**_MOPH_KEYS, "base_url": "https://evil.example"}, "hello")

        sync_client.assert_not_called()

    def test_success_logs_nothing(self, monkeypatch, caplog):
        import logging
        ctx, _ = _mock_sync_client(json_body=_MOPH_OK)
        monkeypatch.setattr(notification_service.httpx, "Client", MagicMock(return_value=ctx))

        with caplog.at_level(logging.WARNING, logger=notification_service.__name__):
            notification_service._send_moph_notify_sync(_MOPH_KEYS, "hello")

        assert caplog.text == ""

    def test_refusal_in_an_http_200_is_logged_without_the_keys(self, monkeypatch, caplog):
        import logging
        ctx, _ = _mock_sync_client(status_code=200, json_body=_MOPH_UNAUTHORIZED)
        monkeypatch.setattr(notification_service.httpx, "Client", MagicMock(return_value=ctx))

        with caplog.at_level(logging.WARNING, logger=notification_service.__name__):
            notification_service._send_moph_notify_sync(_MOPH_KEYS, "hello")

        assert "Unauthorized" in caplog.text
        assert "message_code=401" in caplog.text
        assert "sk-test" not in caplog.text
        assert "ck-test" not in caplog.text

    def test_notify_event_dispatches_a_moph_notify_channel(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="moph_notify", name="MOPH grp", credentials=_MOPH_KEYS, is_active=True),
        )
        upsert_rule(
            db, "case_signed_out",
            NotificationRuleUpdate(is_active=True, channel_ids=[channel.id], message_template="Out: {hn}"),
        )

        with patch.object(notification_service, "_send_moph_notify_sync") as mock_send, \
             patch.object(notification_service, "_send_line_sync") as mock_line:
            notification_service.notify_signed_out(db, {"hn": "HN-77"})

        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        assert args[0] == _MOPH_KEYS
        assert args[1] == "Out: HN-77"
        mock_line.assert_not_called()
