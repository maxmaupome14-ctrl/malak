"""
Auditor Agent — Listing Analyzer

The Auditor is the analyst of Malak. Given product data from Scout, it:
1. Scores the listing across 6 dimensions using rule-based heuristics
2. Uses LLM to generate qualitative analysis and recommendations
3. Returns a comprehensive audit with actionable improvements

Scoring dimensions (weighted):
    - Title (20%): Length, keyword presence, readability
    - Images (20%): Count, variety
    - Pricing (15%): Price present, discount shown
    - Reviews (15%): Rating, count
    - SEO (15%): Keyword density, bullet points
    - Content (15%): Description quality, bullet point count

Input:
    - product (dict): Normalized product data from Scout

Output:
    - overall_score (float): 0-100 listing quality score
    - dimension_scores (dict): Breakdown by category
    - strengths (list[str]): What's working well
    - weaknesses (list[str]): What needs improvement
    - recommendations (list[dict]): Prioritized improvement list
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


def score_title(product: dict) -> tuple[int, list[str], list[str]]:
    """Score title quality. Returns (score, strengths, weaknesses)."""
    title = product.get("title", "")
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    if not title:
        return 0, [], ["No title found"]

    length = len(title)

    # Length scoring (ideal: 80-150 chars for Amazon, 50-70 for Shopify)
    if 60 <= length <= 200:
        score += 40
        strengths.append(f"Good title length ({length} chars)")
    elif 40 <= length < 60:
        score += 25
        weaknesses.append(f"Title is short ({length} chars) — aim for 80-150 characters")
    elif length > 200:
        score += 20
        weaknesses.append(f"Title is too long ({length} chars) — may get truncated in search")
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
        score += 5  # No brand to check, partial credit

    # Capitalization check (all caps is bad)
    if title.isupper():
        weaknesses.append("Title is ALL CAPS — use Title Case for better readability")
    else:
        score += 10

    # No special character spam
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

    # Count scoring (ideal: 5-9 images)
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

    # Video presence
    videos = product.get("video_urls", [])
    if videos:
        score += 20
        strengths.append("Has product video — great for engagement")
    else:
        score += 0
        weaknesses.append("No product video — videos increase conversion by 20-30%")

    # Basic score boost for having images at all
    score += 20

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
        # Amazon defers price to JS — it IS displayed on the live page,
        # we just can't extract it. Don't penalize heavily.
        if platform == "amazon":
            return 50, ["Price is displayed on the live listing"], [
                "Price could not be extracted (Amazon renders it via JavaScript) — "
                "score for this dimension is estimated"
            ]
        return 20, [], ["Price not found or not displayed — critical for conversion"]

    score += 40  # Price exists
    strengths.append(f"Price displayed: {product.get('currency', 'USD')} {price}")

    # Discount/sale price
    if original_price and original_price > price:
        discount = round((1 - price / original_price) * 100)
        score += 30
        strengths.append(f"Sale price shown ({discount}% off) — creates urgency")
    else:
        score += 10
        weaknesses.append("No comparison/sale price shown — consider showing original price for anchoring")

    # Price psychology (ending in .99, .97, etc.)
    price_str = f"{price:.2f}"
    if price_str.endswith(("99", "97", "95")):
        score += 15
        strengths.append("Price uses psychological pricing (charm pricing)")
    else:
        score += 5

    # Round number bonus (for premium products)
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

    # Rating score
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
            weaknesses.append(f"Low rating ({rating}/5) — urgent: review product quality and customer complaints")

    # Count score
    if count >= 100:
        score += 40
        strengths.append(f"Strong review count ({count} reviews) — great social proof")
    elif count >= 50:
        score += 30
        strengths.append(f"Good review count ({count} reviews)")
    elif count >= 10:
        score += 20
        weaknesses.append(f"Only {count} reviews — aim for 50+ for strong social proof")
    elif count >= 1:
        score += 10
        weaknesses.append(f"Only {count} review(s) — need more social proof")
    else:
        weaknesses.append("Zero reviews — launch a review request campaign")

    # Bonus for high rating + high count combo
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

    # Title length for SEO
    if len(title) >= 60:
        score += 25
    elif len(title) >= 40:
        score += 15
    else:
        weaknesses.append("Title too short for SEO — search engines prefer 60+ characters")

    # Bullet points
    if len(bullets) >= 5:
        score += 25
        strengths.append(f"{len(bullets)} bullet points — good keyword coverage")
    elif len(bullets) >= 3:
        score += 15
        weaknesses.append(f"Only {len(bullets)} bullet points — aim for 5+ for keyword density")
    elif len(bullets) >= 1:
        score += 5
        weaknesses.append(f"Only {len(bullets)} bullet point(s) — this is hurting SEO")
    else:
        weaknesses.append("No bullet points — critical for keyword density and readability")

    # Description
    if len(description) >= 300:
        score += 25
        strengths.append("Rich description with good detail")
    elif len(description) >= 100:
        score += 15
        weaknesses.append("Description is short — expand for better SEO")
    elif description:
        score += 5
        weaknesses.append("Description is very short — expand with keywords and details")
    else:
        weaknesses.append("No description found — add a keyword-rich description")

    # Backend keywords / search terms
    if search_terms:
        score += 25
        strengths.append(f"{len(search_terms)} search terms found")
    else:
        score += 5  # Not always visible in scraping

    return min(score, 100), strengths, weaknesses


def score_content(product: dict) -> tuple[int, list[str], list[str]]:
    """Score overall content quality."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    bullets = product.get("bullet_points", [])
    description = product.get("description", "")
    category = product.get("category", "")

    # Bullet point quality
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

    # Description richness
    if len(description) >= 500:
        score += 30
        strengths.append("Rich, detailed description")
    elif len(description) >= 200:
        score += 20
    elif len(description) >= 50:
        score += 10
        weaknesses.append("Description needs more detail — expand with use cases and benefits")
    else:
        weaknesses.append("Description is missing or minimal — huge missed opportunity")

    # Category assignment
    if category:
        score += 20
        strengths.append(f"Product categorized: {category[:50]}")
    else:
        score += 5

    # Brand presence
    if product.get("brand"):
        score += 20
        strengths.append(f"Brand identified: {product['brand']}")
    else:
        weaknesses.append("No brand identified — add brand for trust and searchability")

    return min(score, 100), strengths, weaknesses


