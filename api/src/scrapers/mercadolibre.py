"""
MercadoLibre Scraper — extracts product data via their public REST API.

Strategy:
    1. Extract item ID from URL (MLM-123456789 format)
    2. Call https://api.mercadolibre.com/items/{item_id} (FREE, no auth, 1500 req/min)
    3. Call /items/{item_id}/description for full description
    4. Parse into ScrapedProduct
    5. Detect currency from API response (not hardcoded)

Rate limit: 1500 requests/minute without auth token.
No browser needed — pure HTTP.
"""

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


class MercadoLibreScraper(BaseScraper):
    """Scrapes MercadoLibre using their free public API."""

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

    API_BASE = "https://api.mercadolibre.com"

    @property
    def platform_name(self) -> str:
        return "mercadolibre"

    def can_handle(self, url: str) -> bool:
        """Check if URL is a MercadoLibre product page."""
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        return any(domain in hostname for domain in self.ML_DOMAINS)

    def extract_item_id(self, url: str) -> str | None:
        """
        Extract MercadoLibre item ID from URL.
        ML item IDs: MLM-123456789, MLA123456789, MLB-123456789, etc.
        """
        match = re.search(r"(ML[A-Z])-?(\d+)", url)
        if match:
            return f"{match.group(1)}{match.group(2)}"
        return None

    def _detect_currency(self, url: str, api_data: dict | None = None) -> str:
        """Detect currency from API response or URL domain."""
        if api_data and "currency_id" in api_data:
            return api_data["currency_id"]

        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        for tld, currency in DOMAIN_CURRENCY.items():
            if hostname.endswith(tld):
                return currency
        return "USD"

    async def scrape(self, url: str) -> ScrapedProduct:
        """Scrape a MercadoLibre product using the public API."""
        item_id = self.extract_item_id(url)
        if not item_id:
            raise ScrapingError("Could not extract item ID from URL", url=url)

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MalakBot/1.0)"},
        ) as client:
            # Fetch item data from API
            item_response = await client.get(f"{self.API_BASE}/items/{item_id}")
            if item_response.status_code != 200:
                raise ScrapingError(
                    f"MercadoLibre API returned {item_response.status_code} for {item_id}",
                    url=url,
                    status_code=item_response.status_code,
                )

            data = item_response.json()

            # Fetch description (separate endpoint)
            description = ""
            desc_response = await client.get(f"{self.API_BASE}/items/{item_id}/description")
            if desc_response.status_code == 200:
                desc_data = desc_response.json()
                description = desc_data.get("plain_text", "") or desc_data.get("text", "")

            return self._parse_api_response(url, data, description)

    def _parse_api_response(self, url: str, data: dict, description: str) -> ScrapedProduct:
        """Parse MercadoLibre API response into ScrapedProduct."""
        # Extract images
        pictures = data.get("pictures", [])
        images = [pic.get("secure_url", pic.get("url", "")) for pic in pictures]

        # Extract price
        price = data.get("price")
        original_price = data.get("original_price")
        currency = data.get("currency_id", self._detect_currency(url, data))

        # Calculate discount
        discount_percent = None
        if price and original_price and original_price > price:
            discount_percent = round((1 - price / original_price) * 100, 1)

        # Extract seller info
        seller = data.get("seller", {})
        seller_name = seller.get("nickname", "")

        # Extract shipping info
        shipping = data.get("shipping", {})
        fulfillment = "free_shipping" if shipping.get("free_shipping") else "standard"
        if shipping.get("logistic_type") == "fulfillment":
            fulfillment = "mercadolibre_full"  # Equivalent to FBA

        # Extract bullet points from attributes
        attributes = data.get("attributes", [])
        bullet_points = [
            f"{attr.get('name', '')}: {attr.get('value_name', '')}"
            for attr in attributes
            if attr.get("value_name")
        ]

        # Stock info
        available_quantity = data.get("available_quantity", 0)
        sold_quantity = data.get("sold_quantity", 0)

        # Category
        category_id = data.get("category_id", "")

        return ScrapedProduct(
            url=url,
            platform="mercadolibre",
            platform_id=data.get("id", ""),
            title=data.get("title", ""),
            brand=next(
                (
                    attr.get("value_name", "")
                    for attr in attributes
                    if attr.get("id") == "BRAND"
                ),
                "",
            ),
            description=description,
            bullet_points=bullet_points,
            category=category_id,
            price=price,
            currency=currency,
            original_price=original_price,
            discount_percent=discount_percent,
            images=images,
            rating=None,  # ML API doesn't expose ratings directly
            review_count=0,
            seller_name=seller_name,
            fulfillment=fulfillment,
            in_stock=data.get("status") == "active" and available_quantity > 0,
            stock_quantity=available_quantity,
            raw_data={
                "sold_quantity": sold_quantity,
                "condition": data.get("condition", ""),
                "listing_type": data.get("listing_type_id", ""),
                "warranty": data.get("warranty", ""),
                "catalog_listing": data.get("catalog_listing", False),
            },
        )
