"""
MercadoLibre Scraper — extracts product data from MercadoLibre.

Handles:
- mercadolibre.com.mx (Mexico)
- mercadolibre.com.ar (Argentina)
- mercadolibre.com.br (Brazil — also Mercado Livre)
- mercadolibre.com.co (Colombia)
- mercadolibre.cl (Chile)
- Other LATAM MercadoLibre domains

MercadoLibre uses a mix of server-rendered HTML and
client-side JavaScript. The product API is also available
for some data extraction.
"""

import re

from src.scrapers.base import BaseScraper, ScrapedProduct


class MercadoLibreScraper(BaseScraper):
    """Scrapes MercadoLibre product pages for structured product data."""

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
    ]

    @property
    def platform_name(self) -> str:
        return "mercadolibre"

    def can_handle(self, url: str) -> bool:
        """Check if URL is a MercadoLibre product page."""
        return any(domain in url for domain in self.ML_DOMAINS)

    def extract_item_id(self, url: str) -> str | None:
        """
        Extract MercadoLibre item ID from URL.

        ML item IDs look like: MLM-123456789 or MLM123456789
        """
        match = re.search(r"(ML[A-Z])-?(\d+)", url)
        if match:
            return f"{match.group(1)}{match.group(2)}"
        return None

    async def scrape(self, url: str) -> ScrapedProduct:
        """
        Scrape a MercadoLibre product page.

        TODO: Implement full MercadoLibre scraping:
        1. Extract item ID from URL
        2. Try ML API first: api.mercadolibre.com/items/{item_id}
        3. Fallback to Playwright scraping if API is restricted
        4. Parse title, price, images
        5. Parse seller reputation and location
        6. Parse shipping info (full/free shipping indicator)
        7. Parse questions and answers
        8. Parse sales history (units sold)
        9. Parse product attributes/specifications
        """
        item_id = self.extract_item_id(url) or ""

        # TODO: Try ML public API first
        # api_url = f"https://api.mercadolibre.com/items/{item_id}"
        # async with httpx.AsyncClient() as client:
        #     response = await client.get(api_url)
        #     if response.status_code == 200:
        #         data = response.json()

        # TODO: Fallback to HTML scraping
        # page = await browser.new_page()
        # await page.goto(url, wait_until="networkidle")

        return ScrapedProduct(
            url=url,
            platform="mercadolibre",
            platform_id=item_id,
            currency="MXN",  # TODO: Detect from domain
            # All other fields empty — to be implemented
        )
