"""
Competitor Analysis — scrape competitor product pages and compare them
against the merchant's own products using AI.

Endpoints:
    POST /analyze          Scrape a competitor URL and run AI comparison.
    POST /track            Save a competitor to track over time.
    GET  /tracked/{id}     List tracked competitors for a given product.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.product import Product

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ────────────────────────────────────────

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

_HTML_TAG_RE = re.compile(r"<[^>]+>")


# ── Schemas ──────────────────────────────────────────


class CompetitorAnalyzeRequest(BaseModel):
    """Request body for POST /analyze."""

    competitor_url: str  # URL to a competitor's product page
    my_product_id: uuid.UUID | None = None  # optional: compare against own product


class CompetitorProduct(BaseModel):
    """Scraped competitor product data."""

    url: str
    title: str
    price: float | None
    description: str
    images: list[str]
    platform: str  # detected: "shopify", "amazon", "etsy", "unknown"


class CompetitorAnalysis(BaseModel):
    """Full analysis result returned to the client."""

    competitor: CompetitorProduct
    my_product: dict | None  # populated if my_product_id was provided
    comparison: str  # AI-generated comparison and recommendations
    advantages: list[str]  # what your product does better
    disadvantages: list[str]  # where competitor wins
    recommendations: list[str]  # actionable steps


class TrackCompetitorRequest(BaseModel):
    """Request body for POST /track."""

    competitor_url: str
    my_product_id: uuid.UUID  # which of my products this competes with
    name: str | None = None  # friendly name for the competitor


class TrackedCompetitor(BaseModel):
    """A single tracked competitor entry."""

    url: str
    name: str | None
    last_price: float | None
    last_checked: str | None


# ── HTTP Client Helper ──────────────────────────────


def _make_client() -> httpx.AsyncClient:
    """
    Create a fresh httpx client with browser-like headers and
    Windows IPv4 compatibility (local_address=0.0.0.0).
    """
    return httpx.AsyncClient(
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=True,
        timeout=30.0,
        transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
    )


# ── HTML Helpers ─────────────────────────────────────


def _strip_html(raw_html: str) -> str:
    """Remove HTML tags and decode HTML entities."""
    if not raw_html:
        return ""
    text = _HTML_TAG_RE.sub("", raw_html)
    text = unescape(text)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _safe_float(value: object) -> float | None:
    """Convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError):
        return None


# ── Platform Detection ───────────────────────────────


def _detect_platform(url: str, soup: BeautifulSoup) -> str:
    """Detect the ecommerce platform from URL and page content."""
    host = urlparse(url).hostname or ""

    # Shopify
    if host.endswith(".myshopify.com"):
        return "shopify"
    if soup.find("link", href=re.compile(r"cdn\.shopify\.com")):
        return "shopify"
    if soup.find("meta", attrs={"name": "shopify-digital-wallet"}):
        return "shopify"

    # Amazon
    if "amazon." in host:
        return "amazon"

    # Etsy
    if "etsy.com" in host:
        return "etsy"

    # WooCommerce
    if soup.find("meta", attrs={"name": "generator", "content": re.compile(r"WooCommerce")}):
        return "woocommerce"

    return "unknown"


# ── Scraping Logic ───────────────────────────────────


def _extract_shopify_product(soup: BeautifulSoup, url: str) -> CompetitorProduct:
    """Extract product data from a Shopify store page."""
    title = ""
    price: float | None = None
    description = ""
    images: list[str] = []

    # Try the embedded product JSON first
    script_tag = soup.find("script", attrs={"type": "application/json", "data-product-json": True})
    if script_tag and script_tag.string:
        try:
            data = json.loads(script_tag.string)
            title = data.get("title", "")
            description = _strip_html(data.get("description", "") or data.get("body_html", ""))
            images = [img.get("src", "") for img in data.get("images", []) if isinstance(img, dict)]
            if not images:
                images = [img for img in data.get("images", []) if isinstance(img, str)]
            variants = data.get("variants", [])
            if variants:
                price = _safe_float(variants[0].get("price"))
                # Shopify sometimes stores price in cents
                if price and price > 10000:
                    price = price / 100.0
        except (json.JSONDecodeError, TypeError):
            pass

    # Also try the Shopify JSON-LD / meta tags (more reliable on many themes)
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title:
            title = og_title.get("content", "")
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text(strip=True)

    if not description:
        og_desc = soup.find("meta", property="og:description")
        if og_desc:
            description = og_desc.get("content", "")
    if not description:
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "")

    if price is None:
        price_meta = soup.find("meta", property="product:price:amount")
        if price_meta:
            price = _safe_float(price_meta.get("content"))

    if not images:
        og_image = soup.find("meta", property="og:image")
        if og_image:
            src = og_image.get("content", "")
            if src:
                images.append(src if not src.startswith("//") else f"https:{src}")

    return CompetitorProduct(
        url=url,
        title=title,
        price=price,
        description=description,
        images=images,
        platform="shopify",
    )


