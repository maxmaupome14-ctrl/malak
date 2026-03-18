"""
Review management system — pull, analyze, and respond to product reviews.

Pulls reviews from Shopify metafields or accepts manual imports,
runs AI sentiment analysis, and generates response drafts using
the user's own API key (BYOK).
"""

import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


# ── System prompts ──────────────────────────────────


REVIEW_ANALYSIS_PROMPT = (
    "You are a customer service expert for ecommerce brands. "
    "Analyze reviews and generate professional, empathetic responses. "
    "For negative reviews, acknowledge the issue, offer a solution, and maintain brand reputation. "
    "Always return valid JSON matching the requested schema exactly."
)

RESPONSE_GENERATION_PROMPT = (
    "You are a customer service expert for ecommerce brands. "
    "Generate a response to the following customer review. "
    "Be empathetic, professional, and helpful. "
    "For negative reviews, acknowledge the issue, apologize sincerely, and offer a concrete solution. "
    "For positive reviews, express genuine gratitude and reinforce the positive experience. "
    "Return ONLY valid JSON with key: response"
)


# ── Schemas ─────────────────────────────────────────


class ReviewItem(BaseModel):
    """A single review entry."""
    rating: int = Field(..., ge=1, le=5)
    text: str
    author: str = "Anonymous"
    date: str | None = None  # ISO date string


class ReviewSummaryResponse(BaseModel):
    """Aggregated review summary for a store."""
    store_id: str
    total_reviews: int
    average_rating: float
    sentiment: dict  # {"positive": 70, "neutral": 20, "negative": 10}
    common_complaints: list[str]
    common_praises: list[str]
    products_needing_attention: list[dict]  # products with low ratings


class ReviewAnalyzeRequest(BaseModel):
    """Request body for AI review analysis."""
    product_id: uuid.UUID
    reviews: list[dict] | None = None  # optional: manually provided [{rating, text, author, date}]


class ReviewAnalysis(BaseModel):
    """AI-generated review analysis."""
    sentiment_score: float  # 0-100
    summary: str  # AI-generated summary of what customers say
    top_praises: list[str]
    top_complaints: list[str]
    suggested_improvements: list[str]  # actionable product/listing improvements
    response_drafts: list[dict]  # [{review_text, suggested_response}] for negative reviews


class RespondRequest(BaseModel):
    """Request body for generating a response to a single review."""
    review_text: str
    review_rating: int = Field(..., ge=1, le=5)
    product_title: str
    tone: str = "professional"  # "professional", "friendly", "apologetic"


class RespondResponse(BaseModel):
    """Generated review response."""
    response: str
    tone: str


class ImportReviewsRequest(BaseModel):
    """Request body for importing reviews manually."""
    product_id: uuid.UUID
    reviews: list[dict]  # [{rating: int, text: str, author: str, date: str}]


class ImportReviewsResponse(BaseModel):
    """Result of a review import."""
    ok: bool
    imported_count: int
    message: str


# ── Helpers ─────────────────────────────────────────


async def _get_ai_caller(user: User):
    """Return the appropriate AI caller function and API key based on user config."""
    has_openai = bool(user.openai_api_key)
    has_anthropic = bool(user.anthropic_api_key)

    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    if has_openai:
        return _call_openai, user.openai_api_key, "openai"
    return _call_anthropic, user.anthropic_api_key, "anthropic"


async def _verify_product_ownership(
    product_id: uuid.UUID,
    user: User,
    session: AsyncSession,
) -> Product:
    """Load a product and verify the user owns it."""
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


async def _verify_store_ownership(
    store_id: uuid.UUID,
    user: User,
    session: AsyncSession,
) -> Store:
    """Load a store and verify the user owns it."""
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


def _get_stored_reviews(product: Product) -> list[dict]:
    """Extract reviews stored in a product's metadata."""
    if not product.metadata_:
        return []
    return product.metadata_.get("reviews", [])


