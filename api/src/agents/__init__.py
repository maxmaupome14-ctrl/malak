"""
Malak AI Agents — specialized AI workers for ecommerce intelligence.

Each agent has a single responsibility and communicates through
structured data. The orchestrator coordinates their work.

Agents:
    - Scout: Universal scraper — extracts product data from any platform
    - Auditor: Listing analyzer — scores and evaluates product pages
    - Spy: Competitive intel — monitors competitors and market shifts
    - Strategist: Action planner — generates prioritized recommendations
    - Copywriter: Optimization engine — writes SEO-optimized copy
    - Sentinel: 24/7 monitor — watches for changes and triggers alerts
    - Logistics: Fulfillment optimizer — shipping, delivery, FBA/FBM analysis
"""

from src.agents.base import BaseAgent
from src.agents.scout import ScoutAgent
from src.agents.auditor import AuditorAgent
from src.agents.spy import SpyAgent
from src.agents.strategist import StrategistAgent
from src.agents.copywriter import CopywriterAgent
from src.agents.sentinel import SentinelAgent
from src.agents.logistics import LogisticsAgent

__all__ = [
    "BaseAgent",
    "ScoutAgent",
    "AuditorAgent",
    "SpyAgent",
    "StrategistAgent",
    "CopywriterAgent",
    "SentinelAgent",
    "LogisticsAgent",
]
