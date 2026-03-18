"""
Shopify Scraper — extracts product data from Shopify storefronts.

Shopify stores expose a JSON API at /products/{handle}.json
which makes scraping significantly easier than other platforms.

Strategy:
1. Extract product handle from the URL via regex.
2. Attempt the lightweight JSON API first (no browser needed).
3. Fall back to HTML parsing with selectolax if JSON is restricted.

Handles:
- *.myshopify.com URLs
- Custom domain Shopify stores
- Product URLs with /collections/ prefix
- URL query parameters (variant IDs, tracking params, etc.)
"""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import urlparse

import httpx
from selectolax.parser import HTMLParser

from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError

# Matches /products/{handle} with optional trailing slash, query string, or fragment.
_HANDLE_RE = re.compile(r"/products/([A-Za-z0-9_-]+)")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(raw_html: str) -> str:
    """Remove HTML tags and decode HTML entities from a string."""
    if not raw_html:
        return ""
    text = _HTML_TAG_RE.sub("", raw_html)
    text = unescape(text)
    # Collapse whitespace runs but keep newlines meaningful.
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def extract_handle(url: str) -> str | None:
    """
    Pull the Shopify product handle out of a URL.

    Works for all common Shopify URL patterns:
        https://store.myshopify.com/products/blue-widget
        https://custom.com/collections/sale/products/blue-widget
        https://custom.com/products/blue-widget?variant=123456
    """
    match = _HANDLE_RE.search(url)
    return match.group(1) if match else None


