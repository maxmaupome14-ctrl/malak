"""
Auditor Agent — Amazon Listing Analyzer with Fixit Integration

The Auditor scores a product listing across 6 dimensions, identifies
specific fixable issues per category, and attaches token costs to each
fix action. The audit is FREE — the fix actions cost tokens.

Scoring dimensions (weighted):
    - Title (20%): Length, keyword presence, readability, structure
    - Images (20%): Count, variety, video
    - Pricing (15%): Price display, discount, psychology
    - Reviews (15%): Rating, count, social proof
    - SEO (15%): Keywords, bullets, description density
    - Content (15%): Description quality, bullet detail, brand

Output includes:
    - overall_score, dimension_scores (rule-based)
    - category_issues: per-category issues with fix_action + token_cost
    - strengths, weaknesses (LLM-enhanced)
    - recommendations (LLM-generated, actionable)
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

# Dimension weights for overall score
WEIGHTS = {
    "title": 0.20,
    "images": 0.20,
    "pricing": 0.15,
    "reviews": 0.15,
    "seo": 0.15,
    "content": 0.15,
}

# Token costs per fix action
FIX_COSTS = {
    "title": 5,
    "bullets": 8,
    "description": 8,
    "images": 3,
    "keywords": 5,
    "competitive": 10,
}


def score_title(product: dict) -> tuple[int, list[str], list[str]]:
    """Score title quality. Returns (score, strengths, weaknesses)."""
    title = product.get("title", "")
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    if not title:
        return 0, [], ["No title found"]

    length = len(title)

    # Length scoring (ideal: 80-200 chars for Amazon)
    if 80 <= length <= 200:
        score += 40
        strengths.append(f"Good title length ({length} chars)")
    elif 60 <= length < 80:
        score += 30
        weaknesses.append(f"Title is slightly short ({length} chars) — aim for 80-200 characters")
    elif length > 200:
        score += 20
        weaknesses.append(f"Title is too long ({length} chars) — may get truncated in search")
    elif 40 <= length < 60:
        score += 15
        weaknesses.append(f"Title is short ({length} chars) — missing keywords and details")
    else:
        score += 10
        weaknesses.append(f"Title is very short ({length} chars) — missing keywords and details")

    # Word count
    words = title.split()
    if len(words) >= 8:
        score += 20
    elif len(words) >= 5:
        score += 10
    else:
        weaknesses.append(f"Title has only {len(words)} words — add more descriptive keywords")

    # Brand presence
    brand = product.get("brand", "")
    if brand and brand.lower() in title.lower():
        score += 15
        strengths.append("Brand name is in the title")
    elif brand:
        weaknesses.append(f"Brand '{brand}' not found in title — add it for brand recognition")
    else:
        score += 5

    # Capitalization check
    if title.isupper():
        weaknesses.append("Title is ALL CAPS — use Title Case for better readability")
    else:
        score += 10

    # Special character spam
    special_chars = sum(1 for c in title if c in "!@#$%^&*(){}[]|\\")
    if special_chars <= 2:
        score += 15
    else:
        weaknesses.append("Title has too many special characters — clean it up for SEO")

    return min(score, 100), strengths, weaknesses


def score_images(product: dict) -> tuple[int, list[str], list[str]]:
    """Score image quality."""
    images = product.get("images", [])
    strengths: list[str] = []
    weaknesses: list[str] = []
    count = len(images)

    if count == 0:
        return 0, [], ["No images found — this is critical, add product photos immediately"]

    score = 0

    if count >= 7:
        score += 60
        strengths.append(f"Excellent image count ({count} images)")
    elif count >= 5:
        score += 45
        strengths.append(f"Good image count ({count} images)")
    elif count >= 3:
        score += 30
        weaknesses.append(f"Only {count} images — aim for 7+ to show product from all angles")
    elif count >= 1:
        score += 15
        weaknesses.append(f"Only {count} image(s) — this significantly hurts conversion")

    videos = product.get("video_urls", [])
    if videos:
        score += 20
        strengths.append("Has product video — great for engagement")
    else:
        weaknesses.append("No product video — videos increase conversion by 20-30%")

    score += 20  # Base credit for having images

    return min(score, 100), strengths, weaknesses


def score_pricing(product: dict) -> tuple[int, list[str], list[str]]:
    """Score pricing presentation."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    price = product.get("price")
    original_price = product.get("original_price")
    platform = product.get("platform", "")

    if price is None:
        if platform == "amazon":
            return 50, ["Price is displayed on the live listing"], [
                "Price could not be extracted (Amazon renders via JavaScript) — "
                "score for this dimension is estimated"
            ]
        return 20, [], ["Price not found or not displayed — critical for conversion"]

    score += 40
    strengths.append(f"Price displayed: {product.get('currency', 'USD')} {price}")

    if original_price and original_price > price:
        discount = round((1 - price / original_price) * 100)
        score += 30
        strengths.append(f"Sale price shown ({discount}% off) — creates urgency")
    else:
        score += 10
        weaknesses.append("No comparison/sale price shown — consider showing original price for anchoring")

    price_str = f"{price:.2f}"
    if price_str.endswith(("99", "97", "95")):
        score += 15
        strengths.append("Price uses psychological pricing (charm pricing)")
    else:
        score += 5

    if price == int(price) and price >= 50:
        score += 15
        strengths.append("Round price suggests premium positioning")

    return min(score, 100), strengths, weaknesses