def _extract_generic_product(soup: BeautifulSoup, url: str, platform: str) -> CompetitorProduct:
    """Extract product data from a generic ecommerce page using meta tags and structured data."""
    title = ""
    price: float | None = None
    description = ""
    images: list[str] = []

    # ── JSON-LD structured data (schema.org Product) ─────
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        if not script.string:
            continue
        try:
            ld = json.loads(script.string)
            # Handle @graph arrays
            items = ld if isinstance(ld, list) else ld.get("@graph", [ld])
            for item in items:
                item_type = item.get("@type", "")
                if item_type == "Product" or (isinstance(item_type, list) and "Product" in item_type):
                    title = title or item.get("name", "")
                    description = description or item.get("description", "")
                    # Images
                    ld_images = item.get("image", [])
                    if isinstance(ld_images, str):
                        ld_images = [ld_images]
                    elif isinstance(ld_images, dict):
                        ld_images = [ld_images.get("url", "")]
                    for img in ld_images:
                        if isinstance(img, str) and img and img not in images:
                            images.append(img)
                        elif isinstance(img, dict) and img.get("url"):
                            images.append(img["url"])
                    # Price from offers
                    offers = item.get("offers", {})
                    if isinstance(offers, list) and offers:
                        offers = offers[0]
                    if isinstance(offers, dict):
                        price = price or _safe_float(offers.get("price"))
        except (json.JSONDecodeError, TypeError, AttributeError):
            continue

    # ── Open Graph meta tags ─────────────────────────────
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title:
            title = og_title.get("content", "")

    if not title:
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text(strip=True)

    if not description:
        og_desc = soup.find("meta", property="og:description")
        if og_desc:
            description = og_desc.get("content", "")

    if not description:
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "")

    if price is None:
        price_meta = soup.find("meta", property="product:price:amount")
        if price_meta:
            price = _safe_float(price_meta.get("content"))

    if not images:
        og_image = soup.find("meta", property="og:image")
        if og_image:
            src = og_image.get("content", "")
            if src:
                images.append(src if not src.startswith("//") else f"https:{src}")

    return CompetitorProduct(
        url=url,
        title=title,
        price=price,
        description=description,
        images=images,
        platform=platform,
    )


async def _scrape_competitor(url: str) -> CompetitorProduct:
    """
    Scrape a competitor product URL and return structured data.

    For Shopify stores, attempts the JSON API at /products/{handle}.json first,
    then falls back to HTML parsing. For other platforms, uses meta tags and
    structured data (JSON-LD, Open Graph).
    """
    parsed = urlparse(url)
    if not parsed.scheme:
        url = f"https://{url}"

    # ── Shopify JSON API shortcut ────────────────────────
    handle_match = re.search(r"/products/([A-Za-z0-9_-]+)", url)
    host = urlparse(url).hostname or ""

    if handle_match and (host.endswith(".myshopify.com") or "/products/" in url):
        handle = handle_match.group(1)
        base_url = f"{parsed.scheme or 'https'}://{parsed.netloc}"
        json_url = f"{base_url}/products/{handle}.json"
        try:
            async with _make_client() as client:
                resp = await client.get(json_url)
            if resp.status_code == 200:
                data = resp.json().get("product", {})
                if data:
                    variants = data.get("variants", [])
                    price: float | None = None
                    if variants:
                        price = _safe_float(variants[0].get("price"))
                    img_list = [img["src"] for img in (data.get("images") or []) if img.get("src")]
                    return CompetitorProduct(
                        url=url,
                        title=data.get("title", ""),
                        price=price,
                        description=_strip_html(data.get("body_html", "")),
                        images=img_list,
                        platform="shopify",
                    )
        except Exception:
            logger.debug("Shopify JSON API failed for %s, falling back to HTML", url)

    # ── HTML scraping fallback ───────────────────────────
    async with _make_client() as client:
        resp = await client.get(url)

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch competitor URL (HTTP {resp.status_code})",
        )

    soup = BeautifulSoup(resp.text, "html.parser")
    platform = _detect_platform(url, soup)

    if platform == "shopify":
        return _extract_shopify_product(soup, url)

    return _extract_generic_product(soup, url, platform)


