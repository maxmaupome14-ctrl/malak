"""
Chat routes — AI assistant endpoint using the merchant's BYOK OpenAI key.

Streams responses via Server-Sent Events so the frontend can render
tokens as they arrive.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.product import Product
from src.models.store import Store

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = (
    "You are Kansa, an AI ecommerce expert built into the Kansa platform. "
    "You help merchants optimize their store listings, analyze products, "
    "suggest improvements, and boost sales.\n\n"
    "IMPORTANT: You already have access to the merchant's store and product data — "
    "it is loaded below in your context. Do NOT ask the merchant for store URLs, "
    "API keys, or credentials. You already have everything you need.\n\n"
    "When a merchant asks you to analyze, optimize, or work on their products, "
    "refer directly to the product data in your context. Be specific — mention "
    "product names, prices, descriptions, and give concrete actionable advice.\n\n"
    "If the context shows 'No products synced yet', tell the merchant their "
    "products are still syncing and to give it a moment, then try again."
)

MAX_PRODUCTS_IN_CONTEXT = 50


# ── Schemas ───────────────────────────────────────────


class ChatMessage(BaseModel):
    """A single message in the conversation history."""

    role: str  # "user" | "assistant" | "system"
    content: str


class ChatRequest(BaseModel):
    """Incoming chat request."""

    message: str
    store_id: str | None = None
    messages: list[ChatMessage] = []


# ── Helpers ──────────────────────────────────────────


async def _build_store_context(
    store_id: str,
    user_id: uuid.UUID,
    session: AsyncSession,
) -> str:
    """Load store info and products, returning a text summary for the LLM."""
    try:
        sid = uuid.UUID(store_id)
    except ValueError:
        return ""

    # Fetch store
    result = await session.execute(
        select(Store).where(Store.id == sid, Store.user_id == user_id)
    )
    store = result.scalar_one_or_none()
    if not store:
        return ""

    parts: list[str] = [
        f"\n--- Merchant's Store: {store.name} ---",
        f"Platform: {store.platform}",
    ]
    if store.store_url:
        parts.append(f"URL: {store.store_url}")
    if store.marketplace:
        parts.append(f"Marketplace: {store.marketplace}")

    # Fetch products for this store
    result = await session.execute(
        select(Product)
        .where(Product.store_id == sid, Product.user_id == user_id)
        .order_by(Product.updated_at.desc())
        .limit(MAX_PRODUCTS_IN_CONTEXT)
    )
    products = list(result.scalars().all())

    if products:
        parts.append(f"\n--- Products ({len(products)} loaded) ---")
        for p in products:
            line = f"- {p.title}"
            if p.brand:
                line += f" | Brand: {p.brand}"
            if p.price is not None:
                line += f" | ${p.price:.2f} {p.currency}"
            if p.category:
                line += f" | Category: {p.category}"
            if p.rating is not None:
                line += f" | Rating: {p.rating}"
            if p.review_count:
                line += f" | Reviews: {p.review_count}"
            if p.description:
                # Truncate long descriptions
                desc = p.description[:200]
                if len(p.description) > 200:
                    desc += "..."
                line += f"\n  Description: {desc}"
            parts.append(line)
    else:
        parts.append("\nNo products synced yet for this store.")

    return "\n".join(parts)


async def _stream_openai(
    api_key: str,
    messages: list[dict[str, str]],
):
    """Stream chat completion tokens from OpenAI as SSE events."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)

    try:
        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                data = json.dumps({"content": delta.content})
                yield f"data: {data}\n\n"

        yield "data: [DONE]\n\n"

    except Exception as exc:
        logger.error("OpenAI streaming error: %s", exc)
        error_data = json.dumps({"error": str(exc)})
        yield f"data: {error_data}\n\n"
        yield "data: [DONE]\n\n"


async def _stream_anthropic(
    api_key: str,
    messages: list[dict[str, str]],
):
    """Stream chat completion tokens from Anthropic as SSE events."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)

    # Extract system message and convert to Anthropic format
    system_content = ""
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_content += msg["content"] + "\n"
        else:
            chat_messages.append({"role": msg["role"], "content": msg["content"]})

    try:
        async with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            messages=chat_messages,
            system=system_content.strip(),
            max_tokens=4096,
            temperature=0.7,
        ) as stream:
            async for text in stream.text_stream:
                data = json.dumps({"content": text})
                yield f"data: {data}\n\n"

        yield "data: [DONE]\n\n"

    except Exception as exc:
        logger.error("Anthropic streaming error: %s", exc)
        error_data = json.dumps({"error": str(exc)})
        yield f"data: {error_data}\n\n"
        yield "data: [DONE]\n\n"


# ── Routes ────────────────────────────────────────────


@router.post("")
async def chat(
    request: ChatRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    AI chat endpoint — streams an OpenAI response using the merchant's
    own API key (BYOK). Optionally includes store/product context.
    """
    # Validate BYOK key — accept either OpenAI or Anthropic
    if not user.openai_api_key and not user.anthropic_api_key:
        raise HTTPException(
            status_code=400,
            detail=(
                "No API key configured. "
                "Please add your OpenAI or Anthropic API key in Settings to use the AI assistant."
            ),
        )
    use_anthropic = not user.openai_api_key and bool(user.anthropic_api_key)

    # Build system message with optional store context
    system_content = SYSTEM_PROMPT
    if request.store_id:
        store_context = await _build_store_context(
            request.store_id, user.id, session
        )
        if store_context:
            system_content += "\n\n" + store_context

    # Assemble conversation: system + history + current message
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_content},
    ]

    # Append conversation history (already validated by Pydantic)
    for msg in request.messages:
        if msg.role in ("user", "assistant", "system"):
            messages.append({"role": msg.role, "content": msg.content})

    # Append the current user message
    messages.append({"role": "user", "content": request.message})

    if use_anthropic:
        streamer = _stream_anthropic(user.anthropic_api_key, messages)
    else:
        streamer = _stream_openai(user.openai_api_key, messages)

    return StreamingResponse(
        streamer,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
