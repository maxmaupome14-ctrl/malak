"""
Marketing content generator — emails, social posts, and ad copy.

Uses the merchant's product data + BYOK AI key to generate
platform-specific marketing content optimized for conversions.
"""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.product import Product
from src.models.store import Store
from src.routes.optimize import _call_openai, _call_anthropic, _parse_json_from_text

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Constants ────────────────────────────────────────────

VALID_EMAIL_TYPES = {"welcome", "abandoned_cart", "new_product", "sale", "newsletter", "win_back"}
VALID_TONES = {"professional", "casual", "luxury", "playful", "engaging"}
VALID_SOCIAL_PLATFORMS = {"instagram", "tiktok", "facebook", "twitter", "pinterest"}
VALID_SOCIAL_POST_TYPES = {"product_showcase", "behind_scenes", "testimonial", "sale", "educational"}
VALID_AD_PLATFORMS = {"google", "facebook", "tiktok", "instagram"}
VALID_AD_TYPES = {"product", "brand", "retargeting", "lookalike"}
VALID_BATCH_CONTENT_TYPES = {
    "email", "instagram", "tiktok", "facebook", "twitter", "pinterest",
    "google_ad", "facebook_ad", "tiktok_ad", "instagram_ad",
}

SYSTEM_PROMPT = (
    "You are a world-class ecommerce marketing copywriter. "
    "You create compelling, conversion-optimized content tailored to each "
    "platform's best practices and audience expectations. "
    "Return ONLY valid JSON."
)


# ── Schemas ──────────────────────────────────────────────


class EmailRequest(BaseModel):
    product_ids: list[uuid.UUID]  # products to feature (max 5)
    email_type: str  # "welcome", "abandoned_cart", "new_product", "sale", "newsletter", "win_back"
    tone: str = "professional"  # "professional", "casual", "luxury", "playful"
    store_id: uuid.UUID | None = None  # for store branding context
    custom_instructions: str | None = None

    @field_validator("product_ids")
    @classmethod
    def validate_product_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("product_ids must not be empty")
        if len(v) > 5:
            raise ValueError("Maximum 5 products per email request")
        return v

    @field_validator("email_type")
    @classmethod
    def validate_email_type(cls, v: str) -> str:
        if v not in VALID_EMAIL_TYPES:
            raise ValueError(f"email_type must be one of: {', '.join(sorted(VALID_EMAIL_TYPES))}")
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v: str) -> str:
        if v not in VALID_TONES:
            raise ValueError(f"tone must be one of: {', '.join(sorted(VALID_TONES))}")
        return v


class EmailResponse(BaseModel):
    subject_line: str
    preview_text: str
    body_html: str  # formatted email body
    body_text: str  # plain text version
    cta_text: str  # call to action button text


class SocialRequest(BaseModel):
    product_id: uuid.UUID
    platform: str  # "instagram", "tiktok", "facebook", "twitter", "pinterest"
    post_type: str = "product_showcase"
    tone: str = "engaging"
    custom_instructions: str | None = None

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        if v not in VALID_SOCIAL_PLATFORMS:
            raise ValueError(f"platform must be one of: {', '.join(sorted(VALID_SOCIAL_PLATFORMS))}")
        return v

    @field_validator("post_type")
    @classmethod
    def validate_post_type(cls, v: str) -> str:
        if v not in VALID_SOCIAL_POST_TYPES:
            raise ValueError(f"post_type must be one of: {', '.join(sorted(VALID_SOCIAL_POST_TYPES))}")
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v: str) -> str:
        if v not in VALID_TONES:
            raise ValueError(f"tone must be one of: {', '.join(sorted(VALID_TONES))}")
        return v


class SocialResponse(BaseModel):
    caption: str
    hashtags: list[str]
    suggested_image_description: str  # what kind of image to pair with
    best_posting_time: str  # general suggestion based on platform
    character_count: int


class AdRequest(BaseModel):
    product_id: uuid.UUID
    platform: str  # "google", "facebook", "tiktok", "instagram"
    ad_type: str = "product"  # "product", "brand", "retargeting", "lookalike"
    custom_instructions: str | None = None

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        if v not in VALID_AD_PLATFORMS:
            raise ValueError(f"platform must be one of: {', '.join(sorted(VALID_AD_PLATFORMS))}")
        return v

    @field_validator("ad_type")
    @classmethod
    def validate_ad_type(cls, v: str) -> str:
        if v not in VALID_AD_TYPES:
            raise ValueError(f"ad_type must be one of: {', '.join(sorted(VALID_AD_TYPES))}")
        return v