# ── AI Comparison ────────────────────────────────────

COMPARISON_SYSTEM_PROMPT = (
    "You are Kansa, an AI ecommerce analyst. "
    "You compare a merchant's product against a competitor's product. "
    "Be specific, actionable, and data-driven. "
    "Return ONLY valid JSON with keys: comparison, advantages, disadvantages, recommendations. "
    "comparison: a 2-4 sentence overall assessment. "
    "advantages: list of strings — what the merchant's product does better. "
    "disadvantages: list of strings — where the competitor wins. "
    "recommendations: list of strings — concrete, actionable steps the merchant should take."
)

SOLO_ANALYSIS_SYSTEM_PROMPT = (
    "You are Kansa, an AI ecommerce analyst. "
    "Analyze this competitor product and provide general insights a merchant "
    "could use when positioning their own products. "
    "Return ONLY valid JSON with keys: comparison, advantages, disadvantages, recommendations. "
    "comparison: a 2-4 sentence overall assessment of this product's strengths and positioning. "
    "advantages: list of strings — strong points of this product listing. "
    "disadvantages: list of strings — weaknesses or gaps in the listing. "
    "recommendations: list of strings — what a merchant competing against this product should do."
)


def _build_comparison_prompt(
    competitor: CompetitorProduct,
    my_product: Product | None,
) -> str:
    """Build a prompt for the AI comparison."""
    parts: list[str] = []

    parts.append("=== COMPETITOR PRODUCT ===")
    parts.append(f"URL: {competitor.url}")
    parts.append(f"Title: {competitor.title or '(unknown)'}")
    parts.append(f"Price: {competitor.price if competitor.price is not None else '(not found)'}")
    parts.append(f"Platform: {competitor.platform}")
    parts.append(f"Description: {competitor.description[:1500] if competitor.description else '(none)'}")
    parts.append(f"Images: {len(competitor.images)}")

    if my_product:
        parts.append("")
        parts.append("=== MY PRODUCT ===")
        parts.append(f"Title: {my_product.title or '(empty)'}")
        parts.append(f"Price: {my_product.price if my_product.price is not None else '(not set)'}")
        parts.append(f"Description: {my_product.description or '(empty)'}")
        parts.append(f"Brand: {my_product.brand or '(none)'}")
        parts.append(f"Category: {my_product.category or '(none)'}")
        parts.append(f"Images: {len(my_product.images) if my_product.images else 0}")
        parts.append(f"Rating: {my_product.rating or '(none)'}")
        parts.append(f"Reviews: {my_product.review_count}")

    parts.append("")
    parts.append("Return ONLY valid JSON with keys: comparison, advantages, disadvantages, recommendations.")

    return "\n".join(parts)


