"""
Logistics Agent — Fulfillment Optimizer

The Logistics agent analyzes fulfillment and shipping data from public listings.
ALL data comes from scraping — zero paid APIs, zero cost to us.

What it analyzes from scraped data:
    1. Fulfillment type detection (FBA, FBM, WFS, self-fulfilled)
    2. Shipping cost competitiveness vs competitors
    3. Delivery speed gap analysis
    4. Return/packaging sentiment from reviews
    5. Multi-channel fulfillment opportunities

Input:
    - product (dict): Normalized product data from Scout (includes shipping info)
    - competitors (list[dict], optional): Competitor fulfillment data from Spy

Output:
    - fulfillment_score (float): 0-100 fulfillment health score
    - fulfillment_type (str): Detected fulfillment method
    - shipping_analysis (dict): Cost and speed analysis
    - recommendations (list[dict]): Prioritized fulfillment improvements
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

LOGISTICS_SYSTEM = """You are Malak AI's Logistics Agent — an expert ecommerce fulfillment strategist.

Given product listing data and optionally competitor data, analyze the fulfillment and shipping strategy.
Focus on actionable insights the seller can implement to improve conversion and delivery experience.

SIGNALS TO LOOK FOR:
- "Ships from Amazon" / Prime badge → FBA
- "Ships from [seller name]" → FBM
- "Shipped by Walmart" / WFS badge → Walmart Fulfilled
- Free shipping threshold vs competitors
- Delivery estimate (1-day vs 5-7 day)
- Return policy signals in reviews ("damaged", "late", "packaging")

Respond in JSON format:
{
    "fulfillment_score": 0-100,
    "fulfillment_type": {
        "detected": "fba|fbm|wfs|3pl|self_fulfilled|shopify_shipping|unknown",
        "confidence": "high|medium|low",
        "signals": ["Signal that led to this detection"]
    },
    "shipping_analysis": {
        "free_shipping": true/false,
        "estimated_delivery_days": null or number,
        "shipping_cost_assessment": "free|competitive|expensive|unknown",
        "prime_or_equivalent": true/false
    },
    "competitive_position": {
        "vs_competitors": "faster|same|slower|unknown",
        "delivery_gap_days": null or number,
        "price_gap": "cheaper|same|more_expensive|unknown"
    },
    "recommendations": [
        {
            "action": "Specific fulfillment action",
            "why": "Why this matters for conversion",
            "impact": "high|medium|low",
            "effort": "easy|medium|hard",
            "expected_result": "What will improve"
        }
    ],
    "estimated_conversion_lift": "X-Y% estimated improvement from implementing recommendations"
}"""


class LogisticsAgent(BaseAgent):
    """Analyzes fulfillment strategy and shipping competitiveness from public listing data."""

    @property
    def name(self) -> str:
        return "logistics"

    @property
    def description(self) -> str:
        return "Fulfillment optimizer — analyzes shipping, delivery, and logistics from public data"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required (output from Scout agent)")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Analyze fulfillment and shipping competitiveness via LLM."""
        product = input_data["product"]
        competitors = input_data.get("competitors", [])
        platform = product.get("platform", "unknown")

        logger.info(
            "Logistics: analyzing fulfillment for '%s' on %s",
            product.get("title", "")[:50],
            platform,
        )

        # Build competitor shipping context
        comp_text = "No competitor fulfillment data available."
        if competitors:
            comp_lines = []
            for i, comp in enumerate(competitors[:10], 1):
                raw = comp.get("raw_data", {})
                comp_lines.append(
                    f"  {i}. {comp.get('title', 'N/A')[:60]}\n"
                    f"     Price: {comp.get('currency', 'USD')} {comp.get('price', 'N/A')}\n"
                    f"     Fulfillment signals: {raw.get('fulfillment_type', 'unknown')}\n"
                    f"     Free shipping: {raw.get('free_shipping', 'unknown')}\n"
                    f"     Delivery estimate: {raw.get('delivery_estimate', 'unknown')}"
                )
            comp_text = "COMPETITOR FULFILLMENT DATA:\n" + "\n".join(comp_lines)

        # Extract shipping signals from raw_data
        raw = product.get("raw_data", {})
        shipping_signals = {
            "fulfillment_type": raw.get("fulfillment_type", "unknown"),
            "free_shipping": raw.get("free_shipping"),
            "delivery_estimate": raw.get("delivery_estimate"),
            "prime_badge": raw.get("prime", raw.get("is_prime")),
            "seller_name": raw.get("seller", raw.get("seller_name", raw.get("vendor"))),
            "return_policy": raw.get("return_policy"),
        }

        try:
            analysis = await complete_json(
                system=LOGISTICS_SYSTEM,
                prompt=(
                    f"Analyze the fulfillment strategy for this {platform} product:\n\n"
                    f"PRODUCT:\n"
                    f"  Title: {product.get('title', 'N/A')}\n"
                    f"  Platform: {platform}\n"
                    f"  Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n"
                    f"  In Stock: {product.get('in_stock', 'unknown')}\n"
                    f"  Rating: {product.get('rating', 'N/A')}/5 ({product.get('review_count', 0)} reviews)\n\n"
                    f"SHIPPING SIGNALS FROM LISTING:\n"
                    f"  Fulfillment type: {shipping_signals['fulfillment_type']}\n"
                    f"  Free shipping: {shipping_signals['free_shipping']}\n"
                    f"  Delivery estimate: {shipping_signals['delivery_estimate']}\n"
                    f"  Prime/equivalent badge: {shipping_signals['prime_badge']}\n"
                    f"  Seller: {shipping_signals['seller_name']}\n"
                    f"  Return policy: {shipping_signals['return_policy']}\n\n"
                    f"{comp_text}\n\n"
                    f"Provide a fulfillment analysis with actionable recommendations."
                ),
            )

            logger.info(
                "Logistics: analysis complete — score=%s, type=%s",
                analysis.get("fulfillment_score", "N/A"),
                analysis.get("fulfillment_type", {}).get("detected", "unknown"),
            )

            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.COMPLETED,
                data=analysis,
            )

        except Exception as e:
            logger.error("Logistics: LLM analysis failed: %s", e)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Logistics analysis failed: {e}"],
            )