class AdResponse(BaseModel):
    headlines: list[str]  # multiple options
    descriptions: list[str]  # multiple options
    cta: str
    target_audience_suggestion: str
    keywords: list[str]  # for Google Ads


class BatchContentRequest(BaseModel):
    product_id: uuid.UUID
    content_types: list[str]  # ["email", "instagram", "facebook_ad"]
    tone: str = "professional"
    custom_instructions: str | None = None

    @field_validator("content_types")
    @classmethod
    def validate_content_types(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("content_types must not be empty")
        invalid = set(v) - VALID_BATCH_CONTENT_TYPES
        if invalid:
            raise ValueError(
                f"Invalid content types: {', '.join(sorted(invalid))}. "
                f"Valid types: {', '.join(sorted(VALID_BATCH_CONTENT_TYPES))}"
            )
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v: str) -> str:
        if v not in VALID_TONES:
            raise ValueError(f"tone must be one of: {', '.join(sorted(VALID_TONES))}")
        return v


# ── Helpers ──────────────────────────────────────────────


def _product_context(product: Product) -> str:
    """Build a text block summarizing product data for the AI prompt."""
    parts = [
        f"Product: {product.title or '(untitled)'}",
        f"Brand: {product.brand or '(none)'}",
        f"Description: {product.description or '(none)'}",
        f"Category: {product.category or '(none)'}",
        f"Price: {product.price or '(not set)'} {product.currency or 'USD'}",
    ]
    if product.original_price and product.price and product.original_price > product.price:
        discount_pct = round((1 - product.price / product.original_price) * 100)
        parts.append(f"Original price: {product.original_price} ({discount_pct}% off)")
    if product.bullet_points:
        parts.append(f"Key features: {', '.join(product.bullet_points)}")
    if product.rating:
        parts.append(f"Rating: {product.rating}/5 ({product.review_count} reviews)")
    if product.images:
        parts.append(f"Images available: {len(product.images)}")
    existing_tags = product.metadata_.get("tags", "") if product.metadata_ else ""
    if existing_tags:
        parts.append(f"Tags: {existing_tags}")
    return "\n".join(parts)


def _store_context(store: Store) -> str:
    """Build a text block summarizing store branding for the AI prompt."""
    parts = [
        f"Store name: {store.name}",
        f"Platform: {store.platform}",
    ]
    if store.store_url:
        parts.append(f"URL: {store.store_url}")
    if store.marketplace:
        parts.append(f"Marketplace: {store.marketplace}")
    return "\n".join(parts)


PLATFORM_GUIDELINES = {
    "instagram": (
        "Instagram best practices:\n"
        "- Caption limit: 2200 characters\n"
        "- Max 30 hashtags (use 15-25 for best reach)\n"
        "- Use engaging, visual language that complements images\n"
        "- First line is most important (preview cutoff)\n"
        "- Include a clear CTA\n"
        "- Best posting times: Tue-Fri, 10am-3pm"
    ),
    "tiktok": (
        "TikTok best practices:\n"
        "- Keep copy casual and trend-aware\n"
        "- Short, punchy captions (150 chars ideal)\n"
        "- Use trending hashtags sparingly (3-5)\n"
        "- Speak directly to the viewer\n"
        "- Hook in the first 2 seconds\n"
        "- Best posting times: Tue-Thu, 7pm-9pm"
    ),
    "facebook": (
        "Facebook best practices:\n"
        "- Optimal post length: 40-80 characters for engagement\n"
        "- Emotional, story-driven content performs best\n"
        "- Questions and polls drive engagement\n"
        "- Use 1-3 hashtags max\n"
        "- Best posting times: Wed-Fri, 1pm-4pm"
    ),
    "twitter": (
        "Twitter/X best practices:\n"
        "- 280 character limit\n"
        "- Concise, punchy copy\n"
        "- 1-2 hashtags max\n"
        "- Thread format for longer content\n"
        "- Best posting times: Mon-Fri, 8am-10am"
    ),
    "pinterest": (
        "Pinterest best practices:\n"
        "- Description up to 500 characters\n"
        "- Use keywords naturally (Pinterest is a search engine)\n"
        "- Include price and availability info\n"
        "- Aspirational, lifestyle-focused language\n"
        "- Best posting times: Sat-Sun, 8pm-11pm"
    ),
    "google": (
        "Google Ads best practices:\n"
        "- Headlines: max 30 characters each\n"
        "- Descriptions: max 90 characters each\n"
        "- Include keywords in headlines\n"
        "- Strong CTA in description\n"
        "- Provide 10-15 relevant keywords"
    ),
}