def _parse_json_from_text(text: str) -> dict:
    """Extract JSON from a response that might contain markdown fences."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    stripped = text.strip()
    if stripped.startswith("```"):
        first_newline = stripped.index("\n")
        stripped = stripped[first_newline + 1:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        try:
            return json.loads(stripped.strip())
        except json.JSONDecodeError:
            pass

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
        messages=[{"role": "user", "content": user_msg}],
        temperature=0.7,
    )
    raw = ""
    for block in response.content:
        if block.type == "text":
            raw += block.text
    return _parse_json_from_text(raw)


async def _run_ai_comparison(
    user: User,
    competitor: CompetitorProduct,
    my_product: Product | None,
) -> dict:
    """Run the AI comparison using the user's BYOK key."""
    has_openai = bool(user.openai_api_key)
    has_anthropic = bool(user.anthropic_api_key)

    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    system_prompt = COMPARISON_SYSTEM_PROMPT if my_product else SOLO_ANALYSIS_SYSTEM_PROMPT
    user_prompt = _build_comparison_prompt(competitor, my_product)

    try:
        if has_openai:
            logger.info("Competitor analysis: calling OpenAI")
            return await _call_openai(user.openai_api_key, system_prompt, user_prompt)
        else:
            logger.info("Competitor analysis: calling Anthropic")
            return await _call_anthropic(user.anthropic_api_key, system_prompt, user_prompt)
    except ValueError as exc:
        logger.error("Failed to parse AI response for competitor analysis: %s", exc)
        raise HTTPException(status_code=502, detail="AI returned an unparseable response")
    except Exception as exc:
        logger.error("AI call failed for competitor analysis: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


# ── Endpoints ────────────────────────────────────────


@router.post("/analyze", response_model=CompetitorAnalysis)
async def analyze_competitor(
    body: CompetitorAnalyzeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> CompetitorAnalysis:
    """
    Scrape a competitor product URL and generate an AI-powered comparison
    against one of the merchant's own products.

    If my_product_id is provided, runs a side-by-side comparison.
    Otherwise, provides a standalone competitive analysis.
    """
    # Validate URL
    parsed = urlparse(body.competitor_url)
    if not parsed.scheme and not parsed.netloc:
        # Try adding https
        parsed = urlparse(f"https://{body.competitor_url}")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid competitor URL")

    # Load the merchant's product if requested
    my_product: Product | None = None
    my_product_dict: dict | None = None

    if body.my_product_id:
        result = await session.execute(
            select(Product).where(
                Product.id == body.my_product_id,
                Product.user_id == user.id,
            )
        )
        my_product = result.scalar_one_or_none()
        if not my_product:
            raise HTTPException(status_code=404, detail="Product not found")

        my_product_dict = {
            "title": my_product.title or "",
            "price": my_product.price,
            "description": my_product.description or "",
            "brand": my_product.brand or "",
            "category": my_product.category or "",
            "images": my_product.images or [],
            "rating": my_product.rating,
            "review_count": my_product.review_count,
        }

    # Scrape the competitor
    try:
        competitor = await _scrape_competitor(body.competitor_url)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Scraping failed for %s: %s", body.competitor_url, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to scrape competitor URL: {exc}",
        )

    if not competitor.title and not competitor.description:
        raise HTTPException(
            status_code=422,
            detail="Could not extract product data from the competitor URL. The page may be JavaScript-rendered or behind a login.",
        )

    # Run AI comparison
    ai_result = await _run_ai_comparison(user, competitor, my_product)

    # Validate required keys
    for key in ("comparison", "advantages", "disadvantages", "recommendations"):
        if key not in ai_result:
            ai_result[key] = [] if key != "comparison" else "Analysis could not be completed."

    # Ensure list fields are actually lists
    for key in ("advantages", "disadvantages", "recommendations"):
        if not isinstance(ai_result[key], list):
            ai_result[key] = [str(ai_result[key])]

    return CompetitorAnalysis(
        competitor=competitor,
        my_product=my_product_dict,
        comparison=ai_result["comparison"],
        advantages=ai_result["advantages"],
        disadvantages=ai_result["disadvantages"],
        recommendations=ai_result["recommendations"],
    )


@router.post("/track")
async def track_competitor(
    body: TrackCompetitorRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Save a competitor to track over time.

    Stores the competitor in the product's metadata under
    the "tracked_competitors" key.
    """
    # Load product and verify ownership
    result = await session.execute(
        select(Product).where(
            Product.id == body.my_product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Validate URL
    parsed = urlparse(body.competitor_url)
    if not parsed.netloc and not parsed.scheme:
        parsed = urlparse(f"https://{body.competitor_url}")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid competitor URL")

    # Scrape current price for initial tracking data
    current_price: float | None = None
    try:
        competitor_data = await _scrape_competitor(body.competitor_url)
        current_price = competitor_data.price
        friendly_name = body.name or competitor_data.title or body.competitor_url
    except Exception:
        friendly_name = body.name or body.competitor_url

    # Add to tracked_competitors in metadata
    metadata = dict(product.metadata_) if product.metadata_ else {}
    tracked: list[dict] = metadata.get("tracked_competitors", [])

    # Check for duplicates
    for existing in tracked:
        if existing.get("url") == body.competitor_url:
            raise HTTPException(
                status_code=409,
                detail="This competitor URL is already being tracked for this product",
            )

    tracked.append({
        "url": body.competitor_url,
        "name": friendly_name,
        "last_price": current_price,
        "last_checked": datetime.now(timezone.utc).isoformat(),
    })

    metadata["tracked_competitors"] = tracked
    product.metadata_ = metadata

    await session.commit()
    logger.info(
        "Tracking competitor %s for product %s", body.competitor_url, product.id
    )

    return {
        "ok": True,
        "message": f"Now tracking competitor: {friendly_name}",
        "tracked_count": len(tracked),
    }


@router.get("/tracked/{product_id}")
async def list_tracked_competitors(
    product_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[TrackedCompetitor]:
    """
    List all tracked competitors for a given product.
    """
    # Load product and verify ownership
    result = await session.execute(
        select(Product).where(
            Product.id == product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    metadata = product.metadata_ or {}
    tracked: list[dict] = metadata.get("tracked_competitors", [])

    return [
        TrackedCompetitor(
            url=entry.get("url", ""),
            name=entry.get("name"),
            last_price=entry.get("last_price"),
            last_checked=entry.get("last_checked"),
        )
        for entry in tracked
    ]
