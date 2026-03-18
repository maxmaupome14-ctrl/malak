"""
Product optimization endpoint — lightweight, direct AI optimization.

Unlike the full optimizations pipeline (auditor + copywriter agents),
this gives the user a single-shot optimize→preview→push flow using
their own API key (BYOK).
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.product import Product
from src.models.store import Store

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class OptimizeRequest(BaseModel):
    """Request body for the /generate endpoint."""

    product_id: uuid.UUID
    instructions: str | None = None  # custom user instructions for the AI


class OptimizeResponse(BaseModel):
    """Side-by-side original vs optimized product data."""

    original: dict  # {title, description, tags}
    optimized: dict  # {title, description, tags}
    reasoning: str


class PushRequest(BaseModel):
    """Push optimized fields to the live store."""

    product_id: uuid.UUID
    title: str
    description: str
    tags: str


class PushResponse(BaseModel):
    ok: bool
    message: str


class BulkOptimizeRequest(BaseModel):
    product_ids: list[uuid.UUID]
    instructions: str | None = None


class BulkPushItem(BaseModel):
    product_id: uuid.UUID
    title: str
    description: str
    tags: str


class BulkPushRequest(BaseModel):
    items: list[BulkPushItem]


# ── System prompt ────────────────────────────────────

SYSTEM_PROMPT = (
    "You are Kansa, an AI ecommerce optimization expert. "
    "Analyze the product and generate an optimized version with better SEO, "
    "clearer descriptions, and more compelling copy.\n\n"
    "IMPORTANT: The 'description' field must be RICH HTML suitable for Shopify's body_html. "
    "Use proper formatting: <h3> for section headers, <ul><li> for bullet points, "
    "<p> for paragraphs, <strong> for emphasis. Structure the description with sections like "
    "Key Benefits, Product Details, Specifications, etc. Make it visually appealing and scannable — "
    "NOT a wall of plain text.\n\n"
    "Return ONLY valid JSON with keys: title, description, tags, reasoning. "
    "The tags value must be a comma-separated string. "
    "The reasoning value should explain why these changes help."
)


# ── Helpers ──────────────────────────────────────────


def _build_user_prompt(product: Product, instructions: str | None) -> str:
    """Build the user-facing prompt with product data."""
    parts = [
        "Optimize the following product listing for ecommerce SEO:\n",
        f"Title: {product.title or '(empty)'}",
        f"Description: {product.description or '(empty)'}",
        f"Brand: {product.brand or '(none)'}",
        f"Category: {product.category or '(none)'}",
        f"Price: {product.price or '(not set)'}",
        f"Bullet points: {', '.join(product.bullet_points) if product.bullet_points else '(none)'}",
        f"Images count: {len(product.images) if product.images else 0}",
    ]

    # Pull existing tags from metadata if available
    existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
    if existing_tags:
        parts.append(f"Current tags: {existing_tags}")

    if instructions:
        parts.append(f"\nAdditional instructions from the user: {instructions}")

    parts.append(
        "\nReturn ONLY valid JSON with keys: title, description, tags, reasoning."
    )
    return "\n".join(parts)


def _parse_json_from_text(text: str) -> dict:
    """Extract JSON from a response that might contain markdown fences or preamble."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try stripping markdown code fences
    stripped = text.strip()
    if stripped.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_newline = stripped.index("\n")
        stripped = stripped[first_newline + 1 :]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        try:
            return json.loads(stripped.strip())
        except json.JSONDecodeError:
            pass

    # Last resort: find first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not parse JSON from AI response")


async def _call_openai(api_key: str, system: str, user_msg: str) -> dict:
    """Call OpenAI GPT-4o and return parsed JSON."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.7,
    )
    raw = response.choices[0].message.content or "{}"
    return _parse_json_from_text(raw)


async def _call_anthropic(api_key: str, system: str, user_msg: str) -> dict:
    """Call Anthropic Claude and return parsed JSON."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=system,
        messages=[
            {"role": "user", "content": user_msg},
        ],
        temperature=0.7,
    )
    # Anthropic returns a list of content blocks
    raw = ""
    for block in response.content:
        if block.type == "text":
            raw += block.text
    return _parse_json_from_text(raw)


# ── Endpoints ────────────────────────────────────────


