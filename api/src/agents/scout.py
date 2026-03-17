"""
Scout Agent — Universal Scraper

The Scout is the eyes of Malak. Given any product URL, it:
1. Detects the platform (Amazon, Shopify, Walmart, MercadoLibre, etc.)
2. Routes to the appropriate scraper
3. Extracts structured product data
4. Returns normalized data in a unified schema

Input:
    - url (str): Product URL to scrape

Output:
    - product (dict): Normalized product data (ScrapedProduct as dict)
    - platform (str): Detected platform name
"""

import logging
from dataclasses import asdict
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.scrapers import ScrapingError, detect_scraper

logger = logging.getLogger(__name__)


class ScoutAgent(BaseAgent):
    """Scrapes and extracts structured product data from any ecommerce URL."""

    @property
    def name(self) -> str:
        return "scout"

    @property
    def description(self) -> str:
        return "Universal scraper — extracts structured product data from any ecommerce platform"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "url" not in input_data:
            errors.append("'url' is required")
        elif not isinstance(input_data["url"], str):
            errors.append("'url' must be a string")
        elif not input_data["url"].startswith(("http://", "https://")):
            errors.append("'url' must be a valid HTTP(S) URL")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """
        Scrape a product URL and return structured data.

        Pipeline:
        1. Detect platform from URL → select scraper
        2. Execute scraper → get ScrapedProduct
        3. Convert to dict → return as AgentResult
        """
        url = input_data["url"]

        # 1. Find the right scraper
        scraper = detect_scraper(url)
        if not scraper:
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[
                    f"Unsupported platform. No scraper available for: {url}. "
                    f"Supported: Amazon, Shopify, Walmart, MercadoLibre."
                ],
            )

        logger.info(
            "Scout: scraping %s with %s scraper",
            url[:80],
            scraper.platform_name,
        )

        # 2. Scrape the product
        try:
            product = await scraper.scrape(url)
        except ScrapingError as e:
            logger.warning("Scout: scraping failed for %s: %s", url[:80], e)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Scraping failed: {e}"],
            )
        except Exception as e:
            logger.error("Scout: unexpected error scraping %s: %s", url[:80], e, exc_info=True)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Unexpected error: {e}"],
            )

        # 3. Return structured result
        product_dict = asdict(product)

        logger.info(
            "Scout: successfully scraped %s — title='%s', price=%s",
            scraper.platform_name,
            product.title[:50] if product.title else "(no title)",
            product.price,
        )

        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "url": url,
                "platform": product.platform,
                "product": product_dict,
            },
        )
