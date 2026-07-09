"""Tests for app/services/llm_service.py. No pytest-asyncio is installed in
this project and no other test file uses async def tests, so these drive
the coroutines via asyncio.run() inside plain sync test functions rather
than introducing a new test-runner dependency for one file.

httpx.AsyncClient is mocked throughout — these tests must never hit a real
network endpoint."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.services.llm_service as llm_service
from app.models.llm_profile import LlmProfile


def _mock_async_client(json_data=None):
    """Patches llm_service.httpx.AsyncClient so `async with httpx.AsyncClient(...) as client`
    yields a client whose .post() resolves to a fake JSON response."""
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json = MagicMock(return_value=json_data or {})

    client = MagicMock()
    client.post = AsyncMock(return_value=response)

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, client


def _profile(**overrides) -> LlmProfile:
    fields = dict(display_name="Test Profile", provider="openai", model="gpt-4o", is_active=True)
    fields.update(overrides)
    return LlmProfile(**fields)


class TestGetApiKey:
    def test_dispatches_by_provider(self, monkeypatch):
        monkeypatch.setattr(llm_service, "OPENAI_API_KEY", "openai-key")
        monkeypatch.setattr(llm_service, "ANTHROPIC_API_KEY", "anthropic-key")
        monkeypatch.setattr(llm_service, "OPENAI_COMPATIBLE_API_KEY", "compat-key")

        assert llm_service._get_api_key("anthropic") == "anthropic-key"
        assert llm_service._get_api_key("openai_compatible") == "compat-key"
        assert llm_service._get_api_key("openai") == "openai-key"

    def test_unknown_provider_falls_back_to_openai_key(self, monkeypatch):
        monkeypatch.setattr(llm_service, "OPENAI_API_KEY", "openai-key")

        assert llm_service._get_api_key("some_future_provider") == "openai-key"


class TestCallLlm:
    def test_anthropic_provider_posts_to_the_anthropic_endpoint(self, monkeypatch):
        ctx, client = _mock_async_client(json_data={"content": [{"text": "hello from claude"}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="anthropic", model="claude-x")

        result = asyncio.run(llm_service.call_llm(profile, "system prompt", "user message"))

        assert result == "hello from claude"
        args, kwargs = client.post.call_args
        assert args[0] == "https://api.anthropic.com/v1/messages"
        assert kwargs["json"]["model"] == "claude-x"
        assert kwargs["json"]["messages"] == [{"role": "user", "content": "user message"}]
        assert kwargs["headers"]["x-api-key"] is not None

    def test_openai_compatible_provider_posts_to_its_own_base_url(self, monkeypatch):
        # base_url is the exact root before /chat/completions — the admin includes
        # any version segment themselves (e.g. "/v1"), since providers like Gemini
        # ("/v1beta/openai/chat/completions", no extra "/v1") don't follow the
        # OpenAI/Ollama "/v1/chat/completions" convention.
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"content": "hello from gpt"}}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="openai_compatible", model="local-model", base_url="http://localhost:11434/v1")

        result = asyncio.run(llm_service.call_llm(profile, "system prompt", "user message"))

        assert result == "hello from gpt"
        args, kwargs = client.post.call_args
        assert args[0] == "http://localhost:11434/v1/chat/completions"
        assert kwargs["json"]["messages"][0] == {"role": "system", "content": "system prompt"}

    def test_no_base_url_defaults_to_the_real_openai_endpoint(self, monkeypatch):
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"content": "hi"}}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="openai", base_url=None)

        asyncio.run(llm_service.call_llm(profile, "system", "user"))

        args, kwargs = client.post.call_args
        assert args[0] == "https://api.openai.com/v1/chat/completions"

    def test_trailing_slash_on_base_url_is_not_doubled(self, monkeypatch):
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"content": "hi"}}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="openai_compatible", base_url="http://localhost:11434/v1/")

        asyncio.run(llm_service.call_llm(profile, "system", "user"))

        args, _ = client.post.call_args
        assert args[0] == "http://localhost:11434/v1/chat/completions"

    def test_gemini_style_base_url_with_no_extra_v1_segment(self, monkeypatch):
        # Regression test: Gemini's OpenAI-compat endpoint is exactly
        # ".../v1beta/openai/chat/completions" — no additional "/v1" segment,
        # unlike OpenAI/Ollama. This must not be mangled by the URL builder.
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"content": "ok"}}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(
            provider="openai_compatible",
            model="gemini-2.0-flash",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        )

        asyncio.run(llm_service.call_llm(profile, "system", "user"))

        args, _ = client.post.call_args
        assert args[0] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


class TestParseJsonResponse:
    def test_plain_object_passes_through(self):
        assert llm_service.parse_json_response('{"a": 1}') == {"a": 1}

    def test_list_wrapped_object_is_unwrapped(self):
        # Regression: Gemini's json-mode doesn't strictly enforce a
        # top-level object — it can wrap the intended object in a JSON
        # array, e.g. '[{"topography_code": "C50.1"}]'. This must not
        # crash callers doing result.get(...).
        assert llm_service.parse_json_response('[{"a": 1}]') == {"a": 1}

    def test_empty_list_becomes_empty_dict(self):
        assert llm_service.parse_json_response("[]") == {}

    def test_non_object_non_list_raises_value_error(self):
        try:
            llm_service.parse_json_response('"just a string"')
            assert False, "expected ValueError"
        except ValueError as e:
            assert "str" in str(e)


class TestTestConnection:
    def test_openai_compatible_returns_reply_text(self, monkeypatch):
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="openai_compatible", base_url="http://localhost:11434/v1")

        result = asyncio.run(llm_service.test_connection(profile))

        assert result == "OK"
        _, kwargs = client.post.call_args
        assert kwargs["json"]["max_tokens"] == 50

    def test_empty_content_raises_instead_of_keyerror(self, monkeypatch):
        # Regression: reasoning models (e.g. Gemini 2.5) can consume the whole
        # token budget on hidden thinking tokens and return a message with no
        # "content" key at all plus finish_reason="length" — this must surface
        # as a clean error, not an unhandled KeyError crashing the endpoint.
        ctx, client = _mock_async_client(json_data={"choices": [{"message": {"role": "assistant"}, "finish_reason": "length"}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="openai_compatible", model="gemini-2.5-flash")

        try:
            asyncio.run(llm_service.test_connection(profile))
            assert False, "expected ValueError"
        except ValueError as e:
            assert "length" in str(e)

    def test_anthropic_uses_generous_token_budget(self, monkeypatch):
        ctx, client = _mock_async_client(json_data={"content": [{"text": "OK"}]})
        monkeypatch.setattr(llm_service.httpx, "AsyncClient", MagicMock(return_value=ctx))
        profile = _profile(provider="anthropic", model="claude-x")

        result = asyncio.run(llm_service.test_connection(profile))

        assert result == "OK"
        _, kwargs = client.post.call_args
        assert kwargs["json"]["max_tokens"] == 50
