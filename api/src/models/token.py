"""
Token models — Kansa's virtual currency for Fixit actions.

TokenWallet: one per user, tracks current balance + lifetime stats.
TokenTransaction: every purchase and spend is recorded.

Tokens are like arcade tokens — buy in packs, spend on fixes.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class TransactionType(str, PyEnum):
    """Type of token transaction."""
    PURCHASE = "purchase"       # Bought tokens (Stripe)
    BONUS = "bonus"             # Free tokens (signup bonus, promo)
    FIX = "fix"                 # Spent tokens on a Fixit action
    REFUND = "refund"           # Refunded tokens (failed fix)


class TokenWallet(Base):
    """
    A user's token wallet — tracks balance and lifetime stats.
    One wallet per user. Created on account creation.
    """

    __tablename__ = "token_wallets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True
    )

    # Current balance
    balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Lifetime stats
    total_purchased: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_spent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_bonus: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<TokenWallet user={self.user_id} balance={self.balance}>"


class TokenTransaction(Base):
    """
    A single token transaction — purchase, spend, bonus, or refund.
    Immutable ledger — never update, only append.
    """

    __tablename__ = "token_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("token_wallets.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    # Transaction details
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    # Positive for purchase/bonus/refund, negative for fix

    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)

    # Context
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # e.g., "Purchased Starter Pack (30 tokens)" or "Fixed title for ASIN B0..."

    # For purchases: Stripe payment reference
    stripe_payment_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # For fixes: audit and category reference
    audit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_results.id"), nullable=True
    )
    fix_category: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<TokenTransaction {self.type.value} amount={self.amount}>"
