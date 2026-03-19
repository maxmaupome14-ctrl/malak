"""
Auditor Agent — Amazon Listing Analyzer with Fixit Integration

The Auditor scores a product listing across 10 dimensions, identifies
specific fixable issues per category, and attaches token costs to each
fix action. The audit is FREE — the fix actions cost tokens.

Scoring dimensions (weighted):
    - Title (12%): Length, keyword presence, readability, structure
    - Main Image (12%): Hero image quality signals
    - Gallery (8%): Additional images, variety, video
    - Bullets (10%): Bullet point count, depth, persuasion
    - Description (8%): Description quality, length, A+ content
    - Pricing (10%): Price display, discount, psychology
    - Reviews (12%): Rating, count, social proof
    - SEO (12%): Keywords, search term coverage
    - Brand (8%): Brand presence, registry, trust signals
    - Competitive (8%): Market positioning, differentiation

Output includes:
    - overall_score, dimension_scores (rule-based, 10 dimensions)
    - category_issues: per-category issues with fix_action + token_cost
    - strengths, weaknesses (LLM-enhanced)
    - recommendations (LLM-generated, actionable)
"""

import logging
from typing import Any

from src.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from src.llm import complete_json

logger = logging.getLogger(__name__)

# Dimension weights for overall score (10 dimensions)
WEIGHTS = {
    "title": 0.12,
    "main_image": 0.12,
    "gallery": 0.08,
    "bullets": 0.10,
    "description": 0.08,
    "pricing": 0.10,
    "reviews": 0.12,
    "seo": 0.12,
    "brand": 0.08,
    "competitive": 0.08,
}

