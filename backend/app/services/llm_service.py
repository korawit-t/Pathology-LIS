import json
from typing import Protocol
import httpx
from app.models.llm_profile import LlmProfile
from app.core.config import OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENAI_COMPATIBLE_API_KEY


class LlmProfileLike(Protocol):
    provider: str
    model: str
    base_url: str | None


def _get_api_key(provider: str) -> str:
    if provider == "anthropic":
        return ANTHROPIC_API_KEY
    if provider == "openai_compatible":
        return OPENAI_COMPATIBLE_API_KEY
    return OPENAI_API_KEY


def parse_json_response(raw: str) -> dict:
    """Parse a JSON-mode LLM response into a dict.

    Providers asked for a JSON *object* usually return one, but some (e.g.
    Gemini) don't strictly enforce that and can wrap it in a JSON array
    instead — unwrap the first element in that case rather than letting
    callers crash on `.get()` against a list."""
    data = json.loads(raw)
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object from the LLM, got {type(data).__name__}: {raw[:200]!r}")
    return data


async def call_llm(
    profile: LlmProfile,
    system_prompt: str,
    user_message: str,
    max_tokens: int = 512,
    timeout: float = 30.0,
) -> str:
    api_key = _get_api_key(profile.provider)

    if profile.provider == "anthropic":
        return await _call_anthropic(api_key, profile.model, system_prompt, user_message, max_tokens, timeout)

    base_url = (profile.base_url or "https://api.openai.com/v1").rstrip("/")
    return await _call_openai_compat(api_key, base_url, profile.model, system_prompt, user_message, max_tokens, timeout)


async def test_connection(profile: LlmProfileLike) -> str:
    """Minimal 1-word round trip to confirm the profile's credentials/model actually work, kept cheap on purpose.

    max_tokens=50 (not lower) because reasoning models (e.g. Gemini 2.5, which
    thinks by default) spend part of the token budget on hidden reasoning
    tokens before the visible answer — 5-10 tokens gets fully consumed by
    that and returns empty content with finish_reason="length"."""
    api_key = _get_api_key(profile.provider)
    system_prompt = "Reply with a single word."
    user_message = "Say OK."

    if profile.provider == "anthropic":
        raw = await _call_anthropic(api_key, profile.model, system_prompt, user_message, max_tokens=50, timeout=15.0)
        return raw

    base_url = (profile.base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{base_url}/chat/completions"
    payload = {
        "model": profile.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0,
        "max_tokens": 50,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"})
        resp.raise_for_status()
        data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if not content:
            raise ValueError(f"Provider returned no content (finish_reason={(data.get('choices') or [{}])[0].get('finish_reason')!r}) — response: {data}")
        return content


async def _call_openai_compat(
    api_key: str, base_url: str, model: str, system_prompt: str, user_message: str,
    max_tokens: int = 512, timeout: float = 30.0,
) -> str:
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"})
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_anthropic(
    api_key: str, model: str, system_prompt: str, user_message: str,
    max_tokens: int = 512, timeout: float = 30.0,
) -> str:
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]
