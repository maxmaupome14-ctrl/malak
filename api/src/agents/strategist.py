"""
Strategist Agent — Action Planner

The Strategist is the brain of Malak. It:
1. Synthesizes outputs from Auditor and Spy
2. Generates concrete, prioritized action plans via LLM
3. Separates quick wins from strategic moves
4. Estimates impact and effort for each action

Input:
    - audit_result (dict): Output from Auditor agent
    - competitive_intel (dict, optional): Output from Spy agent
    - product (dict): Current product data

Output:
    - summary (str): Executive strategy summary
    - action_plan (list[dict]): All actions prioritized
    - quick_wins (list[dict]): Actions achievable in < 1 hour
    - strategic_moves (list[dict]): Longer-term recommendations
    - estimated_impact (dict): Projected score improvement
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

STRATEGIST_SYSTEM = """You are Malak AI's Strategist — an expert ecommerce marketing strategist.

Given audit results and competitive intelligence, create a concrete action plan.

RULES:
- Every action must be SPECIFIC and ACTIONABLE (not "improve SEO" but "add 'wireless bluetooth' to title")
- Quick wins are things that take < 1 hour to implement
- Strategic moves are things that take days/weeks but have higher long-term impact
- Priority = (impact * 10 - effort * 3) — higher is better
- Be realistic about impact estimates

Respond in JSON format:
{
    "summary": "Executive strategy summary in 2-3 sentences",
    "quick_wins": [
        {
            "action": "Specific thing to do",
            "why": "Why this matters",
            "impact": "high|medium|low",
            "time_estimate": "15 minutes",
            "expected_result": "What will improve"
        }
    ],
    "strategic_moves": [
        {
            "action": "Bigger strategic initiative",
            "why": "Why this matters long-term",
            "impact": "high|medium|low",
            "time_estimate": "1-2 weeks",
            "expected_result": "What will improve"
        }
    ],
    "weekly_plan": {
        "week_1": ["Action 1", "Action 2"],
        "week_2": ["Action 3", "Action 4"],
        "week_3": ["Action 5"]
    },
    "estimated_score_improvement": {
        "current": 0,
        "projected": 0,
        "improvement_percent": 0
    }
}"""


class StrategistAgent(BaseAgent):
    """Synthesizes intelligence into concrete, prioritized action plans."""

    @property
    def name(self) -> str:
        return "strategist"

    @property
    def description(self) -> str:
        return "Action planner — generates prioritized recommendations with ROI estimates"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "audit_result" not in input_data:
            errors.append("'audit_result' is required (output from Auditor agent)")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Generate strategic action plan from audit and competitive data."""
        audit_result = input_data["audit_result"]
        competitive_intel = input_data.get("competitive_intel", {})
        product = input_data.get("product", {})

        logger.info(
            "Strategist: creating action plan (audit score: %s/100)",
            audit_result.get("overall_score", "N/A"),
        )

        # Build competitive context
        comp_text = "No competitive data available."
        if competitive_intel:
            comp_text = (
                f"Competitive Summary: {competitive_intel.get('competitive_summary', 'N/A')}\n"
                f"Threat Level: {competitive_intel.get('threat_level', 'N/A')}\n"
                f"Strengths vs Market: {competitive_intel.get('strengths_vs_market', [])}\n"
                f"Weaknesses vs Market: {competitive_intel.get('weaknesses_vs_market', [])}\n"
                f"Opportunities: {competitive_intel.get('opportunities', [])}"
            )

        try:
            strategy = await complete_json(
                system=STRATEGIST_SYSTEM,
                prompt=(
                    f"Create an action plan for this product:\n\n"
                    f"PRODUCT: {product.get('title', 'N/A')}\n"
                    f"Platform: {product.get('platform', 'N/A')}\n"
                    f"Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n\n"
                    f"AUDIT RESULTS:\n"
                    f"  Overall Score: {audit_result.get('overall_score', 0)}/100\n"
                    f"  Dimension Scores: {audit_result.get('dimension_scores', {})}\n"
                    f"  Strengths: {audit_result.get('strengths', [])}\n"
                    f"  Weaknesses: {audit_result.get('weaknesses', [])}\n"
                    f"  Recommendations: {[r.get('title', '') for r in audit_result.get('recommendations', [])]}\n\n"
                    f"COMPETITIVE INTELLIGENCE:\n{comp_text}\n\n"
                    f"Generate a prioritized action plan with quick wins and strategic moves."
                ),
            )

            # Set current score for projected improvement
            if "estimated_score_improvement" in strategy:
                strategy["estimated_score_improvement"]["current"] = audit_result.get("overall_score", 0)

            logger.info(
                "Strategist: plan complete — %d quick wins, %d strategic moves",
                len(strategy.get("quick_wins", [])),
                len(strategy.get("strategic_moves", [])),
            )

            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.COMPLETED,
                data=strategy,
            )

        except Exception as e:
            logger.error("Strategist: LLM planning failed: %s", e)
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[f"Strategy generation failed: {e}"],
            )
