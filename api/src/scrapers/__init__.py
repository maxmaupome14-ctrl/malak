"""
Malak Scrapers — platform-specific data extraction.

Each scraper knows how to extract structured product data
from a specific ecommerce platform. The Scout agent
routes URLs to the appropriate scraper.

Scrapers:
    - AmazonScraper: Amazon product pages
    - ShopifyScraper: Shopify storefronts
    - WalmartScraper: Walmart product pages
    - MercadoLibreScraper: MercadoLibre product pages
"""

from src.scrapers.base import BaseScraper
from src.scrapers.amazon import AmazonScraper
from src.scrapers.shopify import ShopifyScraper
from src.scrapers.walmart import WalmartScraper
from src.scrapers.mercadolibre import MercadoLibreScraper

__all__ = [
    "BaseScraper",
    "AmazonScraper",
    "ShopifyScraper",
    "WalmartScraper",
    "MercadoLibreScraper",
]
