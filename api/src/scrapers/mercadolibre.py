"""
MercadoLibre Scraper — extracts product data via HTML scraping.

Strategy:
    1. Fetch product page HTML
    2. Parse `initialState` JSON embedded in <script> tag (rich component data)
    3. Fall back to JSON-LD structured data for basic fields
    4. Build image URLs from gallery template + picture IDs
    5. Extract specs, features, reviews from initialState components

The public API (api.mercadolibre.com) is now geo/policy-blocked (403),
so we scrape the rendered HTML instead.
"""

import json
import logging
import re
from urllib.parse import urlparse

import httpx

from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError

logger = logging.getLogger(__name__)

# Map MercadoLibre domain TLD to currency
DOMAIN_CURRENCY = {
    "com.mx": "MXN",
    "com.ar": "ARS",
    "com.br": "BRL",
    "com.co": "COP",
    "cl": "CLP",
    "com.pe": "PEN",
    "com.uy": "UYU",
    "com.ec": "USD",
    "com.ve": "VES",
}

# Stealth headers (don't set Accept-Encoding — let httpx handle it)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/134.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
}


class MercadoLibreScraper(BaseScraper):
    """Scrapes MercadoLibre using HTML parsing + embedded JSON state."""

    ML_DOMAINS = [
        "mercadolibre.com.mx",
        "mercadolibre.com.ar",
        "mercadolibre.com.br",
        "mercadolivre.com.br",
        "mercadolibre.com.co",
        "mercadolibre.cl",
        "mercadolibre.com.pe",
        "mercadolibre.com.uy",
        "mercadolibre.com.ec",
        "mercadolibre.com.ve",
        "articulo.mercadolibre.com.mx",
        "articulo.mercadolibre.com.ar",
        "articulo.mercadolibre.com.co",
        "produto.mercadolivre.com.br",
    ]

    @property
    def platform_name(self) -> str:
        return "mercadolibre"

    def can_handle(self, url: str) -> bool:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        return any(domain in hostname for domain in self.ML_DOMAINS)

    def extract_item_id(self, url: str) -> str | None:
        """Extract MercadoLibre item ID from URL (MLM-123, MLA123, etc.)."""
        match = re.search(r"(ML[A-Z])-?(\d+)", url)
        if match:
            return f"{match.group(1)}{match.group(2)}"
        return None

    def _detect_currency(self, url: str) -> str:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        for tld, currency in DOMAIN_CURRENCY.items():
            if hostname.endswith(tld):
                return currency
        return "USD"

    def _extract_initial_state(self, html: str) -> dict | None:
        """Extract the initialState JSON from embedded script tags."""
        idx = html.find('"initialState":')
        if idx == -1:
            return None

        # Move past the key to the value
        start_search = idx + len('"initialState":')
        brace_pos = html.find("{", start_search)
        if brace_pos == -1:
            return None

        # Bracket-counting with string awareness (skip braces inside "...")
        depth = 0
        in_string = False
        escape = False
        start = brace_pos
        limit = min(brace_pos + 500_000, len(html))

        for i in range(brace_pos, limit):
            c = html[i]
            if escape:
                escape = False
                continue
            if c == "\\":
                escape = True
                continue
            if c == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(html[start : i + 1])
                    except json.JSONDecodeError:
                        logger.warning("Failed to parse initialState JSON")
                        return None
        return None

    def _extract_json_ld(self, html: str) -> dict | None:
        """Extract Product JSON-LD from the page."""
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict) and data.get("@type") == "Product":
                    return data
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("@type") == "Product":
                            return item
            except (json.JSONDecodeError, TypeError):
                continue
        return None

    def _build_image_urls(self, gallery: dict) -> list[str]:
        """Build image URLs from gallery component template + picture IDs."""
        config = gallery.get("picture_config", {})
        template = config.get("template", "")
        pictures = gallery.get("pictures", [])

        if not template or not pictures:
            return []

        urls = []
        for pic in pictures:
            pic_id = pic.get("id", "")
            if not pic_id:
                continue
            # Replace template placeholders
            url = template.replace("{id}", pic_id).replace("{sanitizedTitle}", "")
            urls.append(url)
        return urls

    def _extract_price_from_state(self, components: dict) -> tuple[float | None, float | None]:
        """Extract price and original_price from initialState components."""
        price = None
        original_price = None

        # Try price component
        price_comp = components.get("price", {})
        if price_comp.get("state") != "HIDDEN":
            # Price can be nested in different structures
            price_data = price_comp.get("price", {})
            if isinstance(price_data, dict):
                price = price_data.get("value")
                original = price_data.get("original_price", {})
                if isinstance(original, dict):
                    original_price = original.get("value")

        # Try buy_box_offers for price
        if price is None:
            buy_box = components.get("buy_box_offers", {})
            offers = buy_box.get("offers", [])
            if offers:
                offer = offers[0]
                offer_price = offer.get("price", {})
                if isinstance(offer_price, dict):
                    price = offer_price.get("value") or offer_price.get("amount")
                elif isinstance(offer_price, (int, float)):
                    price = offer_price

        return price, original_price

    def _extract_specs(self, components: dict) -> list[str]:
        """Extract product specs/attributes as bullet points."""
        bullets = []

        # Technical specifications: specs[].attributes[] → {"id": "key", "text": "value"}
        specs_comp = components.get("highlighted_specs_attrs", {})
        if specs_comp.get("state") == "VISIBLE":
            for sub in specs_comp.get("components", []):
                if sub.get("type") == "technical_specifications":
                    for group in sub.get("specs", []):
                        for attr in group.get("attributes", []):
                            attr_id = attr.get("id", "")
                            attr_text = attr.get("text", "")
                            if attr_id and attr_text:
                                bullets.append(f"{attr_id}: {attr_text}")
                elif sub.get("type") == "key_value_component":
                    label = sub.get("label", {}).get("text", "")
                    values = sub.get("values", [])
                    value = values[0].get("text", "") if values else ""
                    if label and value:
                        bullets.append(f"{label}: {value}")

        # Highlighted features: features[] → {"text": "key: value."}
        features_comp = components.get("highlighted_specs_features", {})
        if features_comp.get("state") == "VISIBLE":
            for sub in features_comp.get("components", []):
                if sub.get("type") == "highlighted_features":
                    for feat in sub.get("features", []):
                        text = feat.get("text", "")
                        if text:
                            bullets.append(text)

        return bullets

    def _extract_seller_from_state(self, components: dict) -> str:
        """Extract seller name from initialState."""
        # Try buy_box_offers first
        buy_box = components.get("buy_box_offers", {})
        for offer in buy_box.get("offers", []):
            seller = offer.get("seller", {})
            nickname = seller.get("nickname", "")
            if nickname:
                return nickname

        # Try seller component
        seller_comp = components.get("seller", {})
        header = seller_comp.get("header", {})
        title = header.get("title", "")
        if title:
            return title

        return ""

    async def scrape(self, url: str) -> ScrapedProduct:
        """Scrape a MercadoLibre product page via HTML parsing."""
        item_id = self.extract_item_id(url) or ""

        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
            headers=HEADERS,
        ) as client:
            response = await client.get(url)

        if response.status_code != 200:
            raise ScrapingError(
                f"MercadoLibre returned HTTP {response.status_code}",
                url=url,
                status_code=response.status_code,
            )

        html = response.text
        if len(html) < 1000:
            raise ScrapingError("Page content too short — likely blocked", url=url)

        # ── Extract data sources ─────────────────────────
        state = self._extract_initial_state(html)
        json_ld = self._extract_json_ld(html)

        components = state.get("components", {}) if state else {}

        # ── Title ────────────────────────────────────────
        title = ""
        header = components.get("header", {})
        if header:
            title = header.get("title", "")
        if not title and json_ld:
            title = json_ld.get("name", "")

        # ── Price ────────────────────────────────────────
        price, original_price = self._extract_price_from_state(components)

        # Fallback to JSON-LD
        if price is None and json_ld:
            offers = json_ld.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            ld_price = offers.get("price")
            if ld_price and ld_price > 0:
                price = float(ld_price)

        # ── Currency ─────────────────────────────────────
        currency = self._detect_currency(url)
        if json_ld:
            offers = json_ld.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            ld_currency = offers.get("priceCurrency")
            if ld_currency:
                currency = ld_currency

        # ── Discount ─────────────────────────────────────
        discount_percent = None
        if price and original_price and original_price > price:
            discount_percent = round((1 - price / original_price) * 100, 1)

        # ── Images ───────────────────────────────────────
        gallery = components.get("gallery", {})
        images = self._build_image_urls(gallery)

        # Fallback to JSON-LD image
        if not images and json_ld:
            ld_img = json_ld.get("image")
            if ld_img:
                images = [ld_img] if isinstance(ld_img, str) else list(ld_img)

        # ── Description ──────────────────────────────────
        description = ""
        desc_comp = components.get("description", {})
        if desc_comp.get("state") == "VISIBLE":
            description = desc_comp.get("content", "")
        if not description and json_ld:
            description = json_ld.get("description", "")

        # ── Reviews ──────────────────────────────────────
        rating = None
        review_count = 0
        reviews = header.get("reviews", {})
        if reviews:
            rating = reviews.get("rating")
            review_count = reviews.get("amount", 0)

        # Fallback to JSON-LD
        if rating is None and json_ld:
            agg = json_ld.get("aggregateRating", {})
            if agg:
                rating = agg.get("ratingValue")
                review_count = agg.get("ratingCount", agg.get("reviewCount", 0))

        # ── Brand ────────────────────────────────────────
        brand = ""
        if json_ld:
            ld_brand = json_ld.get("brand")
            if isinstance(ld_brand, str):
                brand = ld_brand
            elif isinstance(ld_brand, dict):
                brand = ld_brand.get("name", "")

        # ── Seller ───────────────────────────────────────
        seller_name = self._extract_seller_from_state(components)

        # ── Specs / Bullet Points ────────────────────────
        bullet_points = self._extract_specs(components)

        # ── Condition ────────────────────────────────────
        condition = header.get("subtitle", "")

        # ── Availability ─────────────────────────────────
        in_stock = True
        no_stock = components.get("no_stock_status", {})
        if no_stock.get("state") == "VISIBLE":
            in_stock = False
        if json_ld:
            offers = json_ld.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            avail = offers.get("availability", "")
            if "OutOfStock" in avail:
                in_stock = False

        # ── Shipping ─────────────────────────────────────
        fulfillment = ""
        shipping = components.get("shipping_summary", {})
        if shipping.get("state") == "VISIBLE":
            title_text = shipping.get("title", {})
            if isinstance(title_text, dict):
                title_text = title_text.get("text", "")
            if "full" in str(title_text).lower():
                fulfillment = "mercadolibre_full"
            elif "gratis" in str(title_text).lower() or "free" in str(title_text).lower():
                fulfillment = "free_shipping"

        # ── Platform ID ──────────────────────────────────
        platform_id = item_id
        if not platform_id and state:
            platform_id = state.get("id", "")
        if not platform_id and json_ld:
            platform_id = json_ld.get("sku", json_ld.get("productID", ""))

        logger.info(
            "ML scrape: title=%s, price=%s, images=%d, rating=%s, bullets=%d",
            title[:50] if title else "(empty)",
            price,
            len(images),
            rating,
            len(bullet_points),
        )

        return ScrapedProduct(
            url=url,
            platform="mercadolibre",
            platform_id=platform_id,
            title=title,
            brand=brand,
            description=description,
            bullet_points=bullet_points,
            price=price,
            currency=currency,
            original_price=original_price,
            discount_percent=discount_percent,
            images=images,
            rating=rating,
            review_count=review_count,
            seller_name=seller_name,
            fulfillment=fulfillment,
            in_stock=in_stock,
            raw_data={
                "condition": condition,
                "source": "html_scraping",
            },
        )