def score_reviews(product: dict) -> tuple[int, list[str], list[str]]:
    """Score review presence and quality."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    rating = product.get("rating")
    count = product.get("review_count", 0)

    if rating is None and count == 0:
        return 30, [], ["No reviews yet — consider launching a review campaign"]

    if rating is not None:
        if rating >= 4.5:
            score += 40
            strengths.append(f"Excellent rating: {rating}/5")
        elif rating >= 4.0:
            score += 30
            strengths.append(f"Good rating: {rating}/5")
        elif rating >= 3.5:
            score += 20
            weaknesses.append(f"Average rating ({rating}/5) — address negative feedback")
        else:
            score += 5
            weaknesses.append(f"Low rating ({rating}/5) — urgent: review product quality")

    if count >= 100:
        score += 40
        strengths.append(f"Strong review count ({count} reviews)")
    elif count >= 50:
        score += 30
        strengths.append(f"Good review count ({count} reviews)")
    elif count >= 10:
        score += 20
        weaknesses.append(f"Only {count} reviews — aim for 50+ for social proof")
    elif count >= 1:
        score += 10
        weaknesses.append(f"Only {count} review(s) — need more social proof")
    else:
        weaknesses.append("Zero reviews — launch a review request campaign")

    if rating and rating >= 4.0 and count >= 50:
        score += 20
        strengths.append("Strong rating + review count combination")

    return min(score, 100), strengths, weaknesses


def score_seo(product: dict) -> tuple[int, list[str], list[str]]:
    """Score SEO signals."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    title = product.get("title", "")
    bullets = product.get("bullet_points", [])
    description = product.get("description", "")
    search_terms = product.get("search_terms", [])

    if len(title) >= 60:
        score += 25
    elif len(title) >= 40:
        score += 15
    else:
        weaknesses.append("Title too short for SEO — search engines prefer 60+ characters")

    if len(bullets) >= 5:
        score += 25
        strengths.append(f"{len(bullets)} bullet points — good keyword coverage")
    elif len(bullets) >= 3:
        score += 15
        weaknesses.append(f"Only {len(bullets)} bullet points — aim for 5+ for keyword density")
    elif len(bullets) >= 1:
        score += 5
        weaknesses.append(f"Only {len(bullets)} bullet point(s) — hurting SEO")
    else:
        weaknesses.append("No bullet points — critical for keyword density and readability")

    if len(description) >= 300:
        score += 25
        strengths.append("Rich description with good detail")
    elif len(description) >= 100:
        score += 15
        weaknesses.append("Description is short — expand for better SEO")
    elif description:
        score += 5
        weaknesses.append("Description is very short — expand with keywords")
    else:
        weaknesses.append("No description found — add a keyword-rich description")

    if search_terms:
        score += 25
        strengths.append(f"{len(search_terms)} search terms found")
    else:
        score += 5

    return min(score, 100), strengths, weaknesses


