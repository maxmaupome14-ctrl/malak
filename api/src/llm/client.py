"""
Unified LLM client that works with OpenAI, Anthropic, or any OpenAI-compatible endpoint.

Uses the OpenAI SDK as the universal interface since most providers
(Ollama, vLLM, LiteLLM, Together, Groq) expose OpenAI-compatible APIs.

Cost optimization:
- Use cheap models (gpt-4o-mini, haiku) for routine scoring
- Use capable models (gpt-4o, sonnet) for recommendation generation
- JSON mode to minimize token waste
"""

import json
import logging
import re

from openai import AsyncOpenAI

from src.config import settings

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    """Create an OpenAI client with current settings."""
    return AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
    )


async def complete(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """
    Send a chat completion request to the configured LLM.

    Args:
        prompt: User message content.
        system: System message (sets agent behavior).
        model: Override model (defaults to settings.OPENAI_MODEL).
        temperature: Sampling temperature (lower = more deterministic).
        max_tokens: Maximum response length.

    Returns:
        The assistant's response text.
    """
    client = _get_client()
    messages: list[dict[str, str]] = []

    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    logger.debug("LLM request: model=%s tokens=%d", model or settings.OPENAI_MODEL, max_tokens)

    response = await client.chat.completions.create(
        model=model or settings.OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    content = response.choices[0].message.content or ""
    logger.debug(
        "LLM response: %d chars, usage=%s",
        len(content),
        response.usage,
    )
    return content


async def complete_json(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.2,
) -> dict:
    """
    Send a completion request and parse the response as JSON.

    Instructs the LLM to respond only with valid JSON and strips
    any markdown code fences that models sometimes add.

    Args:
        prompt: User message content.
        system: System message (will have JSON instruction appended).
        model: Override model.
        temperature: Lower default for structured output.

    Returns:
        Parsed JSON as a Python dict.

    Raises:
        json.JSONDecodeError: If the LLM response is not valid JSON.
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
    )

    # Strip markdown code fences if present
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    return json.loads(text)
