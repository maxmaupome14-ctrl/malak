"""
Sentinel Agent — 24/7 Monitor

The Sentinel is the watchdog of Malak. It:
1. Continuously monitors tracked products and competitors
2. Detects changes (price, listing, reviews, ranking)
3. Evaluates the significance of each change
4. Triggers alerts when action is needed

Input:
    - store_id (UUID): Store to monitor
    - product_ids (list[UUID], optional): Specific products to check
    - check_type (str): "full" | "price" | "reviews" | "ranking"

Output:
    - changes (list[dict]): Detected changes with significance scores
    - alerts (list[dict]): Triggered alerts (high-significance changes)
    - summary (str): Human-readable summary of monitoring results
"""

from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent


class SentinelAgent(BaseAgent):
    """Monitors markets 24/7 and triggers alerts when action is needed."""

    @property
    def name(self) -> str:
        return "sentinel"

    @property
    def description(self) -> str:
        return "24/7 monitor — watches for market changes and triggers alerts"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "store_id" not in input_data:
            errors.append("'store_id' is required")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """
        Run a monitoring check for tracked products.

        TODO: Implement the full monitoring pipeline:
        1. Load tracked products from database
        2. Re-scrape each product via Scout agent
        3. Compare with last known state (diff detection)
        4. For each change:
           a. Classify type (price, title, image, review, ranking)
           b. Calculate significance (how much did it change?)
           c. Determine if alert threshold is met
        5. Store new state in database
        6. Generate alerts for significant changes
        7. Send notifications (email, webhook, in-app)
        8. Return summary
        """
        # TODO: Load tracked products
        # products = await load_tracked_products(store_id, product_ids)

        # TODO: Re-scrape and compare
        # changes = []
        # for product in products:
        #     current = await scout.run(context, {"url": product.url})
        #     diff = compute_diff(product.last_state, current.data)
        #     if diff:
        #         changes.append(evaluate_change(diff, product))

        # TODO: Alert generation
        # alerts = [c for c in changes if c["significance"] >= alert_threshold]

        # TODO: Notification dispatch
        # await dispatch_notifications(alerts, user_preferences)

        # Stub response
        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "changes": [],
                "alerts": [],
                "summary": "No monitoring data available yet",
                "message": "Sentinel agent is not yet implemented",
            },
        )
