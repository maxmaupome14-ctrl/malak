"""
Spy Agent — Competitive Intelligence

The Spy is the intelligence officer of Malak. Given a product, it:
1. Uses LLM to analyze competitive positioning
2. Compares against provided competitor data (from Scout batch scrapes)
3. Generates market insights and threat assessment

For MVP: Takes the user's product data and any competitor data already
scraped, then uses LLM to generate a competitive analysis.

Future: Will auto-discover competitors by searching the marketplace
and batch-scraping the top results via Scout.

Input:
    - product (dict): The user's product data
    - competitors (list[dict], optional): Pre-scraped competitor data
    - platform (str): Target platform

Output:
    - competitive_summary (str): Executive summary
    - price_position (dict): Where user's price sits vs market
    - strengths_vs_market (list[str]): Advantages over competitors
    - weaknesses_vs_market (list[str]): Gaps vs competitors
    - opportunities (list[str]): Market opportunities identified
    - threat_level (str): low | medium | high
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

SPY_SYSTEM = """You are Malak AI's Spy — an expert ecommerce competitive intelligence analyst.

Given a product listing and optionally competitor data, analyze the competitive landscape.
Focus on actionable insights the seller can use to improve their market position.

Respond in JSON format:
{
    "competitive_summary": "2-3 sentence executive summary of competitive position",
    "price_position": {
        "assessment": "underpriced|competitive|overpriced",
        "reasoning": "Why this assessment"
    },
    "strengths_vs_market": ["Advantage 1", "Advantage 2"],
    "weaknesses_vs_market": ["Gap 1", "Gap 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"],
    "threats": ["Threat 1", "Threat 2"],
    "threat_level": "low|medium|high",
    "recommended_actions": [
        {"action": "What to do", "impact": "high|medium|low", "timeframe": "immediate|short_term|long_term"}
    ]
}"""


class SpyAgent(BaseAgent):
    """Analyzes competitive landscape and generates market intelligence."""

    @property
    def name(self) -> str:
        return "spy"

    @property
    def description(self) -> str:
        return "Competitive intel — tracks competitors, pricing, and market shifts"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Analyze competitive landscape using LLM."""
        product = input_data["product"]
        competitors = input_data.get("competitors", [])
        platform = input_data.get("platform", product.get("platform", "unknown"))

        logger.info(
            "Spy: analyzing competition for '%s' (%d competitors provided)",
            product.get("title", "")[:50],
            len(competitors),
        )

        # Build competitor context
        comp_text = "No competitor data available — analyze based on product category and pricing signals."
        if competitors:
            comp_lines = []
            for i, comp in enumerate(competitors[:10], 1):
                comp_lines.append(
                    f"  {i}. {comp.get('title', 'N/A')[:80]}\n"
                    f"     Price: {comp.get('currency', 'USD')} {comp.get('price', 'N/A')}\n"
                    f"     Rating: {comp.get('rating', 'N/A')}/5 ({comp.get('review_count', 0)} reviews)\n"
                    f"     Images: {len(comp.get('images', []))}"
                )
            comp_text = "COMPETITORS:\n" + "\n".join(comp_lines)

        try:
            analysis = await complete_json(
                system=SPY_SYSTEM,
                prompt=(
                    f"Analyze the competitive landscape for this {platform} product:\n\n"
                    f"USER'S PRODUCT:\n"
                    f"  Title: {product.get('title', 'N/A')}\n"
                    f"  Brand: {product.get('brand', 'N/A')}\n"
                    f"  Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n"
                    f"  Rating: {product.get('rating', 'N/A')}/5 ({product.get('review_count', 0)} reviews)\n"
                    f"  Images: {len(product.get('images', []))}\n"
                    f"  Category: {product.get('category', 'N/A')}\n\n"
                    f"{comp_text}"
                ),
            )

            logger.info(
                "Spy: analysis complete — threat_level=%s",
                analysis.get("threat_level", "unknown"),
            )

            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.COMPLETED,
                data=analysis,
            )

        except Exception as e:
            logger.error("Spy: LLM analysis failed: %s", e)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Competitive analysis failed: {e}"],
            )
