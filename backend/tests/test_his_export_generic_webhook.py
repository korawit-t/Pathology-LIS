"""Tests for app/his_export/generic_webhook.py. Same httpx-mocking idiom as
test_notification_service.py (no pytest-asyncio installed, so async code is
driven via asyncio.run()).

Deliberately does NOT test for SSRF/private-IP rejection: unlike the Slack/
LINE notification webhooks, HIS_EXPORT_WEBHOOK_URL is an env-var set by
whoever deploys the server (same trust tier as HIS_DATABASE_URL), not a
value any authenticated application user can influence — and the expected
target for this LAN-only project is usually an on-LAN interface engine over
plain http. See generic_webhook.py's send() docstring comment."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.his_export.generic_webhook as generic_webhook


def _mock_async_client(status_code=200, text="", headers=None):
    response = MagicMock()
    response.status_code = status_code
    response.text = text
    response.headers = headers or {}

    client = MagicMock()
    client.post = AsyncMock(return_value=response)

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, client


class TestGenericWebhookAdapter:
    def test_missing_url_fails_without_network_call(self, monkeypatch):
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "")
        adapter = generic_webhook.GenericWebhookAdapter()

        result = asyncio.run(adapter.send({"accession_no": "S26-0001"}))

        assert result.success is False
        assert "not configured" in result.error_message

    def test_private_lan_http_url_is_allowed(self, monkeypatch):
        """Locks in the intentional behavior difference from the Slack/LINE
        webhook path: a plain-http, private-IP target (the realistic case for
        an on-LAN interface engine) must NOT be rejected."""
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "http://192.168.1.50:8080/hl7-inbox")
        ctx, client = _mock_async_client(status_code=200, text="ok")
        monkeypatch.setattr(generic_webhook.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(generic_webhook.GenericWebhookAdapter().send({"accession_no": "S26-0002"}))

        assert result.success is True
        client.post.assert_called_once()
        called_url = client.post.call_args.args[0]
        assert called_url == "http://192.168.1.50:8080/hl7-inbox"

    def test_success_returns_response_snapshot(self, monkeypatch):
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "https://his.example.com/inbox")
        ctx, client = _mock_async_client(status_code=201, text='{"ok":true}', headers={"X-Reference-Id": "ref-9"})
        monkeypatch.setattr(generic_webhook.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(generic_webhook.GenericWebhookAdapter().send({"accession_no": "S26-0003"}))

        assert result.success is True
        assert result.reference_id == "ref-9"
        assert result.response_snapshot == {"status_code": 201, "body": '{"ok":true}'}

    def test_non_2xx_response_is_a_failure(self, monkeypatch):
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "https://his.example.com/inbox")
        ctx, client = _mock_async_client(status_code=500, text="internal error")
        monkeypatch.setattr(generic_webhook.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(generic_webhook.GenericWebhookAdapter().send({"accession_no": "S26-0004"}))

        assert result.success is False
        assert "500" in result.error_message
        assert result.response_snapshot["status_code"] == 500

    def test_auth_header_sent_when_token_configured(self, monkeypatch):
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "https://his.example.com/inbox")
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_AUTH_HEADER", "X-Api-Key")
        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_AUTH_TOKEN", "secret-token")
        ctx, client = _mock_async_client(status_code=200)
        monkeypatch.setattr(generic_webhook.httpx, "AsyncClient", MagicMock(return_value=ctx))

        asyncio.run(generic_webhook.GenericWebhookAdapter().send({"accession_no": "S26-0005"}))

        sent_headers = client.post.call_args.kwargs["headers"]
        assert sent_headers == {"X-Api-Key": "secret-token"}

    def test_request_exception_is_a_failure_not_a_crash(self, monkeypatch):
        import httpx

        monkeypatch.setattr(generic_webhook, "HIS_EXPORT_WEBHOOK_URL", "https://his.example.com/inbox")
        client = MagicMock()
        client.post = AsyncMock(side_effect=httpx.ConnectTimeout("timed out"))
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        monkeypatch.setattr(generic_webhook.httpx, "AsyncClient", MagicMock(return_value=ctx))

        result = asyncio.run(generic_webhook.GenericWebhookAdapter().send({"accession_no": "S26-0006"}))

        assert result.success is False
        assert "Request failed" in result.error_message
