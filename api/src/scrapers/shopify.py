"""
Shopify Scraper — extracts product data from Shopify storefronts.

Shopify stores expose a JSON API at /products/{handle}.json
which makes scraping significantly easier than other platforms.

Handles:
- Standard Shopify storefronts
- Custom domains
- Product variants (size, color, etc.)
- Collection pages
"""

from src.scrapers.base import BaseScraper, ScrapedProduct


class ShopifyScraper(BaseScraper):
    """Scrapes Shopify product pages using their JSON API."""

    @property
    def platform_name(self) -> str:
        return "shopify"

    def can_handle(self, url: str) -> bool:
        """
        Check if URL is a Shopify store.

        Detection strategies:
        1. URL contains /products/ path
        2. Domain is *.myshopify.com
        3. Page meta tag contains Shopify

        TODO: Implement robust Shopify detection.
        For now, check for myshopify.com and /products/ pattern.
        """
        if "myshopify.com" in url:
            return True
        if "/products/" in url:
            # Could be Shopify — needs further validation via HTTP
            return True
        return False

    async def scrape(self, url: str) -> ScrapedProduct:
        """
        Scrape a Shopify product page.

        TODO: Implement full Shopify scraping:
        1. Detect product handle from URL
        2. Fetch {store_url}/products/{handle}.json
        3. Parse JSON response for product data
        4. Extract all variants with pricing
        5. Parse images from product.images array
        6. Fallback to HTML parsing if JSON API is restricted
        7. Extract reviews if a review app is installed (Judge.me, Yotpo, etc.)
        """
        # TODO: Extract product handle
        # handle = extract_handle(url)

        # TODO: Fetch JSON API
        # json_url = f"{store_base}/products/{handle}.json"
        # async with httpx.AsyncClient() as client:
        #     response = await client.get(json_url)
        #     data = response.json()["product"]

        # TODO: Parse product data from JSON
        # title = data["title"]
        # description = data["body_html"]
        # images = [img["src"] for img in data["images"]]
        # variants = data["variants"]

        return ScrapedProduct(
            url=url,
            platform="shopify",
            # All other fields empty — to be implemented
        )
