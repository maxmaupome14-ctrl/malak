"""
Product translation/localization endpoint — one-click translation of product listings.

Uses the merchant's own API key (BYOK) to translate product titles, descriptions,
and tags into any supported language. Stores translation history in product metadata.
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
from src.routes.optimize import _call_openai, _call_anthropic, _parse_json_from_text

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Supported Languages ─────────────────────────────

SUPPORTED_LANGUAGES = {
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "de": "German",
    "it": "Italian",
    "ja": "Japanese",
    "zh": "Chinese (Simplified)",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "ru": "Russian",
    "tr": "Turkish",
    "pl": "Polish",
}


# ── Schemas ──────────────────────────────────────────


class TranslateRequest(BaseModel):
    """Request body for the /translate endpoint."""

    product_id: uuid.UUID
    target_language: str  # "es", "fr", "pt", "de", "it", "ja", "zh", "ko", etc.
    fields: list[str] = ["title", "description", "tags"]  # which fields to translate


class TranslateResponse(BaseModel):
    """Side-by-side original vs translated product data."""

    original: dict  # {title, description, tags}
    translated: dict  # {title, description, tags}
    language: str  # language code
    language_name: str  # "Spanish", "French", etc.


class TranslatePushRequest(BaseModel):
    """Push translated content to Shopify."""

    product_id: uuid.UUID
    language: str
    title: str
    description: str
    tags: str


class TranslatePushResponse(BaseModel):
    ok: bool
    message: str


class BulkTranslateRequest(BaseModel):
    """Translate multiple products at once."""

    product_ids: list[uuid.UUID]  # max 10
    target_language: str


# ── System Prompt ────────────────────────────────────

TRANSLATE_SYSTEM_PROMPT = (
    "You are a professional ecommerce translator. "
    "Translate product listings accurately while maintaining SEO optimization "
    "and marketing appeal in the target language. "
    "Adapt cultural references and measurements where appropriate. "
    "Return ONLY valid JSON with keys: title, description, tags."
)


# ── Helpers ──────────────────────────────────────────


def _validate_language(language_code: str) -> str:
    """Validate language code and return the language name."""
    if language_code not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: '{language_code}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_LANGUAGES.keys()))}",
        )
    return SUPPORTED_LANGUAGES[language_code]


def _build_translate_prompt(
    product: Product, target_language: str, language_name: str, fields: list[str]
) -> str:
    """Build the user-facing prompt for translation."""
    existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""

    parts = [
        f"Translate the following product listing into {language_name} ({target_language}).\n",
    ]

    if "title" in fields:
        parts.append(f"Title: {product.title or '(empty)'}")
    if "description" in fields:
        parts.append(f"Description: {product.description or '(empty)'}")
    if "tags" in fields:
        parts.append(f"Tags: {existing_tags or '(none)'}")

    # Include brand so the AI knows not to translate it
    if product.brand:
        parts.append(f"\nBrand name (DO NOT translate, keep as-is): {product.brand}")

    parts.append(
        f"\nTranslate to: {language_name}"
        "\nReturn ONLY valid JSON with keys: title, description, tags."
        "\nKeep brand names, model numbers, and technical specifications untranslated."
        "\nThe tags value must be a comma-separated string in the target language."
    )

    return "\n".join(parts)


async def _get_product_and_verify(
    product_id: uuid.UUID, user: User, session: AsyncSession
) -> tuple[Product, Store]:
    """Load a product and its store, verifying ownership."""
    result = await session.execute(
        select(Product).where(
            Product.id == product_id,
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

    result = await session.execute(
        select(Store).where(
            Store.id == product.store_id,
            Store.user_id == user.id,
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    return product, store


def _get_api_key(user: User) -> tuple[str, str]:
    """
    Return (provider, api_key) — prefers OpenAI if both keys exist.
    Raises HTTPException if no key is configured.
    """
    if user.openai_api_key:
        return "openai", user.openai_api_key
    if user.anthropic_api_key:
        return "anthropic", user.anthropic_api_key
    raise HTTPException(
        status_code=400,
        detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
    )


async def _translate_product(
    product: Product,
    target_language: str,
    language_name: str,
    fields: list[str],
    provider: str,
    api_key: str,
) -> dict:
    """Run AI translation for a single product and return the result dict."""
    user_prompt = _build_translate_prompt(product, target_language, language_name, fields)

    try:
        if provider == "openai":
            logger.info("Calling OpenAI for translation of product %s → %s", product.id, target_language)
            ai_result = await _call_openai(api_key, TRANSLATE_SYSTEM_PROMPT, user_prompt)
        else:
            logger.info("Calling Anthropic for translation of product %s → %s", product.id, target_language)
            ai_result = await _call_anthropic(api_key, TRANSLATE_SYSTEM_PROMPT, user_prompt)
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

    # Validate required keys
    for key in ("title", "description", "tags"):
        if key not in ai_result:
            raise HTTPException(
                status_code=502,
                detail=f"AI response missing required field: {key}",
            )

    return ai_result


def _store_translation_in_metadata(
    product: Product, language_code: str, translated: dict, session: AsyncSession
) -> None:
    """Persist the translation result in the product's metadata under 'translations'."""
    if product.metadata_ is None:
        product.metadata_ = {}

    translations = product.metadata_.get("translations", {})
    translations[language_code] = {
        "title": translated.get("title", ""),
        "description": translated.get("description", ""),
        "tags": translated.get("tags", ""),
    }

    # SQLAlchemy needs a new dict reference to detect JSONB mutation
    product.metadata_ = {**product.metadata_, "translations": translations}