def score_content(product: dict) -> tuple[int, list[str], list[str]]:
    """Score overall content quality."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    bullets = product.get("bullet_points", [])
    description = product.get("description", "")
    category = product.get("category", "")

    if bullets:
        avg_length = sum(len(b) for b in bullets) / len(bullets)
        if avg_length >= 80:
            score += 30
            strengths.append("Detailed bullet points with good length")
        elif avg_length >= 40:
            score += 20
        else:
            score += 10
            weaknesses.append("Bullet points are too short — expand with features and benefits")
    else:
        weaknesses.append("No bullet points — add feature/benefit statements")

    if len(description) >= 500:
        score += 30
        strengths.append("Rich, detailed description")
    elif len(description) >= 200:
        score += 20
    elif len(description) >= 50:
        score += 10
        weaknesses.append("Description needs more detail")
    else:
        weaknesses.append("Description is missing or minimal — huge missed opportunity")

    if category:
        score += 20
        strengths.append(f"Product categorized: {category[:50]}")
    else:
        score += 5

    if product.get("brand"):
        score += 20
        strengths.append(f"Brand identified: {product['brand']}")
    else:
        weaknesses.append("No brand identified — add brand for trust and searchability")

    return min(score, 100), strengths, weaknesses


# ── LLM System Prompt ─────────────────────────────────────────

AUDIT_SYSTEM_PROMPT = """You are Kansa's Auditor — an expert Amazon listing optimizer.

You analyze product listings and produce a structured audit with:
1. Per-category issues: specific, fixable problems grouped by category
2. Overall strengths and weaknesses
3. Actionable recommendations prioritized by sales impact

For each ISSUE, be extremely specific. Not "improve your title" but:
"Missing primary keyword 'wireless earbuds' (estimated 140K monthly searches). Title is 47 chars — Amazon allows up to 200. Brand name is at position 6, should be position 1."

The audit output must be marketplace-aware. Consider:
- The marketplace language and search behavior
- Local keyword patterns and common search terms
- Currency and pricing norms for the region

Categories and their fix actions:
- title: Issues with the product title → Fix: AI title rewrite (5 tokens)
- bullets: Issues with bullet points → Fix: AI bullet rewrite (8 tokens)
- description: Issues with product description → Fix: AI description rewrite (8 tokens)
- images: Issues with product images → Fix: AI image recommendations (3 tokens)
- keywords: Issues with SEO/backend keywords → Fix: AI keyword optimization (5 tokens)
- competitive: Market positioning issues → Fix: AI strategy report (10 tokens)

