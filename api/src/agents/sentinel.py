"""
Sentinel Agent — 24/7 Monitor

The Sentinel is the watchdog of Malak. It:
1. Re-scrapes tracked products via Scout
2. Compares current state with last known state
3. Detects changes (price, title, reviews, stock, new competitors)
4. Calculates significance and triggers alerts

Input:
    - products (list[dict]): Products to check (with their previous state)
    - check_type (str): "full" | "price_only" | "reviews_only"

Output:
    - changes (list[dict]): Detected changes with significance
    - alerts (list[dict]): High-significance changes that need action
    - summary (str): Human-readable monitoring summary
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.agents.scout import ScoutAgent

logger = logging.getLogger(__name__)


def detect_changes(previous: dict, current: dict) -> list[dict]:
    """Compare two product states and return a list of changes."""
    changes = []

    # Price change
    old_price = previous.get("price")
    new_price = current.get("price")
    if old_price and new_price and old_price != new_price:
        pct_change = round((new_price - old_price) / old_price * 100, 1)
        changes.append({
            "type": "price",
            "field": "price",
            "old_value": old_price,
            "new_value": new_price,
            "change_percent": pct_change,
            "significance": "high" if abs(pct_change) >= 10 else "medium" if abs(pct_change) >= 5 else "low",
            "description": f"Price {'increased' if pct_change > 0 else 'decreased'} by {abs(pct_change)}%"
        })

    # Rating change
    old_rating = previous.get("rating")
    new_rating = current.get("rating")
    if old_rating and new_rating and old_rating != new_rating:
        changes.append({
            "type": "reviews",
            "field": "rating",
            "old_value": old_rating,
            "new_value": new_rating,
            "significance": "high" if abs(new_rating - old_rating) >= 0.5 else "medium",
            "description": f"Rating changed from {old_rating} to {new_rating}"
        })

    # Review count change
    old_reviews = previous.get("review_count", 0)
    new_reviews = current.get("review_count", 0)
    if new_reviews != old_reviews:
        diff = new_reviews - old_reviews
        changes.append({
            "type": "reviews",
            "field": "review_count",
            "old_value": old_reviews,
            "new_value": new_reviews,
            "significance": "low",
            "description": f"{'Gained' if diff > 0 else 'Lost'} {abs(diff)} reviews"
        })

    # Stock change
    old_stock = previous.get("in_stock", True)
    new_stock = current.get("in_stock", True)
    if old_stock != new_stock:
        changes.append({
            "type": "stock",
            "field": "in_stock",
            "old_value": old_stock,
            "new_value": new_stock,
            "significance": "high",
            "description": "Product went OUT OF STOCK" if not new_stock else "Product is back IN STOCK"
        })

    # Title change
    old_title = previous.get("title", "")
    new_title = current.get("title", "")
    if old_title and new_title and old_title != new_title:
        changes.append({
            "type": "listing",
            "field": "title",
            "old_value": old_title[:100],
            "new_value": new_title[:100],
            "significance": "medium",
            "description": "Product title was changed"
        })

    # Image count change
    old_images = len(previous.get("images", []))
    new_images = len(current.get("images", []))
    if old_images != new_images:
        changes.append({
            "type": "listing",
            "field": "image_count",
            "old_value": old_images,
            "new_value": new_images,
            "significance": "low",
            "description": f"Image count changed from {old_images} to {new_images}"
        })

    return changes


class SentinelAgent(BaseAgent):
    """Monitors products 24/7 and detects market changes."""

    @property
    def name(self) -> str:
        return "sentinel"

    @property
    def description(self) -> str:
        return "24/7 monitor — watches for market changes and triggers alerts"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "products" not in input_data:
            errors.append("'products' list is required (each with 'url' and 'previous_state')")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Run monitoring check on tracked products."""
        products = input_data["products"]
        scout = ScoutAgent()

        all_changes: list[dict] = []
        alerts: list[dict] = []
        checked = 0
        errors_count = 0

        for product_info in products:
            url = product_info.get("url", "")
            previous_state = product_info.get("previous_state", {})

            if not url:
                continue

            # Re-scrape via Scout
            scout_result = await scout.run(context, {"url": url})
            if not scout_result.success:
                errors_count += 1
                logger.warning("Sentinel: failed to re-scrape %s", url[:60])
                continue

            current_state = scout_result.data.get("product", {})
            changes = detect_changes(previous_state, current_state)

            for change in changes:
                change["url"] = url
                change["product_title"] = current_state.get("title", "Unknown")[:80]
                all_changes.append(change)

                if change["significance"] == "high":
                    alerts.append(change)

            checked += 1

        # Generate summary
        if not all_changes:
            summary = f"Checked {checked} products — no changes detected."
        else:
            summary = (
                f"Checked {checked} products. "
                f"Found {len(all_changes)} changes ({len(alerts)} alerts). "
                f"{errors_count} products failed to scrape."
            )

        logger.info("Sentinel: %s", summary)

        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "changes": all_changes,
                "alerts": alerts,
                "summary": summary,
                "products_checked": checked,
                "errors": errors_count,
            },
        )
