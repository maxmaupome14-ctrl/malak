"""
Copywriter Agent — Optimization Engine

The Copywriter is the wordsmith of Malak. It:
1. Takes the Auditor's analysis and product data
2. Generates SEO-optimized product copy via LLM
3. Creates multiple variants for A/B testing
4. Respects platform-specific character limits

Input:
    - product (dict): Current product data from Scout
    - audit_data (dict, optional): Output from Auditor agent
    - platform (str): Target platform (amazon, shopify, walmart, mercadolibre)

Output:
    - title (dict): Optimized title with variants
    - bullets (dict): Optimized bullet points with variants
    - description (dict): Optimized description with variants
    - backend_keywords (list[str]): Suggested backend/hidden keywords
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

# Platform-specific constraints
PLATFORM_LIMITS = {
    "amazon": {
        "title_max": 200,
        "bullet_count": 5,
        "bullet_max": 500,
        "description_max": 2000,
        "backend_keywords_max": 250,
    },
    "shopify": {
        "title_max": 255,
        "bullet_count": 6,
        "bullet_max": 1000,
        "description_max": 5000,
        "backend_keywords_max": 0,  # Shopify uses tags
    },
    "walmart": {
        "title_max": 75,
        "bullet_count": 5,
        "bullet_max": 1000,
        "description_max": 4000,
        "backend_keywords_max": 0,
    },
    "mercadolibre": {
        "title_max": 60,
        "bullet_count": 0,  # ML uses attributes, not bullets
        "bullet_max": 0,
        "description_max": 50000,
        "backend_keywords_max": 0,
    },
}

COPYWRITER_SYSTEM = """You are Malak AI's Copywriter — an expert ecommerce copywriting agent.

You generate SEO-optimized product copy that SELLS. Your copy must:
- Lead with the primary benefit, not the feature
- Integrate target keywords naturally (no stuffing)
- Use power words that drive action
- Respect platform character limits strictly
- Be scannable (short sentences, clear structure)
- Include social proof signals where possible

Respond in JSON format:
{
    "title": {
        "optimized": "The best optimized title",
        "variants": ["Variant A", "Variant B"]
    },
    "bullets": {
        "optimized": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"],
        "variants": [["Alt set 1..."], ["Alt set 2..."]]
    },
    "description": {
        "optimized": "Full optimized description...",
        "variants": ["Variant A description...", "Variant B description..."]
    },
    "backend_keywords": ["keyword1", "keyword2", "keyword3"],
    "seo_notes": ["Note about keyword strategy", "Note about optimization"]
}"""


class CopywriterAgent(BaseAgent):
    """Generates SEO-optimized product copy based on audit insights."""

    @property
    def name(self) -> str:
        return "copywriter"

    @property
    def description(self) -> str:
        return "Optimization engine — generates SEO-perfect titles, bullets, and descriptions"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Generate optimized product copy using LLM."""
        product = input_data["product"]
        platform = input_data.get("platform", product.get("platform", "amazon"))
        audit_data = input_data.get("audit_data", {})

        limits = PLATFORM_LIMITS.get(platform, PLATFORM_LIMITS["amazon"])

        logger.info(
            "Copywriter: generating copy for '%s' on %s",
            product.get("title", "")[:50],
            platform,
        )

        try:
            result = await complete_json(
                system=COPYWRITER_SYSTEM,
                prompt=(
                    f"Generate optimized copy for this {platform} product listing.\n\n"
                    f"CURRENT LISTING:\n"
                    f"Title: {product.get('title', 'N/A')}\n"
                    f"Brand: {product.get('brand', 'N/A')}\n"
                    f"Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n"
                    f"Category: {product.get('category', 'N/A')}\n\n"
                    f"Current bullets:\n"
                    + "\n".join(f"  - {b}" for b in product.get("bullet_points", [])[:10])
                    + "\n\n"
                    f"Current description: {product.get('description', 'N/A')[:500]}\n\n"
                    f"PLATFORM LIMITS:\n"
                    f"  Title max: {limits['title_max']} chars\n"
                    f"  Bullet count: {limits['bullet_count']}\n"
                    f"  Bullet max: {limits['bullet_max']} chars each\n"
                    f"  Description max: {limits['description_max']} chars\n\n"
                    f"AUDIT INSIGHTS:\n"
                    f"  Overall score: {audit_data.get('overall_score', 'N/A')}/100\n"
                    f"  Weaknesses: {audit_data.get('weaknesses', [])}\n"
                    f"  Recommendations: {[r.get('title', '') for r in audit_data.get('recommendations', [])]}\n\n"
                    f"Generate optimized copy that addresses the weaknesses and follows "
                    f"the recommendations. Create 2 title variants and 1 bullet variant set."
                ),
            )

            logger.info("Copywriter: copy generated for %s", platform)

            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.COMPLETED,
                data={
                    "title": result.get("title", {}),
                    "bullets": result.get("bullets", {}),
                    "description": result.get("description", {}),
                    "backend_keywords": result.get("backend_keywords", []),
                    "seo_notes": result.get("seo_notes", []),
                    "platform": platform,
                    "limits_used": limits,
                },
            )

        except Exception as e:
            logger.error("Copywriter: LLM generation failed: %s", e)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Copy generation failed: {e}"],
            )