Respond in JSON format:
{
    "category_issues": {
        "title": [
            {
                "issue": "Specific problem description",
                "impact": "high|medium|low",
                "detail": "Why this matters and what the ideal state looks like"
            }
        ],
        "bullets": [...],
        "description": [...],
        "images": [...],
        "keywords": [...],
        "competitive": [...]
    },
    "summary": "One paragraph executive summary of listing health",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2", ...],
    "recommendations": [
        {
            "title": "Short action title",
            "description": "What to do and why",
            "impact": "high|medium|low",
            "category": "title|bullets|description|images|keywords|competitive"
        }
    ]
}"""


class AuditorAgent(BaseAgent):
    """Analyzes Amazon product listings and produces audits with fixable issues."""

    @property
    def name(self) -> str:
        return "auditor"

    @property
    def description(self) -> str:
        return "Amazon listing analyzer — scores, identifies fixable issues, attaches token costs"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required (output from Scout agent)")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Analyze a product listing and produce an audit with fixable issues."""
        product = input_data["product"]

        logger.info("Auditor: analyzing listing — '%s'", product.get("title", "")[:50])

        # 1. Rule-based scoring
        title_score, title_s, title_w = score_title(product)
        image_score, image_s, image_w = score_images(product)
        price_score, price_s, price_w = score_pricing(product)
        review_score, review_s, review_w = score_reviews(product)
        seo_score, seo_s, seo_w = score_seo(product)
        content_score, content_s, content_w = score_content(product)

        dimension_scores = {
            "title": title_score,
            "images": image_score,
            "pricing": price_score,
            "reviews": review_score,
            "seo": seo_score,
            "content": content_score,
        }

        overall_score = round(
            sum(dimension_scores[dim] * weight for dim, weight in WEIGHTS.items())
        )

        all_strengths = title_s + image_s + price_s + review_s + seo_s + content_s
        all_weaknesses = title_w + image_w + price_w + review_w + seo_w + content_w

        # 2. LLM-powered analysis with per-category issues
        category_issues = {}
        try:
            # Detect marketplace from URL for marketplace-aware scoring
            url = product.get("url", "")
            marketplace = "amazon.com"
            for domain in ["amazon.com.mx", "amazon.com.br", "amazon.co.uk", "amazon.de",
                           "amazon.es", "amazon.fr", "amazon.it", "amazon.co.jp",
                           "amazon.in", "amazon.ae", "amazon.sa", "amazon.com.au",
                           "amazon.ca", "amazon.com"]:
                if domain in url:
                    marketplace = domain
                    break

            llm_analysis = await complete_json(
                system=AUDIT_SYSTEM_PROMPT,
                prompt=(
                    f"Analyze this Amazon listing from {marketplace}:\n\n"
                    f"Title: {product.get('title', 'N/A')}\n"
                    f"Brand: {product.get('brand', 'N/A')}\n"
                    f"Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n"
                    f"Rating: {product.get('rating', 'N/A')}/5 ({product.get('review_count', 0)} reviews)\n"
                    f"Images: {len(product.get('images', []))} images\n"
                    f"Bullet points: {len(product.get('bullet_points', []))}\n"
                    f"Description length: {len(product.get('description', ''))} chars\n"
                    f"Platform: {product.get('platform', 'unknown')}\n"
                    f"Marketplace: {marketplace}\n\n"
                    f"Dimension scores:\n"
                    f"  Title: {title_score}/100\n"
                    f"  Images: {image_score}/100\n"
                    f"  Pricing: {price_score}/100\n"
                    f"  Reviews: {review_score}/100\n"
                    f"  SEO: {seo_score}/100\n"
                    f"  Content: {content_score}/100\n"
                    f"  Overall: {overall_score}/100\n\n"
                    f"Rule-based strengths: {all_strengths}\n"
                    f"Rule-based weaknesses: {all_weaknesses}\n\n"
                    f"Bullet points content:\n"
                    + "\n".join(f"  - {bp}" for bp in product.get("bullet_points", [])[:10])
                    + "\n\n"
                    f"Description preview: {product.get('description', '')[:500]}"
                ),
            )

            category_issues = llm_analysis.get("category_issues", {})
            strengths = llm_analysis.get("strengths", all_strengths[:3])
            weaknesses = llm_analysis.get("weaknesses", all_weaknesses[:5])
            recommendations = llm_analysis.get("recommendations", [])
            summary = llm_analysis.get("summary", "")

        except Exception as e:
            logger.warning("Auditor: LLM analysis failed, using rule-based only: %s", e)
            strengths = all_strengths[:5]
            weaknesses = all_weaknesses[:5]
            recommendations = [
                {"title": w, "description": w, "impact": "medium", "category": "general"}
                for w in all_weaknesses[:5]
            ]
            summary = (
                f"Listing scored {overall_score}/100. "
                f"Found {len(all_strengths)} strengths and {len(all_weaknesses)} areas for improvement."
            )
            # Build basic category_issues from rule-based weaknesses
            category_issues = _build_fallback_issues(title_w, image_w, price_w, seo_w, content_w)

        # 3. Attach fix costs to category issues
        for cat, issues in category_issues.items():
            fix_key = cat if cat in FIX_COSTS else "keywords"
            for issue in issues:
                issue["fix_cost"] = FIX_COSTS.get(fix_key, 5)
                issue["fix_action"] = _get_fix_action(cat)

        # Count total fixable issues and total token cost
        total_issues = sum(len(issues) for issues in category_issues.values())
        total_fix_cost = sum(
            issue.get("fix_cost", 0)
            for issues in category_issues.values()
            for issue in issues
        )

        logger.info(
            "Auditor: complete — score=%d/100, issues=%d, fix_cost=%d tokens",
            overall_score, total_issues, total_fix_cost,
        )

        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "overall_score": overall_score,
                "dimension_scores": dimension_scores,
                "category_issues": category_issues,
                "fix_costs": FIX_COSTS,
                "total_issues": total_issues,
                "total_fix_cost": total_fix_cost,
                "summary": summary,
                "strengths": strengths,
                "weaknesses": weaknesses,
                "recommendations": recommendations,
            },
        )


def _get_fix_action(category: str) -> str:
    """Get the fix action label for a category."""
    actions = {
        "title": "Rewrite Title",
        "bullets": "Rewrite Bullets",
        "description": "Rewrite Description",
        "images": "Image Suggestions",
        "keywords": "Optimize Keywords",
        "competitive": "Strategy Report",
    }
    return actions.get(category, f"Fix {category.title()}")


def _build_fallback_issues(
    title_w: list, image_w: list, price_w: list, seo_w: list, content_w: list
) -> dict:
    """Build category_issues from rule-based weaknesses when LLM fails."""
    issues: dict[str, list] = {}
    for cat, weaknesses in [
        ("title", title_w), ("images", image_w),
        ("keywords", seo_w), ("description", content_w),
    ]:
        if weaknesses:
            issues[cat] = [
                {"issue": w, "impact": "medium", "detail": w}
                for w in weaknesses
            ]
    return issues
