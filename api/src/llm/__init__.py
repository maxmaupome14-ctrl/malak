"""
LLM client abstraction for Malak agents.

Supports OpenAI, Anthropic, and any OpenAI-compatible endpoint (Ollama, vLLM, LiteLLM).
The user provides their own API key — we never hardcode ours.
"""

from src.llm.client import complete, complete_json

__all__ = ["complete", "complete_json"]