# Token costs per fix action
FIX_COSTS = {
    "title": 5,
    "main_image": 3,
    "gallery": 3,
    "bullets": 8,
    "description": 8,
    "images": 3,
    "keywords": 5,
    "competitive": 10,
    "brand": 4,
    "pricing": 4,
    "seo": 5,
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


def score_main_image(product: dict) -> tuple[int, list[str], list[str]]:
    """Score main/hero image quality."""
    images = product.get("images", [])
    strengths: list[str] = []
    weaknesses: list[str] = []

    if not images:
        return 0, [], ["No main image found — critical: add a product photo immediately"]

    score = 50  # Has a main image

    # Check if main image URL suggests high-res
    main = images[0] if images else ""
    if isinstance(main, str):
        if any(s in main for s in ["_SL1500", "_SL1200", "_SL1000"]):
            score += 25
            strengths.append("Main image is high resolution (1000px+)")
        elif any(s in main for s in ["_SL500", "_SL600"]):
            score += 10
            weaknesses.append("Main image resolution could be higher — aim for 1500px+")
        else:
            score += 15  # Unknown but exists

    # Amazon requires white background for main image
    strengths.append("Main product image present")
    score += 25

    return min(score, 100), strengths, weaknesses


def score_gallery(product: dict) -> tuple[int, list[str], list[str]]:
    """Score gallery images and video."""
    images = product.get("images", [])
    strengths: list[str] = []
    weaknesses: list[str] = []
    count = len(images)

    if count <= 1:
        return 10 if count == 1 else 0, [], [
            "No gallery images — add lifestyle shots, infographics, and size charts"
        ]

    score = 0
    gallery_count = count - 1  # Exclude main image

    if gallery_count >= 7:
        score += 50
        strengths.append(f"Excellent gallery ({gallery_count} additional images)")
    elif gallery_count >= 5:
        score += 40
        strengths.append(f"Good gallery ({gallery_count} additional images)")
    elif gallery_count >= 3:
        score += 25
        weaknesses.append(f"Only {gallery_count} gallery images — aim for 7+ to maximize conversion")
    else:
        score += 15
        weaknesses.append(f"Only {gallery_count} gallery image(s) — add lifestyle shots, infographics")

    # Video check
    videos = product.get("video_urls", [])
    if videos:
        score += 30
        strengths.append("Has product video — great for engagement (+20-30% conversion)")
    else:
        score += 0
        weaknesses.append("No product video — videos increase conversion by 20-30%")

    # Variety bonus
    if gallery_count >= 4:
        score += 20
        strengths.append("Good image variety potential")

    return min(score, 100), strengths, weaknesses


def score_bullets(product: dict) -> tuple[int, list[str], list[str]]:
    """Score bullet points quality."""
    bullets = product.get("bullet_points", [])
    strengths: list[str] = []
    weaknesses: list[str] = []

    if not bullets:
        return 0, [], ["No bullet points — critical for conversion and SEO"]

    score = 0
    count = len(bullets)

    # Count
    if count >= 5:
        score += 35
        strengths.append(f"{count} bullet points — full utilization")
    elif count >= 3:
        score += 20
        weaknesses.append(f"Only {count} bullet points — use all 5 slots")
    else:
        score += 10
        weaknesses.append(f"Only {count} bullet point(s) — you're leaving money on the table")

    # Average length
    avg_length = sum(len(b) for b in bullets) / len(bullets) if bullets else 0
    if avg_length >= 100:
        score += 30
        strengths.append("Detailed bullet points with strong feature/benefit coverage")
    elif avg_length >= 60:
        score += 20
        strengths.append("Good bullet point detail")
    elif avg_length >= 30:
        score += 10
        weaknesses.append("Bullet points are too short — expand with features AND benefits")
    else:
        score += 5
        weaknesses.append("Bullet points are very thin — rewrite with value propositions")

    # Caps lock check (common Amazon seller mistake)
    caps_bullets = sum(1 for b in bullets if b[:20].isupper())
    if caps_bullets <= 1:
        score += 15
    else:
        weaknesses.append("Multiple bullets start with ALL CAPS — distracting, use Title Case headers")

    # Keyword density proxy
    total_words = sum(len(b.split()) for b in bullets)
    if total_words >= 50:
        score += 20
        strengths.append("Good keyword density across bullets")
    elif total_words >= 25:
        score += 10
    else:
        weaknesses.append("Bullets lack keyword density — add more descriptive text")

    return min(score, 100), strengths, weaknesses


def score_description(product: dict) -> tuple[int, list[str], list[str]]:
    """Score product description quality."""
    description = product.get("description", "")
    strengths: list[str] = []
    weaknesses: list[str] = []

    if not description:
        return 0, [], ["No description — huge missed opportunity for conversion and SEO"]

    score = 0
    length = len(description)

    # Length
    if length >= 1000:
        score += 35
        strengths.append("Rich, comprehensive description")
    elif length >= 500:
        score += 25
        strengths.append("Good description length")
    elif length >= 200:
        score += 15
        weaknesses.append("Description is short — expand with product story and use cases")
    elif length >= 50:
        score += 8
        weaknesses.append("Description is very short — needs substantial expansion")
    else:
        score += 3
        weaknesses.append("Description is minimal — rewrite with features, benefits, and story")

    # HTML/A+ content signals
    has_html = any(tag in description.lower() for tag in ["<br", "<p>", "<ul>", "<li>", "<b>", "<strong>"])
    if has_html:
        score += 25
        strengths.append("Uses HTML formatting / A+ Content")
    else:
        score += 5
        weaknesses.append("No HTML formatting — consider A+ Content for visual appeal")

    # Paragraph structure
    paragraphs = [p for p in description.split("\n") if p.strip()]
    if len(paragraphs) >= 3:
        score += 20
        strengths.append("Well-structured with multiple paragraphs")
    elif len(paragraphs) >= 2:
        score += 10
    else:
        score += 5
        weaknesses.append("Description is a single block — break into scannable paragraphs")

    # Word count
    word_count = len(description.split())
    if word_count >= 100:
        score += 20
    elif word_count >= 50:
        score += 10
    else:
        weaknesses.append(f"Only {word_count} words in description — aim for 100+")

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
        strengths.append("Rich description with good keyword potential")
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


def score_brand(product: dict) -> tuple[int, list[str], list[str]]:
    """Score brand presence and trust signals."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    brand = product.get("brand", "")
    title = product.get("title", "")
    seller = product.get("seller_name", "")

    # Brand field exists
    if brand:
        score += 35
        strengths.append(f"Brand identified: {brand}")
    else:
        weaknesses.append("No brand identified — register your brand for trust and Amazon Brand Registry benefits")

    # Brand in title
    if brand and brand.lower() in title.lower():
        score += 25
        strengths.append("Brand prominently displayed in title")
    elif brand:
        score += 5
        weaknesses.append("Brand not in title — add brand name for recognition")

    # Seller match (brand = seller suggests own brand)
    if brand and seller and brand.lower() in seller.lower():
        score += 20
        strengths.append("Seller matches brand — indicates authorized/own brand")
    elif seller:
        score += 10

    # Category presence
    if product.get("category"):
        score += 20
        strengths.append(f"Properly categorized: {product['category'][:60]}")
    else:
        weaknesses.append("No category detected — ensure listing is in the right category")

    return min(score, 100), strengths, weaknesses


def score_competitive(product: dict) -> tuple[int, list[str], list[str]]:
    """Score competitive positioning signals."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    score = 0

    # BSR presence
    bsr = product.get("best_sellers_rank")
    if bsr:
        score += 30
        strengths.append(f"Has Best Sellers Rank — product is selling")
    else:
        score += 10

    # In stock
    if product.get("in_stock", True):
        score += 20
        strengths.append("Product is in stock")
    else:
        weaknesses.append("Product is out of stock — losing sales")

    # Fulfillment
    fulfillment = product.get("fulfillment", "")
    if "fba" in fulfillment.lower() or "amazon" in fulfillment.lower():
        score += 25
        strengths.append("Fulfilled by Amazon (FBA) — Prime eligible")
    elif fulfillment:
        score += 10
        weaknesses.append("Not using FBA — consider Fulfillment by Amazon for Prime badge")
    else:
        score += 10

    # Price competitiveness (basic proxy)
    price = product.get("price")
    original = product.get("original_price")
    if price and original and original > price:
        score += 25
        strengths.append("Competitive pricing with visible discount")
    elif price:
        score += 10
    else:
        weaknesses.append("No price data for competitive analysis")

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
- main_image: Issues with the hero image → Fix: AI image recommendations (3 tokens)
- gallery: Issues with gallery images/video → Fix: AI gallery recommendations (3 tokens)
- bullets: Issues with bullet points → Fix: AI bullet rewrite (8 tokens)
- description: Issues with product description → Fix: AI description rewrite (8 tokens)
- pricing: Pricing strategy issues → Fix: AI pricing analysis (4 tokens)
- keywords: Issues with SEO/backend keywords → Fix: AI keyword optimization (5 tokens)
- brand: Brand presence issues → Fix: AI brand strategy (4 tokens)
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
        "main_image": [...],
        "gallery": [...],
        "bullets": [...],
        "description": [...],
        "pricing": [...],
        "keywords": [...],
        "brand": [...],
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
            "category": "title|main_image|gallery|bullets|description|pricing|keywords|brand|competitive"
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
        return "Amazon listing analyzer — scores 10 dimensions, identifies fixable issues, attaches token costs"

    async def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if "product" not in input_data:
            errors.append("'product' data is required (output from Scout agent)")
        return errors

    async def execute(self, context: AgentContext, input_data: dict[str, Any]) -> AgentResult:
        """Analyze a product listing and produce a 10-dimension audit."""
        product = input_data["product"]

        logger.info("Auditor: analyzing listing — '%s'", product.get("title", "")[:50])

        # 1. Rule-based scoring (10 dimensions)
        title_score, title_s, title_w = score_title(product)
        main_img_score, main_img_s, main_img_w = score_main_image(product)
        gallery_score, gallery_s, gallery_w = score_gallery(product)
        bullet_score, bullet_s, bullet_w = score_bullets(product)
        desc_score, desc_s, desc_w = score_description(product)
        price_score, price_s, price_w = score_pricing(product)
        review_score, review_s, review_w = score_reviews(product)
        seo_score, seo_s, seo_w = score_seo(product)
        brand_score, brand_s, brand_w = score_brand(product)
        comp_score, comp_s, comp_w = score_competitive(product)

        dimension_scores = {
            "title": title_score,
            "main_image": main_img_score,
            "gallery": gallery_score,
            "bullets": bullet_score,
            "description": desc_score,
            "pricing": price_score,
            "reviews": review_score,
            "seo": seo_score,
            "brand": brand_score,
            "competitive": comp_score,
        }

        overall_score = round(
            sum(dimension_scores[dim] * weight for dim, weight in WEIGHTS.items())
        )

        all_strengths = (
            title_s + main_img_s + gallery_s + bullet_s + desc_s
            + price_s + review_s + seo_s + brand_s + comp_s
        )
        all_weaknesses = (
            title_w + main_img_w + gallery_w + bullet_w + desc_w
            + price_w + review_w + seo_w + brand_w + comp_w
        )

        # 2. LLM-powered analysis with per-category issues
        category_issues = {}
        try:
            # Detect marketplace from URL
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
                    f"Videos: {len(product.get('video_urls', []))} videos\n"
                    f"Bullet points: {len(product.get('bullet_points', []))}\n"
                    f"Description length: {len(product.get('description', ''))} chars\n"
                    f"Platform: {product.get('platform', 'unknown')}\n"
                    f"Marketplace: {marketplace}\n"
                    f"Seller: {product.get('seller_name', 'N/A')}\n"
                    f"Fulfillment: {product.get('fulfillment', 'N/A')}\n\n"
                    f"Dimension scores (10):\n"
                    f"  Title: {title_score}/100\n"
                    f"  Main Image: {main_img_score}/100\n"
                    f"  Gallery: {gallery_score}/100\n"
                    f"  Bullets: {bullet_score}/100\n"
                    f"  Description: {desc_score}/100\n"
                    f"  Pricing: {price_score}/100\n"
                    f"  Reviews: {review_score}/100\n"
                    f"  SEO: {seo_score}/100\n"
                    f"  Brand: {brand_score}/100\n"
                    f"  Competitive: {comp_score}/100\n"
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
            category_issues = _build_fallback_issues(
                title_w, main_img_w, gallery_w, bullet_w, desc_w,
                price_w, seo_w, brand_w, comp_w
            )

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
        "main_image": "Image Analysis",
        "gallery": "Gallery Strategy",
        "bullets": "Rewrite Bullets",
        "description": "Rewrite Description",
        "pricing": "Pricing Strategy",
        "images": "Image Suggestions",
        "keywords": "Optimize Keywords",
        "brand": "Brand Strategy",
        "competitive": "Strategy Report",
        "seo": "SEO Optimization",
    }
    return actions.get(category, f"Fix {category.title()}")


def _build_fallback_issues(
    title_w: list, main_img_w: list, gallery_w: list,
    bullet_w: list, desc_w: list, price_w: list,
    seo_w: list, brand_w: list, comp_w: list,
) -> dict:
    """Build category_issues from rule-based weaknesses when LLM fails."""
    issues: dict[str, list] = {}
    for cat, weaknesses in [
        ("title", title_w), ("main_image", main_img_w), ("gallery", gallery_w),
        ("bullets", bullet_w), ("description", desc_w), ("pricing", price_w),
        ("keywords", seo_w), ("brand", brand_w), ("competitive", comp_w),
    ]:
        if weaknesses:
            issues[cat] = [
                {"issue": w, "impact": "medium", "detail": w}
                for w in weaknesses
            ]
    return issues