@router.post("/generate", response_model=OptimizeResponse)
async def generate_optimization(
    body: OptimizeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> OptimizeResponse:
    """
    Generate an AI-optimized version of a product listing.

    Uses the user's own API key (OpenAI preferred, Anthropic fallback).
    Returns original and optimized versions side-by-side for review.
    """
    # Load product and verify ownership
    result = await session.execute(
        select(Product).where(
            Product.id == body.product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.store_id:
        raise HTTPException(
            status_code=400, detail="Product must be linked to a store"
        )

    # Load store to verify it exists and is connected
    result = await session.execute(
        select(Store).where(
            Store.id == product.store_id,
            Store.user_id == user.id,
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Check user has an API key
    has_openai = bool(user.openai_api_key)
    has_anthropic = bool(user.anthropic_api_key)

    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    # Build the prompt
    user_prompt = _build_user_prompt(product, body.instructions)

    # Call AI (prefer OpenAI if both keys exist)
    try:
        if has_openai:
            logger.info("Calling OpenAI for product %s", product.id)
            ai_result = await _call_openai(
                user.openai_api_key, SYSTEM_PROMPT, user_prompt
            )
        else:
            logger.info("Calling Anthropic for product %s", product.id)
            ai_result = await _call_anthropic(
                user.anthropic_api_key, SYSTEM_PROMPT, user_prompt
            )
    except ValueError as exc:
        logger.error("Failed to parse AI response for product %s: %s", product.id, exc)
        raise HTTPException(
            status_code=502, detail="AI returned an unparseable response"
        )
    except Exception as exc:
        logger.error("AI call failed for product %s: %s", product.id, exc)
        raise HTTPException(
            status_code=502, detail=f"AI service error: {exc}"
        )

    # Validate required keys in the AI response
    for key in ("title", "description", "tags", "reasoning"):
        if key not in ai_result:
            raise HTTPException(
                status_code=502,
                detail=f"AI response missing required field: {key}",
            )

    # Build original snapshot
    existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
    original = {
        "title": product.title or "",
        "description": product.description or "",
        "tags": existing_tags,
    }

    optimized = {
        "title": ai_result["title"],
        "description": ai_result["description"],
        "tags": ai_result["tags"],
    }

    return OptimizeResponse(
        original=original,
        optimized=optimized,
        reasoning=ai_result["reasoning"],
    )


@router.post("/push", response_model=PushResponse)
async def push_optimization(
    body: PushRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> PushResponse:
    """
    Push optimized product data to the live Shopify store.

    Also updates the local product record to stay in sync.
    """
    # Load product and verify ownership
    result = await session.execute(
        select(Product).where(
            Product.id == body.product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.store_id:
        raise HTTPException(
            status_code=400, detail="Product must be linked to a store"
        )

    # Load store for credentials
    result = await session.execute(
        select(Store).where(
            Store.id == product.store_id,
            Store.user_id == user.id,
            Store.is_connected == True,  # noqa: E712
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Connected store not found")

    access_token = (store.credentials or {}).get("access_token")
    shop_domain = (store.credentials or {}).get("shop_domain") or store.store_url
    if not access_token or not shop_domain:
        raise HTTPException(
            status_code=400, detail="Store missing credentials (access_token or shop_domain)"
        )

    # Push to Shopify
    client = ShopifyClient(shop_domain, access_token)
    shopify_product_id = int(product.platform_id)

    try:
        await client.update_product(
            shopify_product_id,
            {
                "title": body.title,
                "body_html": body.description,
                "tags": body.tags,
            },
        )
    except Exception as exc:
        logger.error(
            "Failed to push optimization for product %s: %s", product.id, exc
        )
        return PushResponse(ok=False, message=f"Shopify update failed: {exc}")

    # Update local product record to stay in sync
    product.title = body.title
    product.description = body.description
    # Store tags in metadata
    if product.metadata_ is None:
        product.metadata_ = {}
    product.metadata_ = {**product.metadata_, "tags": body.tags}

    await session.commit()
    logger.info("Pushed optimization for product %s to Shopify", product.id)

    return PushResponse(ok=True, message="Product updated successfully")


@router.post("/bulk-generate")
async def bulk_generate_optimization(
    body: BulkOptimizeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """
    Generate AI-optimized versions for multiple products at once.

    Processes sequentially to avoid rate-limiting the user's API key.
    Maximum 10 products per request.
    """
    if len(body.product_ids) > 10:
        raise HTTPException(
            status_code=400, detail="Maximum 10 products per bulk request"
        )

    if not body.product_ids:
        raise HTTPException(status_code=400, detail="product_ids must not be empty")

    # Verify user has an API key before processing anything
    has_openai = bool(user.openai_api_key)
    has_anthropic = bool(user.anthropic_api_key)
    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    results: list[dict] = []

    for product_id in body.product_ids:
        try:
            # Load product and verify ownership
            result = await session.execute(
                select(Product).where(
                    Product.id == product_id,
                    Product.user_id == user.id,
                )
            )
            product = result.scalar_one_or_none()
            if not product:
                results.append({"product_id": str(product_id), "error": "Product not found"})
                continue

            if not product.store_id:
                results.append({"product_id": str(product_id), "error": "Product must be linked to a store"})
                continue

            # Verify store exists
            store_result = await session.execute(
                select(Store).where(
                    Store.id == product.store_id,
                    Store.user_id == user.id,
                )
            )
            store = store_result.scalar_one_or_none()
            if not store:
                results.append({"product_id": str(product_id), "error": "Store not found"})
                continue

            # Build prompt and call AI
            user_prompt = _build_user_prompt(product, body.instructions)

            if has_openai:
                logger.info("Bulk: calling OpenAI for product %s", product.id)
                ai_result = await _call_openai(
                    user.openai_api_key, SYSTEM_PROMPT, user_prompt
                )
            else:
                logger.info("Bulk: calling Anthropic for product %s", product.id)
                ai_result = await _call_anthropic(
                    user.anthropic_api_key, SYSTEM_PROMPT, user_prompt
                )

            # Validate required keys
            missing = [k for k in ("title", "description", "tags", "reasoning") if k not in ai_result]
            if missing:
                results.append({
                    "product_id": str(product_id),
                    "error": f"AI response missing fields: {', '.join(missing)}",
                })
                continue

            existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
            original = {
                "title": product.title or "",
                "description": product.description or "",
                "tags": existing_tags,
            }
            optimized = {
                "title": ai_result["title"],
                "description": ai_result["description"],
                "tags": ai_result["tags"],
            }

            results.append({
                "product_id": str(product_id),
                "original": original,
                "optimized": optimized,
                "reasoning": ai_result["reasoning"],
            })

        except Exception as exc:
            logger.error("Bulk generate failed for product %s: %s", product_id, exc)
            results.append({"product_id": str(product_id), "error": str(exc)})

    return results


@router.post("/bulk-push")
async def bulk_push_optimization(
    body: BulkPushRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """
    Push optimized product data to Shopify for multiple products at once.

    Also updates local product records. Maximum 10 items per request.
    """
    if len(body.items) > 10:
        raise HTTPException(
            status_code=400, detail="Maximum 10 products per bulk request"
        )

    if not body.items:
        raise HTTPException(status_code=400, detail="items must not be empty")

    results: list[dict] = []

    for item in body.items:
        try:
            # Load product and verify ownership
            result = await session.execute(
                select(Product).where(
                    Product.id == item.product_id,
                    Product.user_id == user.id,
                )
            )
            product = result.scalar_one_or_none()
            if not product:
                results.append({"product_id": str(item.product_id), "ok": False, "error": "Product not found"})
                continue

            if not product.store_id:
                results.append({"product_id": str(item.product_id), "ok": False, "error": "Product must be linked to a store"})
                continue

            # Load store for credentials
            store_result = await session.execute(
                select(Store).where(
                    Store.id == product.store_id,
                    Store.user_id == user.id,
                    Store.is_connected == True,  # noqa: E712
                )
            )
            store = store_result.scalar_one_or_none()
            if not store:
                results.append({"product_id": str(item.product_id), "ok": False, "error": "Connected store not found"})
                continue

            access_token = (store.credentials or {}).get("access_token")
            shop_domain = (store.credentials or {}).get("shop_domain") or store.store_url
            if not access_token or not shop_domain:
                results.append({"product_id": str(item.product_id), "ok": False, "error": "Store missing credentials"})
                continue

            # Push to Shopify
            client = ShopifyClient(shop_domain, access_token)
            shopify_product_id = int(product.platform_id)

            await client.update_product(
                shopify_product_id,
                {
                    "title": item.title,
                    "body_html": item.description,
                    "tags": item.tags,
                },
            )

            # Update local product record
            product.title = item.title
            product.description = item.description
            if product.metadata_ is None:
                product.metadata_ = {}
            product.metadata_ = {**product.metadata_, "tags": item.tags}

            results.append({"product_id": str(item.product_id), "ok": True})

        except Exception as exc:
            logger.error("Bulk push failed for product %s: %s", item.product_id, exc)
            results.append({"product_id": str(item.product_id), "ok": False, "error": str(exc)})

    # Commit all local DB updates in one batch
    await session.commit()

    return results
