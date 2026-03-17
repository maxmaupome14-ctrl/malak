"""
Malak Scrapers — platform-specific data extraction.

Each scraper knows how to extract structured product data
from a specific ecommerce platform. The Scout agent
routes URLs to the appropriate scraper.

Scrapers:
    - AmazonScraper: Amazon product pages (Patchright + anti-bot)
    - ShopifyScraper: Shopify storefronts (JSON API, no browser)
    - WalmartScraper: Walmart product pages (Patchright + anti-bot)
    - MercadoLibreScraper: MercadoLibre pages (public REST API)
"""

from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError
from src.scrapers.amazon import AmazonScraper
from src.scrapers.shopify import ShopifyScraper
from src.scrapers.walmart import WalmartScraper
from src.scrapers.mercadolibre import MercadoLibreScraper

# Registry of all available scrapers.
# Order matters: more specific matchers first to avoid false positives.
# Amazon/Walmart check exact domains, Shopify uses /products/ heuristic (less specific).
SCRAPERS: list[BaseScraper] = [
    AmazonScraper(),
    WalmartScraper(),
    MercadoLibreScraper(),
    ShopifyScraper(),  # Last because /products/ heuristic is broad
]


def detect_scraper(url: str) -> BaseScraper | None:
    """
    Find the first scraper that can handle this URL.

    Returns None if no scraper matches — caller should handle gracefully.
    """
    for scraper in SCRAPERS:
        if scraper.can_handle(url):
            return scraper
    return None


__all__ = [
    "BaseScraper",
    "ScrapedProduct",
    "ScrapingError",
    "AmazonScraper",
    "ShopifyScraper",
    "WalmartScraper",
    "MercadoLibreScraper",
    "SCRAPERS",
    "detect_scraper",
]