# ── Endpoints ────────────────────────────────────────


@router.get("/languages")
async def list_languages() -> dict:
    """List all supported translation languages."""
    return {"languages": SUPPORTED_LANGUAGES}


@router.post("", response_model=TranslateResponse)
async def translate_product(
    body: TranslateRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> TranslateResponse:
    """
    Translate a product listing into a target language.

    Uses the user's own API key (OpenAI preferred, Anthropic fallback).
    Returns original and translated versions side-by-side.
    Stores the translation in the product's metadata for future reference.
    """
    language_name = _validate_language(body.target_language)
    product, _store = await _get_product_and_verify(body.product_id, user, session)
    provider, api_key = _get_api_key(user)

    ai_result = await _translate_product(
        product, body.target_language, language_name, body.fields, provider, api_key
    )

    # Build original snapshot
    existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
    original = {
        "title": product.title or "",
        "description": product.description or "",
        "tags": existing_tags,
    }

    translated = {
        "title": ai_result["title"],
        "description": ai_result["description"],
        "tags": ai_result["tags"],
    }

    # Persist translation in product metadata
    _store_translation_in_metadata(product, body.target_language, translated, session)
    await session.commit()

    return TranslateResponse(
        original=original,
        translated=translated,
        language=body.target_language,
        language_name=language_name,
    )


@router.post("/push", response_model=TranslatePushResponse)
async def push_translation(
    body: TranslatePushRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> TranslatePushResponse:
    """
    Push translated product data to the live Shopify store.

    For MVP, this updates the product's main fields with the translated content
    and stores the translation in the product's metadata.
    The merchant can use this to switch their listing's language.
    """
    language_name = _validate_language(body.language)
    product, store = await _get_product_and_verify(body.product_id, user, session)

    # Verify store is connected and has credentials
    if not store.is_connected:
        raise HTTPException(status_code=400, detail="Store is not connected")

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
            "Failed to push translation for product %s (%s): %s",
            product.id, body.language, exc,
        )
        return TranslatePushResponse(
            ok=False, message=f"Shopify update failed: {exc}"
        )

    # Update local product record
    product.title = body.title
    product.description = body.description
    if product.metadata_ is None:
        product.metadata_ = {}
    product.metadata_ = {**product.metadata_, "tags": body.tags}

    # Also store the pushed translation in metadata
    _store_translation_in_metadata(
        product,
        body.language,
        {"title": body.title, "description": body.description, "tags": body.tags},
        session,
    )

    await session.commit()
    logger.info(
        "Pushed %s translation for product %s to Shopify",
        language_name, product.id,
    )

    return TranslatePushResponse(
        ok=True, message=f"Product updated with {language_name} translation"
    )


@router.post("/bulk-translate")
async def bulk_translate(
    body: BulkTranslateRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """
    Translate multiple products into a target language at once.

    Processes sequentially to avoid rate-limiting the user's API key.
    Maximum 10 products per request.
    """
    if len(body.product_ids) > 10:
        raise HTTPException(
            status_code=400, detail="Maximum 10 products per bulk request"
        )

    if not body.product_ids:
        raise HTTPException(status_code=400, detail="product_ids must not be empty")

    language_name = _validate_language(body.target_language)
    provider, api_key = _get_api_key(user)

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

            # Translate
            fields = ["title", "description", "tags"]
            ai_result = await _translate_product(
                product, body.target_language, language_name, fields, provider, api_key
            )

            existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
            original = {
                "title": product.title or "",
                "description": product.description or "",
                "tags": existing_tags,
            }
            translated = {
                "title": ai_result["title"],
                "description": ai_result["description"],
                "tags": ai_result["tags"],
            }

            # Persist translation
            _store_translation_in_metadata(product, body.target_language, translated, session)

            results.append({
                "product_id": str(product_id),
                "original": original,
                "translated": translated,
                "language": body.target_language,
                "language_name": language_name,
            })

        except HTTPException as exc:
            # Re-raised from _translate_product for AI errors
            results.append({"product_id": str(product_id), "error": exc.detail})
        except Exception as exc:
            logger.error("Bulk translate failed for product %s: %s", product_id, exc)
            results.append({"product_id": str(product_id), "error": str(exc)})

    # Commit all metadata updates in one batch
    await session.commit()

    return results