async def _get_user_keys(user: User) -> tuple[bool, bool]:
    """Return (has_openai, has_anthropic) flags."""
    return bool(user.openai_api_key), bool(user.anthropic_api_key)


async def _call_ai(user: User, system: str, user_msg: str) -> dict:
    """Call the user's configured AI provider and return parsed JSON."""
    has_openai, has_anthropic = await _get_user_keys(user)

    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    try:
        if has_openai:
            return await _call_openai(user.openai_api_key, system, user_msg)
        else:
            return await _call_anthropic(user.anthropic_api_key, system, user_msg)
    except ValueError as exc:
        logger.error("Failed to parse AI response: %s", exc)
        raise HTTPException(status_code=502, detail="AI returned an unparseable response")
    except Exception as exc:
        logger.error("AI call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


async def _load_product(
    session: AsyncSession, product_id: uuid.UUID, user: User
) -> Product:
    """Load a product and verify ownership."""
    result = await session.execute(
        select(Product).where(
            Product.id == product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


async def _load_store(
    session: AsyncSession, store_id: uuid.UUID, user: User
) -> Store:
    """Load a store and verify ownership."""
    result = await session.execute(
        select(Store).where(
            Store.id == store_id,
            Store.user_id == user.id,
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


# ── Email prompt builder ─────────────────────────────────


def _build_email_prompt(
    products: list[Product],
    email_type: str,
    tone: str,
    store: Store | None,
    custom_instructions: str | None,
) -> str:
    """Build the user prompt for email generation."""
    parts = [
        f"Generate a {email_type.replace('_', ' ')} marketing email in a {tone} tone.\n",
    ]

    if store:
        parts.append("Store branding context:")
        parts.append(_store_context(store))
        parts.append("")

    parts.append(f"Featured products ({len(products)}):")
    for i, product in enumerate(products, 1):
        parts.append(f"\n--- Product {i} ---")
        parts.append(_product_context(product))

    parts.append("\nEmail type guidelines:")
    email_guidelines = {
        "welcome": "Welcome email for new subscribers. Introduce the brand, highlight best sellers, offer a first-purchase incentive.",
        "abandoned_cart": "Remind the customer about items left in their cart. Create urgency, address common objections, offer help.",
        "new_product": "Announce a new product launch. Build excitement, highlight unique features, create FOMO.",
        "sale": "Promote a sale or discount. Emphasize savings, create urgency with deadlines, clear CTA to shop.",
        "newsletter": "Regular newsletter content. Mix product highlights with valuable content, maintain brand voice.",
        "win_back": "Re-engage inactive customers. Acknowledge absence, offer incentive to return, highlight what's new.",
    }
    parts.append(email_guidelines.get(email_type, "General marketing email."))

    parts.append("\nConstraints:")
    parts.append("- Subject line: under 50 characters")
    parts.append("- Preview text: under 100 characters")
    parts.append("- Body should be scannable with clear sections")
    parts.append("- Include a compelling call-to-action")

    if custom_instructions:
        parts.append(f"\nAdditional instructions: {custom_instructions}")

    parts.append(
        "\nReturn ONLY valid JSON with keys: "
        "subject_line, preview_text, body_html, body_text, cta_text"
    )
    return "\n".join(parts)


# ── Social prompt builder ────────────────────────────────


def _build_social_prompt(
    product: Product,
    platform: str,
    post_type: str,
    tone: str,
    custom_instructions: str | None,
) -> str:
    """Build the user prompt for social media post generation."""
    parts = [
        f"Generate a {post_type.replace('_', ' ')} social media post for {platform} "
        f"in a {tone} tone.\n",
        "Product details:",
        _product_context(product),
        "",
        PLATFORM_GUIDELINES.get(platform, ""),
    ]

    post_type_guidelines = {
        "product_showcase": "Highlight the product's best features and benefits. Make it visually compelling.",
        "behind_scenes": "Show the making, sourcing, or story behind the product. Humanize the brand.",
        "testimonial": "Frame as a customer success story or review highlight. Build social proof.",
        "sale": "Promote a discount or limited-time offer. Create urgency and excitement.",
        "educational": "Teach something valuable related to the product. Position the brand as an expert.",
    }
    parts.append(f"\nPost type guidance: {post_type_guidelines.get(post_type, '')}")

    if custom_instructions:
        parts.append(f"\nAdditional instructions: {custom_instructions}")

    parts.append(
        "\nReturn ONLY valid JSON with keys: "
        "caption, hashtags (array of strings without #), "
        "suggested_image_description, best_posting_time, character_count"
    )
    return "\n".join(parts)


# ── Ad prompt builder ────────────────────────────────────


def _build_ad_prompt(
    product: Product,
    platform: str,
    ad_type: str,
    custom_instructions: str | None,
) -> str:
    """Build the user prompt for ad copy generation."""
    parts = [
        f"Generate {ad_type} ad copy for {platform} ads.\n",
        "Product details:",
        _product_context(product),
        "",
        PLATFORM_GUIDELINES.get(platform, ""),
    ]

    ad_type_guidelines = {
        "product": "Direct product promotion. Focus on features, benefits, and value proposition.",
        "brand": "Brand awareness ad. Focus on brand story, values, and lifestyle appeal.",
        "retargeting": "Ad for people who already visited the product page. Remind, reassure, create urgency.",
        "lookalike": "Ad targeting similar audiences. Broad appeal, focus on problem-solving and aspirational messaging.",
    }
    parts.append(f"\nAd type guidance: {ad_type_guidelines.get(ad_type, '')}")

    platform_ad_specifics = {
        "google": (
            "\nGoogle Ads specifics:"
            "\n- Provide 5 headline options (max 30 chars each)"
            "\n- Provide 3 description options (max 90 chars each)"
            "\n- Provide 10-15 relevant keywords for targeting"
        ),
        "facebook": (
            "\nFacebook Ads specifics:"
            "\n- Provide 3 headline options (max 40 chars each)"
            "\n- Provide 3 primary text options (emotional, story-driven)"
            "\n- Focus on emotional triggers and social proof"
        ),
        "tiktok": (
            "\nTikTok Ads specifics:"
            "\n- Provide 3 headline options (short, catchy)"
            "\n- Provide 3 description options (casual, trend-aware)"
            "\n- Focus on authenticity and entertainment value"
        ),
        "instagram": (
            "\nInstagram Ads specifics:"
            "\n- Provide 3 headline options (visual, aspirational)"
            "\n- Provide 3 description options (lifestyle-focused)"
            "\n- Focus on visual storytelling and lifestyle appeal"
        ),
    }
    parts.append(platform_ad_specifics.get(platform, ""))

    if custom_instructions:
        parts.append(f"\nAdditional instructions: {custom_instructions}")

    parts.append(
        "\nReturn ONLY valid JSON with keys: "
        "headlines (array of strings), descriptions (array of strings), "
        "cta, target_audience_suggestion, keywords (array of strings)"
    )
    return "\n".join(parts)


# ── Endpoints ────────────────────────────────────────────


@router.post("/email", response_model=EmailResponse)
async def generate_email(
    body: EmailRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EmailResponse:
    """
    Generate email marketing content featuring the specified products.

    Uses the user's BYOK key (OpenAI or Anthropic) to generate
    platform-optimized email copy with subject line, body, and CTA.
    """
    # Load all products and verify ownership
    products: list[Product] = []
    for pid in body.product_ids:
        products.append(await _load_product(session, pid, user))

    # Optionally load store for branding context
    store: Store | None = None
    if body.store_id:
        store = await _load_store(session, body.store_id, user)

    # Build prompt and call AI
    user_prompt = _build_email_prompt(
        products, body.email_type, body.tone, store, body.custom_instructions
    )
    logger.info(
        "Generating %s email for %d products (user %s)",
        body.email_type, len(products), user.id,
    )
    ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)

    # Validate required keys
    required = {"subject_line", "preview_text", "body_html", "body_text", "cta_text"}
    missing = required - set(ai_result.keys())
    if missing:
        raise HTTPException(
            status_code=502,
            detail=f"AI response missing required fields: {', '.join(sorted(missing))}",
        )

    return EmailResponse(
        subject_line=ai_result["subject_line"],
        preview_text=ai_result["preview_text"],
        body_html=ai_result["body_html"],
        body_text=ai_result["body_text"],
        cta_text=ai_result["cta_text"],
    )


@router.post("/social", response_model=SocialResponse)
async def generate_social_post(
    body: SocialRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SocialResponse:
    """
    Generate a social media post for the specified platform.

    Returns platform-optimized caption, hashtags, image suggestions,
    and best posting time recommendations.
    """
    product = await _load_product(session, body.product_id, user)

    user_prompt = _build_social_prompt(
        product, body.platform, body.post_type, body.tone, body.custom_instructions
    )
    logger.info(
        "Generating %s %s post for product %s (user %s)",
        body.platform, body.post_type, product.id, user.id,
    )
    ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)

    # Validate required keys
    required = {"caption", "hashtags", "suggested_image_description", "best_posting_time"}
    missing = required - set(ai_result.keys())
    if missing:
        raise HTTPException(
            status_code=502,
            detail=f"AI response missing required fields: {', '.join(sorted(missing))}",
        )

    caption = ai_result["caption"]
    # Compute character count if AI didn't provide it
    character_count = ai_result.get("character_count")
    if not isinstance(character_count, int):
        character_count = len(caption)

    return SocialResponse(
        caption=caption,
        hashtags=ai_result["hashtags"],
        suggested_image_description=ai_result["suggested_image_description"],
        best_posting_time=ai_result["best_posting_time"],
        character_count=character_count,
    )


@router.post("/ad", response_model=AdResponse)
async def generate_ad_copy(
    body: AdRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AdResponse:
    """
    Generate ad copy for the specified platform.

    Returns multiple headline/description options, CTA,
    target audience suggestions, and keywords.
    """
    product = await _load_product(session, body.product_id, user)

    user_prompt = _build_ad_prompt(
        product, body.platform, body.ad_type, body.custom_instructions
    )
    logger.info(
        "Generating %s %s ad for product %s (user %s)",
        body.platform, body.ad_type, product.id, user.id,
    )
    ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)

    # Validate required keys
    required = {"headlines", "descriptions", "cta", "target_audience_suggestion", "keywords"}
    missing = required - set(ai_result.keys())
    if missing:
        raise HTTPException(
            status_code=502,
            detail=f"AI response missing required fields: {', '.join(sorted(missing))}",
        )

    return AdResponse(
        headlines=ai_result["headlines"],
        descriptions=ai_result["descriptions"],
        cta=ai_result["cta"],
        target_audience_suggestion=ai_result["target_audience_suggestion"],
        keywords=ai_result["keywords"],
    )


@router.post("/batch")
async def generate_batch_content(
    body: BatchContentRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Generate multiple types of marketing content for a product at once.

    Accepts a list of content_types and returns a dict keyed by type
    with the respective generated content.
    """
    product = await _load_product(session, body.product_id, user)

    # Verify user has an API key before processing anything
    has_openai, has_anthropic = await _get_user_keys(user)
    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    logger.info(
        "Generating batch content (%s) for product %s (user %s)",
        ", ".join(body.content_types), product.id, user.id,
    )

    results: dict = {}

    for content_type in body.content_types:
        try:
            if content_type == "email":
                # Email with single product
                user_prompt = _build_email_prompt(
                    [product], "new_product", body.tone, None, body.custom_instructions
                )
                ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)
                results[content_type] = EmailResponse(
                    subject_line=ai_result.get("subject_line", ""),
                    preview_text=ai_result.get("preview_text", ""),
                    body_html=ai_result.get("body_html", ""),
                    body_text=ai_result.get("body_text", ""),
                    cta_text=ai_result.get("cta_text", ""),
                ).model_dump()

            elif content_type in VALID_SOCIAL_PLATFORMS:
                # Social media post
                user_prompt = _build_social_prompt(
                    product, content_type, "product_showcase", body.tone, body.custom_instructions
                )
                ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)
                caption = ai_result.get("caption", "")
                char_count = ai_result.get("character_count")
                if not isinstance(char_count, int):
                    char_count = len(caption)
                results[content_type] = SocialResponse(
                    caption=caption,
                    hashtags=ai_result.get("hashtags", []),
                    suggested_image_description=ai_result.get("suggested_image_description", ""),
                    best_posting_time=ai_result.get("best_posting_time", ""),
                    character_count=char_count,
                ).model_dump()

            elif content_type.endswith("_ad"):
                # Ad copy — extract platform from content_type (e.g. "facebook_ad" -> "facebook")
                ad_platform = content_type.removesuffix("_ad")
                user_prompt = _build_ad_prompt(
                    product, ad_platform, "product", body.custom_instructions
                )
                ai_result = await _call_ai(user, SYSTEM_PROMPT, user_prompt)
                results[content_type] = AdResponse(
                    headlines=ai_result.get("headlines", []),
                    descriptions=ai_result.get("descriptions", []),
                    cta=ai_result.get("cta", ""),
                    target_audience_suggestion=ai_result.get("target_audience_suggestion", ""),
                    keywords=ai_result.get("keywords", []),
                ).model_dump()

            else:
                results[content_type] = {"error": f"Unknown content type: {content_type}"}

        except HTTPException as exc:
            results[content_type] = {"error": exc.detail}
        except Exception as exc:
            logger.error("Batch generation failed for %s: %s", content_type, exc)
            results[content_type] = {"error": str(exc)}

    return results