async def _try_fetch_shopify_reviews(
    store: Store,
    product: Product,
) -> list[dict]:
    """
    Attempt to fetch reviews from Shopify metafields.

    Shopify doesn't have a built-in reviews API for all stores.
    Many stores use apps like Judge.me, Yotpo, etc. that store
    reviews in product metafields. This tries common patterns.
    """
    access_token = (store.credentials or {}).get("access_token")
    shop_domain = (store.credentials or {}).get("shop_domain") or store.store_url
    if not access_token or not shop_domain:
        return []

    client = ShopifyClient(shop_domain, access_token)

    try:
        shopify_product_id = int(product.platform_id)
        # Try to fetch product metafields that might contain reviews
        metafields = await client.get_product_metafields(shopify_product_id)

        reviews = []
        for mf in metafields:
            ns = mf.get("namespace", "")
            key = mf.get("key", "")

            # Judge.me stores reviews under judgeme namespace
            # Yotpo, Stamped, Loox, etc. have their own patterns
            review_namespaces = [
                "judgeme", "yotpo", "stamped", "loox",
                "reviews", "product_reviews", "spr",
            ]

            if ns in review_namespaces or key in ("reviews", "product_reviews"):
                value = mf.get("value", "")
                try:
                    parsed = json.loads(value) if isinstance(value, str) else value
                    if isinstance(parsed, list):
                        for item in parsed:
                            reviews.append({
                                "rating": item.get("rating", 0),
                                "text": item.get("body", item.get("text", item.get("content", ""))),
                                "author": item.get("author", item.get("reviewer", "Anonymous")),
                                "date": item.get("created_at", item.get("date", "")),
                            })
                except (json.JSONDecodeError, TypeError):
                    continue

        return reviews
    except Exception as exc:
        logger.warning("Could not fetch Shopify reviews for product %s: %s", product.id, exc)
        return []


def _compute_basic_sentiment(reviews: list[dict]) -> dict:
    """Compute basic sentiment breakdown from ratings."""
    if not reviews:
        return {"positive": 0, "neutral": 0, "negative": 0}

    positive = sum(1 for r in reviews if r.get("rating", 0) >= 4)
    neutral = sum(1 for r in reviews if r.get("rating", 0) == 3)
    negative = sum(1 for r in reviews if r.get("rating", 0) <= 2)
    total = len(reviews)

    return {
        "positive": round(positive / total * 100) if total else 0,
        "neutral": round(neutral / total * 100) if total else 0,
        "negative": round(negative / total * 100) if total else 0,
    }


def _compute_average_rating(reviews: list[dict]) -> float:
    """Compute the average rating from a list of reviews."""
    if not reviews:
        return 0.0
    ratings = [r.get("rating", 0) for r in reviews if r.get("rating")]
    return round(sum(ratings) / len(ratings), 2) if ratings else 0.0


# ── Endpoints ───────────────────────────────────────


