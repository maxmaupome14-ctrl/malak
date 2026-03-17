"""
Base agent interface that all Malak agents must implement.

Every agent follows the same lifecycle:
    1. Receive structured input
    2. Process (scrape, analyze, generate, etc.)
    3. Return structured output

Agents are stateless — all state lives in the database.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class AgentStatus(str, Enum):
    """Status of an agent execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class AgentContext:
    """
    Shared context passed to every agent execution.

    Contains everything an agent needs to do its job without
    reaching into global state.
    """

    user_id: UUID
    job_id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResult:
    """
    Standardized result from any agent execution.
    """

    agent_name: str
    status: AgentStatus
    data: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    duration_ms: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def success(self) -> bool:
        return self.status == AgentStatus.COMPLETED


class BaseAgent(ABC):
    """
    Abstract base class for all Malak agents.

    Subclasses must implement:
        - name: Agent identifier
        - description: Human-readable description
        - execute(): Core logic
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for this agent (e.g., 'scout', 'auditor')."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what this agent does."""
        ...

    @abstractmethod
    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """
        Execute the agent's core logic.

        Args:
            context: Shared execution context (user, job ID, etc.)
            input_data: Agent-specific input parameters.

        Returns:
            AgentResult with the output data or errors.
        """
        ...

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        """
        Validate input data before execution. Override in subclasses.

        Returns:
            List of validation error messages. Empty list = valid.
        """
        return []

    async def run(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """
        Full execution pipeline: validate → execute → return result.

        This is the method callers should use. Do not override.
        """
        import time

        start = time.monotonic()

        # Validate input
        errors = await self.validate_input(input_data)
        if errors:
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=errors,
            )

        # Execute
        try:
            result = await self.execute(context, input_data)
            result.duration_ms = int((time.monotonic() - start) * 1000)
            return result
        except Exception as e:
            return AgentResult(
                agent_name=self.name,
                status=AgentStatus.FAILED,
                errors=[str(e)],
                duration_ms=int((time.monotonic() - start) * 1000),
            )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} name={self.name!r}>"