AUDIT_SYSTEM_PROMPT = """You are Malak AI's Auditor — an expert ecommerce listing analyst.

Given a product listing's data and its scores across 6 dimensions, generate:
1. The top 3 STRENGTHS (what's working well)
2. The top 5 WEAKNESSES (prioritized by impact on conversions and sales)
3. For EACH weakness, a specific, actionable RECOMMENDATION

Your recommendations must be:
- Specific (not "improve your title" but "add the keyword 'wireless' and your target use case")
- Actionable (something the seller can do TODAY)
- Prioritized by estimated impact on sales

Respond in JSON format:
{
    "summary": "One paragraph executive summary of this listing's health",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2", ...],
    "recommendations": [
        {
            "title": "Short action title",
            "description": "Detailed explanation of what to do and why",
            "impact": "high|medium|low",
            "effort": "easy|medium|hard",
            "category": "title|images|pricing|reviews|seo|content"
        }
    ]
}"""


class AuditorAgent(BaseAgent):
    """Analyzes product listings and produces comprehensive quality audits."""

    @property
    def name(self) -> str:
        return "auditor"

    @property
    def description(self) -> str:
        return "Listing analyzer — scores and evaluates every aspect of a product page"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required (output from Scout agent)")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Analyze a product listing and produce an audit report."""
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

        # Collect all strengths and weaknesses
        all_strengths = title_s + image_s + price_s + review_s + seo_s + content_s
        all_weaknesses = title_w + image_w + price_w + review_w + seo_w + content_w

        # 2. LLM-powered analysis and recommendations
        try:
            llm_analysis = await complete_json(
                system=AUDIT_SYSTEM_PROMPT,
                prompt=(
                    f"Analyze this product listing:\n\n"
                    f"Title: {product.get('title', 'N/A')}\n"
                    f"Brand: {product.get('brand', 'N/A')}\n"
                    f"Price: {product.get('currency', 'USD')} {product.get('price', 'N/A')}\n"
                    f"Rating: {product.get('rating', 'N/A')}/5 ({product.get('review_count', 0)} reviews)\n"
                    f"Images: {len(product.get('images', []))} images\n"
                    f"Bullet points: {len(product.get('bullet_points', []))}\n"
                    f"Description length: {len(product.get('description', ''))} chars\n"
                    f"Platform: {product.get('platform', 'unknown')}\n\n"
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

            strengths = llm_analysis.get("strengths", all_strengths[:3])
            weaknesses = llm_analysis.get("weaknesses", all_weaknesses[:5])
            recommendations = llm_analysis.get("recommendations", [])
            summary = llm_analysis.get("summary", "")

        except Exception as e:
            logger.warning("Auditor: LLM analysis failed, using rule-based only: %s", e)
            strengths = all_strengths[:5]
            weaknesses = all_weaknesses[:5]
            recommendations = [
                {"title": w, "description": w, "impact": "medium", "effort": "medium", "category": "general"}
                for w in all_weaknesses[:5]
            ]
            summary = f"Listing scored {overall_score}/100. Found {len(all_strengths)} strengths and {len(all_weaknesses)} areas for improvement."

        logger.info("Auditor: complete — score=%d/100", overall_score)

        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "overall_score": overall_score,
                "dimension_scores": dimension_scores,
                "summary": summary,
                "strengths": strengths,
                "weaknesses": weaknesses,
                "recommendations": recommendations,
            },
        )