def _build_base_url(url: str) -> str:
    """Return scheme + host (e.g. ``https://store.myshopify.com``)."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


class ShopifyScraper(BaseScraper):
    """Scrapes Shopify product pages using their JSON API with HTML fallback."""

    @property
    def platform_name(self) -> str:
        return "shopify"

    # --------------------------------------------------------------------- #
    # URL detection
    # --------------------------------------------------------------------- #

    def can_handle(self, url: str) -> bool:
        """
        Determine whether *url* points to a Shopify product page.

        Detection:
        1. Domain is ``*.myshopify.com`` (guaranteed Shopify).
        2. Path contains ``/products/{handle}`` (very likely Shopify, may
           need runtime confirmation for custom domains).
        """
        try:
            parsed = urlparse(url)
        except Exception:
            return False

        host = parsed.hostname or ""

        # *.myshopify.com — always Shopify
        if host.endswith(".myshopify.com"):
            return True

        # /products/{handle} in the path — likely Shopify (or at minimum
        # a platform we attempt to handle the same way).
        if _HANDLE_RE.search(parsed.path):
            return True

        return False

    # --------------------------------------------------------------------- #
    # Primary: JSON API
    # --------------------------------------------------------------------- #

    async def scrape(self, url: str) -> ScrapedProduct:
        """Scrape a Shopify product page (JSON first, HTML fallback)."""
        handle = extract_handle(url)
        if not handle:
            raise ScrapingError(
                f"Could not extract product handle from URL: {url}",
                url=url,
            )

        base_url = _build_base_url(url)

        # Try the JSON API first — fast and structured.
        try:
            return await self._scrape_json(url, base_url, handle)
        except Exception:
            pass

        # Fallback: fetch the actual product page and parse the HTML.
        return await self._scrape_html(url, base_url, handle)

    async def _scrape_json(
        self,
        original_url: str,
        base_url: str,
        handle: str,
    ) -> ScrapedProduct:
        """Fetch and parse the ``/products/{handle}.json`` endpoint."""
        json_url = f"{base_url}/products/{handle}.json"

        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=30.0,
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
        ) as client:
            resp = await client.get(json_url)
            resp.raise_for_status()

        data: dict = resp.json().get("product", {})
        if not data:
            raise ScrapingError("Empty product object in JSON response", url=original_url)

        return self._parse_json(original_url, data)

    def _parse_json(self, url: str, data: dict) -> ScrapedProduct:
        """Convert Shopify JSON product payload into a ``ScrapedProduct``."""
        # --- Pricing (cheapest available variant) ---
        variants: list[dict] = data.get("variants") or []
        price: float | None = None
        original_price: float | None = None
        in_stock = False

        for v in variants:
            v_price = self._safe_float(v.get("price"))
            if v_price is not None:
                if price is None or v_price < price:
                    price = v_price
                    compare = self._safe_float(v.get("compare_at_price"))
                    if compare and compare > v_price:
                        original_price = compare

            if v.get("available", True):
                in_stock = True

        # --- Discount ---
        discount: float | None = None
        if price is not None and original_price is not None and original_price > 0:
            discount = round((1 - price / original_price) * 100, 1)

        # --- Images ---
        images = [img["src"] for img in (data.get("images") or []) if img.get("src")]

        # --- Description ---
        description = _strip_html(data.get("body_html") or "")

        # --- Tags as search terms ---
        tags: list[str] = data.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        return ScrapedProduct(
            url=url,
            platform="shopify",
            platform_id=str(data.get("id", "")),
            title=data.get("title", ""),
            brand=data.get("vendor", ""),
            description=description,
            category=data.get("product_type", ""),
            price=price,
            currency="USD",  # Shopify JSON doesn't include currency; caller overrides if needed.
            original_price=original_price,
            discount_percent=discount,
            images=images,
            in_stock=in_stock,
            search_terms=tags,
            raw_data=data,
        )

    # --------------------------------------------------------------------- #
    # Fallback: HTML scraping with selectolax
    # --------------------------------------------------------------------- #

    async def _scrape_html(
        self,
        original_url: str,
        base_url: str,
        handle: str,
    ) -> ScrapedProduct:
        """Fetch the product page HTML and extract data with selectolax."""
        product_url = f"{base_url}/products/{handle}"

        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=30.0,
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
        ) as client:
            resp = await client.get(product_url)
            if resp.status_code >= 400:
                raise ScrapingError(
                    f"HTTP {resp.status_code} fetching {product_url}",
                    url=original_url,
                    status_code=resp.status_code,
                )

        tree = HTMLParser(resp.text)
        return self._parse_html(original_url, tree)

    def _parse_html(self, url: str, tree: HTMLParser) -> ScrapedProduct:
        """Extract product data from a Shopify HTML page."""
        # Title — <meta property="og:title"> or <title>
        title = self._meta(tree, "og:title") or ""
        if not title:
            node = tree.css_first("title")
            title = node.text(strip=True) if node else ""

        # Description
        description = self._meta(tree, "og:description") or ""

        # Price — <meta property="product:price:amount">
        price = self._safe_float(self._meta(tree, "product:price:amount"))
        currency = self._meta(tree, "product:price:currency") or "USD"

        # Images — <meta property="og:image"> plus product gallery images
        images: list[str] = []
        og_image = self._meta(tree, "og:image")
        if og_image:
            images.append(og_image)

        for node in tree.css('img[src*="cdn.shopify.com"]'):
            src = node.attributes.get("src", "")
            if src and src not in images:
                # Normalise protocol-relative URLs
                if src.startswith("//"):
                    src = "https:" + src
                images.append(src)

        # Brand — <meta property="product:brand">
        brand = self._meta(tree, "product:brand") or ""

        # Availability
        avail = self._meta_name(tree, "availability") or ""
        in_stock = "instock" in avail.lower().replace(" ", "") if avail else True

        return ScrapedProduct(
            url=url,
            platform="shopify",
            title=title,
            brand=brand,
            description=description,
            price=price,
            currency=currency,
            images=images,
            in_stock=in_stock,
        )

    # --------------------------------------------------------------------- #
    # Helpers
    # --------------------------------------------------------------------- #

    @staticmethod
    def _meta(tree: HTMLParser, prop: str) -> str | None:
        """Get content of ``<meta property="...">``."""
        node = tree.css_first(f'meta[property="{prop}"]')
        if node:
            return node.attributes.get("content")
        return None

    @staticmethod
    def _meta_name(tree: HTMLParser, name: str) -> str | None:
        """Get content of ``<meta name="...">``."""
        node = tree.css_first(f'meta[name="{name}"]')
        if node:
            return node.attributes.get("content")
        return None

    @staticmethod
    def _safe_float(value: object) -> float | None:
        """Convert *value* to float, returning ``None`` on failure."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