@router.get("/store/{store_id}", response_model=ReviewSummaryResponse)
async def get_store_reviews(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewSummaryResponse:
    """
    Pull and analyze reviews for all products in a store.

    Aggregates reviews from product metadata (imported or fetched
    from Shopify metafields) and returns a summary with sentiment
    breakdown and products needing attention.
    """
    store = await _verify_store_ownership(store_id, user, session)

    # Load all products for this store
    result = await session.execute(
        select(Product).where(
            Product.store_id == store.id,
            Product.user_id == user.id,
        )
    )
    products = result.scalars().all()

    all_reviews: list[dict] = []
    products_needing_attention: list[dict] = []

    for product in products:
        product_reviews = _get_stored_reviews(product)

        # If no stored reviews, try fetching from Shopify
        if not product_reviews and store.platform == "shopify" and store.is_connected:
            product_reviews = await _try_fetch_shopify_reviews(store, product)
            # Cache fetched reviews in product metadata
            if product_reviews:
                if product.metadata_ is None:
                    product.metadata_ = {}
                product.metadata_ = {**product.metadata_, "reviews": product_reviews}

        if not product_reviews:
            continue

        all_reviews.extend(product_reviews)

        # Flag products with average rating below 3.5
        avg = _compute_average_rating(product_reviews)
        if avg > 0 and avg < 3.5:
            products_needing_attention.append({
                "product_id": str(product.id),
                "title": product.title,
                "average_rating": avg,
                "review_count": len(product_reviews),
                "lowest_reviews": sorted(
                    product_reviews, key=lambda r: r.get("rating", 5)
                )[:3],
            })

    # Commit any cached reviews
    await session.commit()

    # Compute basic aggregate metrics
    sentiment = _compute_basic_sentiment(all_reviews)
    average_rating = _compute_average_rating(all_reviews)

    # Extract common themes from review text (simple keyword frequency)
    complaints: list[str] = []
    praises: list[str] = []
    for r in all_reviews:
        text = (r.get("text") or "").lower()
        rating = r.get("rating", 3)
        if rating <= 2 and text:
            complaints.append(text[:200])
        elif rating >= 4 and text:
            praises.append(text[:200])

    # Trim to top 10 most common themes (full AI analysis is in /analyze)
    return ReviewSummaryResponse(
        store_id=str(store_id),
        total_reviews=len(all_reviews),
        average_rating=average_rating,
        sentiment=sentiment,
        common_complaints=complaints[:10],
        common_praises=praises[:10],
        products_needing_attention=products_needing_attention,
    )


@router.post("/analyze", response_model=ReviewAnalysis)
async def analyze_reviews(
    body: ReviewAnalyzeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewAnalysis:
    """
    AI-powered analysis of reviews for a specific product.

    If reviews are provided in the request body, uses those.
    Otherwise, pulls from product metadata (previously imported
    or fetched from Shopify).

    Returns sentiment analysis, top praises/complaints,
    suggested improvements, and draft responses for negative reviews.
    """
    product = await _verify_product_ownership(body.product_id, user, session)
    ai_caller, api_key, provider = await _get_ai_caller(user)

    # Determine which reviews to analyze
    reviews = body.reviews
    if not reviews:
        reviews = _get_stored_reviews(product)

    if not reviews:
        # Try Shopify as last resort
        if product.store_id:
            store = await _verify_store_ownership(product.store_id, user, session)
            if store.platform == "shopify" and store.is_connected:
                reviews = await _try_fetch_shopify_reviews(store, product)

    if not reviews:
        raise HTTPException(
            status_code=404,
            detail="No reviews found. Import reviews first using POST /reviews/import "
                   "or provide them in the request body.",
        )

    # Build the AI prompt
    reviews_text = "\n".join(
        f"- Rating: {r.get('rating', 'N/A')}/5 | Author: {r.get('author', 'Anonymous')} | "
        f"Date: {r.get('date', 'N/A')}\n  \"{r.get('text', '')}\""
        for r in reviews
    )

    user_prompt = (
        f"Analyze the following {len(reviews)} customer reviews for the product "
        f"\"{product.title}\".\n\n"
        f"Reviews:\n{reviews_text}\n\n"
        "Return ONLY valid JSON with these exact keys:\n"
        "- sentiment_score: float 0-100 (100 = all positive)\n"
        "- summary: string, 2-3 sentence overview of customer sentiment\n"
        "- top_praises: list of strings, top 5 things customers love\n"
        "- top_complaints: list of strings, top 5 issues customers mention\n"
        "- suggested_improvements: list of strings, 3-5 actionable improvements for the product or listing\n"
        "- response_drafts: list of objects [{\"review_text\": \"...\", \"suggested_response\": \"...\"}] "
        "for the most critical negative reviews (up to 5). Each response should be empathetic, "
        "acknowledge the issue, and offer a solution."
    )

    try:
        logger.info("Calling %s for review analysis of product %s", provider, product.id)
        ai_result = await ai_caller(api_key, REVIEW_ANALYSIS_PROMPT, user_prompt)
    except ValueError as exc:
        logger.error("Failed to parse AI response for review analysis: %s", exc)
        raise HTTPException(
            status_code=502, detail="AI returned an unparseable response"
        )
    except Exception as exc:
        logger.error("AI call failed for review analysis: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"AI service error: {exc}"
        )

    # Validate and fill defaults for any missing fields
    return ReviewAnalysis(
        sentiment_score=float(ai_result.get("sentiment_score", 50.0)),
        summary=ai_result.get("summary", "Analysis could not be completed."),
        top_praises=ai_result.get("top_praises", []),
        top_complaints=ai_result.get("top_complaints", []),
        suggested_improvements=ai_result.get("suggested_improvements", []),
        response_drafts=ai_result.get("response_drafts", []),
    )


@router.post("/respond", response_model=RespondResponse)
async def respond_to_review(
    body: RespondRequest,
    user: User = Depends(current_active_user),
) -> RespondResponse:
    """
    Generate an AI-crafted response to a specific customer review.

    Supports different tones: professional, friendly, or apologetic.
    The response is context-aware, referencing the product and
    addressing specific points raised in the review.
    """
    ai_caller, api_key, provider = await _get_ai_caller(user)

    valid_tones = ("professional", "friendly", "apologetic")
    tone = body.tone if body.tone in valid_tones else "professional"

    tone_instructions = {
        "professional": "Use a polished, business-appropriate tone. Be courteous but concise.",
        "friendly": "Use a warm, conversational tone. Be personable and enthusiastic.",
        "apologetic": "Lead with a sincere apology. Show deep empathy and urgency to resolve the issue.",
    }

    user_prompt = (
        f"Generate a response to this customer review for the product \"{body.product_title}\".\n\n"
        f"Review rating: {body.review_rating}/5\n"
        f"Review text: \"{body.review_text}\"\n\n"
        f"Tone: {tone} — {tone_instructions[tone]}\n\n"
        "Return ONLY valid JSON with key: response\n"
        "The response should be 2-4 sentences, directly address the reviewer's points, "
        "and maintain the brand's reputation."
    )

    try:
        logger.info("Calling %s for review response generation", provider)
        ai_result = await ai_caller(api_key, RESPONSE_GENERATION_PROMPT, user_prompt)
    except ValueError as exc:
        logger.error("Failed to parse AI response for review response: %s", exc)
        raise HTTPException(
            status_code=502, detail="AI returned an unparseable response"
        )
    except Exception as exc:
        logger.error("AI call failed for review response: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"AI service error: {exc}"
        )

    response_text = ai_result.get("response", "")
    if not response_text:
        raise HTTPException(
            status_code=502, detail="AI did not return a response"
        )

    return RespondResponse(response=response_text, tone=tone)


@router.post("/import", response_model=ImportReviewsResponse)
async def import_reviews(
    body: ImportReviewsRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportReviewsResponse:
    """
    Import reviews manually for a product.

    Accepts a list of review objects and stores them in the
    product's metadata under the "reviews" key. New reviews
    are appended to any existing reviews.
    """
    product = await _verify_product_ownership(body.product_id, user, session)

    if not body.reviews:
        raise HTTPException(status_code=400, detail="reviews list must not be empty")

    # Validate and normalize each review
    validated_reviews: list[dict] = []
    for i, review in enumerate(body.reviews):
        rating = review.get("rating")
        if rating is None or not isinstance(rating, int) or rating < 1 or rating > 5:
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {i}: rating must be an integer between 1 and 5",
            )

        text = review.get("text", "")
        if not text or not isinstance(text, str):
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {i}: text is required and must be a non-empty string",
            )

        validated_reviews.append({
            "rating": rating,
            "text": text.strip(),
            "author": str(review.get("author", "Anonymous")).strip(),
            "date": str(review.get("date", datetime.utcnow().isoformat())).strip(),
            "imported_at": datetime.utcnow().isoformat(),
        })

    # Merge with existing reviews
    if product.metadata_ is None:
        product.metadata_ = {}

    existing_reviews = product.metadata_.get("reviews", [])
    merged_reviews = existing_reviews + validated_reviews

    product.metadata_ = {**product.metadata_, "reviews": merged_reviews}

    # Update review_count and rating on the product model
    product.review_count = len(merged_reviews)
    product.rating = _compute_average_rating(merged_reviews)

    await session.commit()

    logger.info(
        "Imported %d reviews for product %s (total: %d)",
        len(validated_reviews),
        product.id,
        len(merged_reviews),
    )

    return ImportReviewsResponse(
        ok=True,
        imported_count=len(validated_reviews),
        message=f"Successfully imported {len(validated_reviews)} reviews. "
                f"Total reviews for this product: {len(merged_reviews)}.",
    )
