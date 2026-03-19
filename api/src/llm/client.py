"""
Unified LLM client — supports Anthropic (primary) and OpenAI (fallback).

Kansa uses Claude Opus 4.6 as the default model for all AI operations.
OpenAI is kept as a fallback if Anthropic key is not configured.
"""

import json
import logging
import re

import anthropic
from openai import AsyncOpenAI

from src.config import settings

logger = logging.getLogger(__name__)

# Default models
ANTHROPIC_MODEL = "claude-opus-4-6-20250514"
OPENAI_MODEL = "gpt-4o"


def _get_anthropic_client() -> anthropic.AsyncAnthropic | None:
    """Create an Anthropic client if API key is configured."""
    key = settings.ANTHROPIC_API_KEY
    if not key:
        return None
    return anthropic.AsyncAnthropic(api_key=key)


def _get_openai_client() -> AsyncOpenAI | None:
    """Create an OpenAI client if API key is configured."""
    key = settings.OPENAI_API_KEY
    if not key:
        return None
    return AsyncOpenAI(
        api_key=key,
        base_url=settings.OPENAI_BASE_URL,
    )


async def _anthropic_complete(
    prompt: str,
    system: str = "",
    model: str = ANTHROPIC_MODEL,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Send a completion request via Anthropic API."""
    client = _get_anthropic_client()
    if not client:
        raise RuntimeError("Anthropic API key not configured")

    logger.debug("Anthropic request: model=%s max_tokens=%d", model, max_tokens)

    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system

    response = await client.messages.create(**kwargs)

    content = ""
    for block in response.content:
        if block.type == "text":
            content += block.text

    logger.debug(
        "Anthropic response: %d chars, input=%d output=%d tokens",
        len(content),
        response.usage.input_tokens,
        response.usage.output_tokens,
    )
    return content


async def _openai_complete(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Send a completion request via OpenAI API."""
    client = _get_openai_client()
    if not client:
        raise RuntimeError("OpenAI API key not configured")

    use_model = model or settings.OPENAI_MODEL or OPENAI_MODEL
    logger.debug("OpenAI request: model=%s max_tokens=%d", use_model, max_tokens)

    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=use_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    content = response.choices[0].message.content or ""
    logger.debug("OpenAI response: %d chars, usage=%s", len(content), response.usage)
    return content


async def complete(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    provider: str | None = None,
) -> str:
    """
    Send a chat completion request to the best available LLM.

    Priority: Anthropic (Opus 4.6) → OpenAI (GPT-4o)
    Use provider="anthropic" or provider="openai" to force a specific provider.
    """
    # Determine provider
    if provider == "openai":
        return await _openai_complete(prompt, system, model, temperature, max_tokens)
    if provider == "anthropic":
        return await _anthropic_complete(prompt, system, model or ANTHROPIC_MODEL, temperature, max_tokens)

    # Auto-select: prefer Anthropic
    if settings.ANTHROPIC_API_KEY:
        try:
            return await _anthropic_complete(
                prompt, system, model or ANTHROPIC_MODEL, temperature, max_tokens
            )
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)

    if settings.OPENAI_API_KEY:
        return await _openai_complete(prompt, system, model, temperature, max_tokens)

    raise RuntimeError(
        "No AI API key configured. Set ANTHROPIC_API_KEY (recommended) "
        "or OPENAI_API_KEY in the server .env file."
    )


async def complete_json(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.2,
    provider: str | None = None,
) -> dict:
    """
    Send a completion request and parse the response as JSON.

    Instructs the LLM to respond only with valid JSON.
    """
    json_instruction = (
        "\n\nIMPORTANT: Respond ONLY with valid JSON. "
        "No markdown code fences, no explanation, no text before or after the JSON."
    )

    text = await complete(
        prompt=prompt,
        system=system + json_instruction,
        model=model,
        temperature=temperature,
        provider=provider,
    )

    # Strip markdown code fences if present
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    return json.loads(text)
