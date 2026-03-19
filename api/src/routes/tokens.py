"""
Token routes — wallet balance, token purchases, and Fixit actions.

Fixit flow:
1. User sees audit with issues + fix costs
2. User clicks "Fix" → POST /tokens/fix
3. We deduct tokens, run AI fix, return before/after
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.token import TokenWallet, TokenTransaction, TransactionType

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Token Packs ────────────────────────────────────────

TOKEN_PACKS = {
    "starter": {"name": "Starter", "tokens": 30, "price_cents": 900},
    "pro": {"name": "Pro", "tokens": 120, "price_cents": 2900},
    "beast": {"name": "Beast", "tokens": 500, "price_cents": 9900},
    "agency": {"name": "Agency", "tokens": 2000, "price_cents": 29900},
}

SIGNUP_BONUS = 10  # Free tokens on account creation


# ── Schemas ────────────────────────────────────────────

class WalletResponse(BaseModel):
    balance: int
    total_purchased: int
    total_spent: int
    total_bonus: int

    model_config = {"from_attributes": True}


class TokenPackResponse(BaseModel):
    id: str
    name: str
    tokens: int
    price_cents: int
    price_display: str


class TransactionResponse(BaseModel):
    id: uuid.UUID
    type: str
    amount: int
    balance_after: int
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseRequest(BaseModel):
    pack_id: str


class FixRequest(BaseModel):
    audit_id: uuid.UUID
    category: str  # title, bullets, description, images, keywords, competitive


class FixResponse(BaseModel):
    success: bool
    tokens_spent: int
    balance_remaining: int
    fix_result: dict  # before/after content


# ── Helpers ────────────────────────────────────────────

async def get_or_create_wallet(
    session: AsyncSession, user: User
) -> TokenWallet:
    """Get the user's wallet, creating it with signup bonus if needed."""
    result = await session.execute(
        select(TokenWallet).where(TokenWallet.user_id == user.id)
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        wallet = TokenWallet(
            user_id=user.id,
            balance=SIGNUP_BONUS,
            total_bonus=SIGNUP_BONUS,
        )
        session.add(wallet)
        await session.flush()

        # Record the bonus transaction
        tx = TokenTransaction(
            wallet_id=wallet.id,
            user_id=user.id,
            type=TransactionType.BONUS,
            amount=SIGNUP_BONUS,
            balance_after=SIGNUP_BONUS,
            description=f"Welcome bonus — {SIGNUP_BONUS} free tokens to get started",
        )
        session.add(tx)
        await session.commit()
        await session.refresh(wallet)

    return wallet


# ── Routes ─────────────────────────────────────────────

@router.get("/wallet", response_model=WalletResponse)
async def get_wallet(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> TokenWallet:
    """Get current token balance and stats."""
    return await get_or_create_wallet(session, user)


@router.get("/packs", response_model=list[TokenPackResponse])
async def list_packs() -> list[dict]:
    """List available token packs for purchase."""
    return [
        {
            "id": pack_id,
            "name": pack["name"],
            "tokens": pack["tokens"],
            "price_cents": pack["price_cents"],
            "price_display": f"${pack['price_cents'] / 100:.0f}",
        }
        for pack_id, pack in TOKEN_PACKS.items()
    ]


@router.get("/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    limit: int = 50,
) -> list[TokenTransaction]:
    """List recent token transactions."""
    result = await session.execute(
        select(TokenTransaction)
        .where(TokenTransaction.user_id == user.id)
        .order_by(TokenTransaction.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/purchase")
async def purchase_tokens(
    request: PurchaseRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Purchase a token pack.

    TODO: Wire up Stripe checkout. For now, adds tokens directly
    for development/testing.
    """
    pack = TOKEN_PACKS.get(request.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack ID")

    wallet = await get_or_create_wallet(session, user)

    # TODO: Create Stripe checkout session and verify payment
    # For now, add tokens directly (dev mode)

    wallet.balance += pack["tokens"]
    wallet.total_purchased += pack["tokens"]

    tx = TokenTransaction(
        wallet_id=wallet.id,
        user_id=user.id,
        type=TransactionType.PURCHASE,
        amount=pack["tokens"],
        balance_after=wallet.balance,
        description=f"Purchased {pack['name']} Pack ({pack['tokens']} tokens)",
    )
    session.add(tx)
    await session.commit()

    return {
        "success": True,
        "tokens_added": pack["tokens"],
        "balance": wallet.balance,
    }


@router.post("/fix", response_model=FixResponse)
async def fix_issue(
    request: FixRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Execute a Fixit action — spend tokens to AI-fix a category issue.

    Flow:
    1. Validate audit exists and category is valid
    2. Check token balance
    3. Deduct tokens
    4. Run AI fix (Opus 4.6)
    5. Return before/after
    """
    from src.agents.auditor import FIX_COSTS
    from src.models.audit import AuditResult

    # Validate category
    cost = FIX_COSTS.get(request.category)
    if cost is None:
        raise HTTPException(status_code=400, detail=f"Invalid fix category: {request.category}")

    # Load audit
    result = await session.execute(
        select(AuditResult).where(AuditResult.id == request.audit_id)
    )
    audit = result.scalar_one_or_none()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    # Check balance
    wallet = await get_or_create_wallet(session, user)
    if wallet.balance < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient tokens. Need {cost}, have {wallet.balance}. Purchase more tokens.",
        )

    # Deduct tokens
    wallet.balance -= cost
    wallet.total_spent += cost

    tx = TokenTransaction(
        wallet_id=wallet.id,
        user_id=user.id,
        type=TransactionType.FIX,
        amount=-cost,
        balance_after=wallet.balance,
        description=f"Fixed {request.category} for audit {str(audit.id)[:8]}",
        audit_id=audit.id,
        fix_category=request.category,
    )
    session.add(tx)

    # Run the AI fix
    fix_result = await _run_fix(audit, request.category)

    await session.commit()

    return {
        "success": True,
        "tokens_spent": cost,
        "balance_remaining": wallet.balance,
        "fix_result": fix_result,
    }


async def _run_fix(audit, category: str) -> dict:
    """Run AI fix for a specific category using Opus 4.6."""
    from src.llm import complete_json

    # Get the original content from the audit's generated copy or scraped data
    generated = audit.generated_copy or {}

    prompts = {
        "title": (
            "You are Kansa's title optimizer for Amazon listings.\n"
            "Rewrite this Amazon product title to maximize search visibility and click-through rate.\n"
            "Rules:\n"
            "- Include primary keywords at the beginning\n"
            "- Brand name first if recognizable\n"
            "- 150-200 characters ideal\n"
            "- Include key features, size, color, quantity\n"
            "- No ALL CAPS, use Title Case\n"
            "- No special characters or emojis\n\n"
            "Respond with JSON: {\"original\": \"...\", \"optimized\": \"...\", \"changes\": [\"what changed and why\"]}"
        ),
        "bullets": (
            "You are Kansa's bullet point optimizer for Amazon listings.\n"
            "Rewrite bullet points to maximize conversion.\n"
            "Rules:\n"
            "- 5 bullet points, each 150-200 characters\n"
            "- Start each with a BENEFIT in caps, then feature detail\n"
            "- Include target keywords naturally\n"
            "- Address common customer questions/concerns\n"
            "- Use emotional triggers + specific numbers\n\n"
            "Respond with JSON: {\"original\": [...], \"optimized\": [...], \"changes\": [\"what changed and why\"]}"
        ),
        "description": (
            "You are Kansa's description optimizer for Amazon listings.\n"
            "Rewrite the product description for maximum SEO and conversion.\n"
            "Rules:\n"
            "- 300-500 words\n"
            "- Include primary and secondary keywords\n"
            "- Use short paragraphs, scannable format\n"
            "- Address pain points and benefits\n"
            "- Include a call to action\n\n"
            "Respond with JSON: {\"original\": \"...\", \"optimized\": \"...\", \"changes\": [\"what changed and why\"]}"
        ),
        "images": (
            "You are Kansa's image strategy advisor for Amazon listings.\n"
            "Analyze the current images and recommend a complete image strategy.\n"
            "Rules:\n"
            "- Recommend 7-9 images total\n"
            "- Main image: white background, product fills 85%+ of frame\n"
            "- Include: lifestyle, infographic, scale/size, packaging, comparison\n"
            "- Recommend A+ content image layout\n\n"
            "Respond with JSON: {\"current_count\": N, \"recommendations\": [{\"slot\": 1, \"type\": \"...\", \"description\": \"...\"}], \"priority_actions\": [\"...\"]}"
        ),
        "keywords": (
            "You are Kansa's keyword optimizer for Amazon listings.\n"
            "Generate an optimized keyword strategy.\n"
            "Rules:\n"
            "- 250 bytes max for backend search terms\n"
            "- No brand names, ASINs, or subjective claims\n"
            "- Include misspellings customers might use\n"
            "- Separate with spaces (no commas)\n"
            "- Include Spanish/Portuguese terms for .mx/.br\n\n"
            "Respond with JSON: {\"backend_keywords\": \"...\", \"primary_keywords\": [...], \"secondary_keywords\": [...], \"long_tail\": [...], \"changes\": [\"what was added/removed and why\"]}"
        ),
        "competitive": (
            "You are Kansa's competitive strategist for Amazon listings.\n"
            "Generate a competitive positioning report.\n"
            "Rules:\n"
            "- Analyze the listing's position in its category\n"
            "- Identify pricing strategy recommendations\n"
            "- Suggest differentiation tactics\n"
            "- Include review strategy\n\n"
            "Respond with JSON: {\"position_analysis\": \"...\", \"pricing_strategy\": \"...\", \"differentiation\": [...], \"review_strategy\": \"...\", \"action_items\": [{\"action\": \"...\", \"priority\": \"high|medium|low\", \"expected_impact\": \"...\"}]}"
        ),
    }

    system = prompts.get(category, prompts["title"])

    # Build context from audit data
    issues = (audit.category_issues or {}).get(category, [])
    issue_text = "\n".join(f"- {iss.get('issue', '')}" for iss in issues) if issues else "No specific issues recorded"

    context = (
        f"Product URL: {audit.url}\n"
        f"Overall Score: {audit.overall_score}/100\n"
        f"Category Issues:\n{issue_text}\n\n"
        f"Current generated copy data:\n{str(generated.get(category, 'None'))[:1000]}\n"
    )

    try:
        result = await complete_json(
            system=system,
            prompt=f"Fix the {category} for this listing:\n\n{context}",
        )
        return result
    except Exception as e:
        logger.error("Fix failed for category %s: %s", category, e)
        raise HTTPException(status_code=500, detail=f"AI fix failed: {e}")
