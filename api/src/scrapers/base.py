"""
Base scraper interface for all platform-specific scrapers.

Scrapers handle the low-level extraction of product data from
ecommerce platforms. They deal with:
- HTTP requests / Playwright browser automation
- HTML parsing and data extraction
- Anti-bot countermeasures
- Platform-specific data normalization
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ScrapedProduct:
    """
    Unified product data structure returned by all scrapers.

    This is the normalized output regardless of which platform
    the data came from.
    """

    # Identity
    url: str
    platform: str
    platform_id: str = ""  # ASIN, SKU, etc.

    # Core product info
    title: str = ""
    brand: str = ""
    description: str = ""
    bullet_points: list[str] = field(default_factory=list)
    category: str = ""
    subcategory: str = ""

    # Pricing
    price: float | None = None
    currency: str = "USD"
    original_price: float | None = None  # Before discount
    discount_percent: float | None = None

    # Media
    images: list[str] = field(default_factory=list)  # URLs
    video_urls: list[str] = field(default_factory=list)

    # Reviews
    rating: float | None = None  # 0-5 scale
    review_count: int = 0
    rating_distribution: dict[int, int] = field(default_factory=dict)  # {5: 100, 4: 50, ...}

    # Seller info
    seller_name: str = ""
    seller_url: str = ""
    fulfillment: str = ""  # FBA, FBM, Shipped by Walmart, etc.

    # Availability
    in_stock: bool = True
    stock_quantity: int | None = None

    # SEO / Keywords
    search_terms: list[str] = field(default_factory=list)

    # Raw data (for debugging / reprocessing)
    raw_data: dict[str, Any] = field(default_factory=dict)


class BaseScraper(ABC):
    """
    Abstract base class for platform-specific scrapers.

    Subclasses must implement:
        - platform_name: Which platform this scraper handles
        - can_handle(url): Whether this scraper can handle a given URL
        - scrape(url): Extract product data from the URL
    """

    @property
    @abstractmethod
    def platform_name(self) -> str:
        """Name of the platform this scraper handles (e.g., 'amazon')."""
        ...

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """
        Check if this scraper can handle the given URL.

        Args:
            url: Product page URL.

        Returns:
            True if this scraper knows how to extract data from this URL.
        """
        ...

    @abstractmethod
    async def scrape(self, url: str) -> ScrapedProduct:
        """
        Scrape a product page and return structured data.

        Args:
            url: Product page URL.

        Returns:
            ScrapedProduct with extracted data.

        Raises:
            ScrapingError: If scraping fails (blocked, not found, etc.)
        """
        ...

    async def scrape_search_results(self, query: str, max_results: int = 20) -> list[ScrapedProduct]:
        """
        Scrape search results for a query. Override in subclasses that support it.

        Args:
            query: Search query string.
            max_results: Maximum number of results to return.

        Returns:
            List of ScrapedProduct from search results.
        """
        raise NotImplementedError(
            f"{self.platform_name} scraper does not support search result scraping yet"
        )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} platform={self.platform_name!r}>"


class ScrapingError(Exception):
    """Raised when scraping fails."""

    def __init__(self, message: str, url: str = "", status_code: int | None = None):
        super().__init__(message)
        self.url = url
        self.status_code = status_code
