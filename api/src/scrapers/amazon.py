"""
Amazon Scraper — extracts product data from Amazon product pages.

Strategy:
    1. Extract ASIN from URL
    2. Fetch page with httpx using stealth headers
    3. Parse HTML with BeautifulSoup
    4. Extract: title, price, images, bullets, description, reviews, rating,
       brand, category, seller, BSR, availability
    5. Retry on failure with tenacity

Supports all major Amazon domains.
"""

import json
import logging
import re
from html import unescape
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError

logger = logging.getLogger(__name__)

_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Rotate user agents to reduce blocking
_USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) "
        "Gecko/20100101 Firefox/133.0"
    ),
]

# Amazon domain → default currency mapping
_DOMAIN_CURRENCY = {
    "amazon.com": "USD",
    "amazon.com.mx": "MXN",
    "amazon.co.uk": "GBP",
    "amazon.de": "EUR",
    "amazon.fr": "EUR",
    "amazon.es": "EUR",
    "amazon.it": "EUR",
    "amazon.ca": "CAD",
    "amazon.co.jp": "JPY",
    "amazon.com.br": "BRL",
    "amazon.com.au": "AUD",
    "amazon.in": "INR",
}

# Accept-Language per domain for localized content
_DOMAIN_LANG = {
    "amazon.com": "en-US,en;q=0.9",
    "amazon.com.mx": "es-MX,es;q=0.9,en;q=0.8",
    "amazon.co.uk": "en-GB,en;q=0.9",
    "amazon.de": "de-DE,de;q=0.9,en;q=0.8",
    "amazon.fr": "fr-FR,fr;q=0.9,en;q=0.8",
    "amazon.es": "es-ES,es;q=0.9,en;q=0.8",
    "amazon.it": "it-IT,it;q=0.9,en;q=0.8",
    "amazon.ca": "en-CA,en;q=0.9",
    "amazon.co.jp": "ja-JP,ja;q=0.9,en;q=0.8",
    "amazon.com.br": "pt-BR,pt;q=0.9,en;q=0.8",
    "amazon.com.au": "en-AU,en;q=0.9",
    "amazon.in": "en-IN,en;q=0.9",
}


def _strip_html(raw_html: str) -> str:
    """Remove HTML tags and decode entities."""
    if not raw_html:
        return ""
    text = _HTML_TAG_RE.sub(" ", raw_html)
    text = unescape(text)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _safe_float(value: object) -> float | None:
    """Extract a float from a string like '$29.99' or '1,299.00'."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    # Remove currency symbols and whitespace
    s = re.sub(r"[^\d.,\-]", "", s)
    if not s:
        return None
    # Handle formats: 1,299.00 or 1.299,00
    if "," in s and "." in s:
        if s.rindex(",") > s.rindex("."):
            # European: 1.299,00
            s = s.replace(".", "").replace(",", ".")
        else:
            # US: 1,299.00
            s = s.replace(",", "")
    elif "," in s:
        # Could be 1,299 (US thousand) or 29,99 (European decimal)
        parts = s.split(",")
        if len(parts[-1]) == 2:
            # Likely European decimal: 29,99
            s = s.replace(",", ".")
        else:
            # Likely US thousand: 1,299
            s = s.replace(",", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


class AmazonScraper(BaseScraper):
    """Scrapes Amazon product pages for structured product data."""

    AMAZON_DOMAINS = [
        "amazon.com",
        "amazon.com.mx",
        "amazon.co.uk",
        "amazon.de",
        "amazon.fr",
        "amazon.es",
        "amazon.it",
        "amazon.ca",
        "amazon.co.jp",
        "amazon.com.br",
        "amazon.com.au",
        "amazon.in",
    ]

    @property
    def platform_name(self) -> str:
        return "amazon"

    def can_handle(self, url: str) -> bool:
        """Check if URL is an Amazon product page."""
        return any(domain in url for domain in self.AMAZON_DOMAINS)

    def extract_asin(self, url: str) -> str | None:
        """Extract ASIN from an Amazon URL."""
        patterns = [
            r"/dp/([A-Z0-9]{10})",
            r"/gp/product/([A-Z0-9]{10})",
            r"/product/([A-Z0-9]{10})",
        ]
        for pattern in patterns:
            match = re.search(pattern, url, re.IGNORECASE)
            if match:
                return match.group(1).upper()
        return None

    def _detect_domain(self, url: str) -> str:
        """Detect which Amazon domain this URL belongs to."""
        parsed = urlparse(url)
        host = parsed.hostname or ""
        for domain in self.AMAZON_DOMAINS:
            if domain in host:
                return domain
        return "amazon.com"

    def _build_headers(self, domain: str, ua_index: int = 0) -> dict[str, str]:
        """Build stealth request headers for an Amazon domain."""
        ua = _USER_AGENTS[ua_index % len(_USER_AGENTS)]
        lang = _DOMAIN_LANG.get(domain, "en-US,en;q=0.9")
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": lang,
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type(ScrapingError),
        reraise=True,
    )
    async def _fetch_page(self, url: str, asin: str, domain: str, attempt: int = 0) -> str:
        """Fetch Amazon product page HTML with anti-bot handling."""
        # Build a clean product URL (avoids tracking params that trigger blocks)
        clean_url = f"https://www.{domain}/dp/{asin}"

        headers = self._build_headers(domain, ua_index=attempt)

        async with httpx.AsyncClient(
            headers=headers,
            follow_redirects=True,
            timeout=20.0,
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
        ) as client:
            resp = await client.get(clean_url)

            if resp.status_code == 503:
                logger.warning("Amazon returned 503 (captcha/block) for %s", asin)
                raise ScrapingError(
                    f"Amazon blocked the request (503). ASIN: {asin}",
                    url=url,
                    status_code=503,
                )

            if resp.status_code == 404:
                raise ScrapingError(
                    f"Product not found on Amazon (404). ASIN: {asin}",
                    url=url,
                    status_code=404,
                )

            if resp.status_code >= 400:
                raise ScrapingError(
                    f"Amazon returned HTTP {resp.status_code} for {asin}",
                    url=url,
                    status_code=resp.status_code,
                )

            html = resp.text

            # Detect captcha / robot check page
            if "captcha" in html.lower() or "Type the characters you see" in html:
                logger.warning("Amazon captcha detected for %s", asin)
                raise ScrapingError(
                    f"Amazon captcha triggered for ASIN: {asin}",
                    url=url,
                    status_code=503,
                )

            return html

    async def scrape(self, url: str) -> ScrapedProduct:
        """Scrape an Amazon product page and return structured data."""
        asin = self.extract_asin(url)
        if not asin:
            raise ScrapingError(
                f"Could not extract ASIN from URL: {url}",
                url=url,
            )

        domain = self._detect_domain(url)
        currency = _DOMAIN_CURRENCY.get(domain, "USD")

        html = await self._fetch_page(url, asin, domain)
        soup = BeautifulSoup(html, "lxml")

        product = self._parse(url, asin, domain, currency, soup, html)

        # Note: Amazon defers price rendering to JavaScript. Price may be None
        # for .com pages. The auditor handles this gracefully — the other 5
        # scoring dimensions (title, images, content, reviews, SEO) still
        # produce accurate scores.
        if product.price is None:
            logger.info(
                "Price unavailable for ASIN %s (Amazon JS-deferred). "
                "Other fields extracted successfully.",
                asin,
            )

        return product

    def _parse(
        self,
        url: str,
        asin: str,
        domain: str,
        currency: str,
        soup: BeautifulSoup,
        raw_html: str,
    ) -> ScrapedProduct:
        """Parse all product data from the Amazon page."""
        title = self._parse_title(soup)
        brand = self._parse_brand(soup)
        price, original_price, discount = self._parse_price(soup)
        # Fallback: try extracting price from embedded scripts/data
        if price is None:
            price, original_price, discount = self._parse_price_from_scripts(raw_html)
        images = self._parse_images(soup, raw_html)
        bullet_points = self._parse_bullets(soup)
        description = self._parse_description(soup)
        rating, review_count, rating_dist = self._parse_reviews(soup)
        category, subcategory = self._parse_category(soup)
        seller, fulfillment = self._parse_seller(soup)
        in_stock = self._parse_availability(soup)
        bsr = self._parse_bsr(soup)
        videos = self._parse_videos(raw_html)

        product = ScrapedProduct(
            url=url,
            platform="amazon",
            platform_id=asin,
            title=title,
            brand=brand,
            description=description,
            bullet_points=bullet_points,
            category=category,
            subcategory=subcategory,
            price=price,
            currency=currency,
            original_price=original_price,
            discount_percent=discount,
            images=images,
            video_urls=videos,
            rating=rating,
            review_count=review_count,
            rating_distribution=rating_dist,
            seller_name=seller,
            fulfillment=fulfillment,
            in_stock=in_stock,
            raw_data={"bsr": bsr} if bsr else {},
        )

        logger.info(
            "Amazon scrape OK: ASIN=%s title=%s price=%s images=%d bullets=%d rating=%s reviews=%d",
            asin,
            title[:60] if title else "(none)",
            price,
            len(images),
            len(bullet_points),
            rating,
            review_count,
        )

        return product

    # ── Individual parsers ──────────────────────────────────────────── #

    def _parse_title(self, soup: BeautifulSoup) -> str:
        """Extract product title."""
        # Primary: #productTitle
        el = soup.select_one("#productTitle")
        if el:
            return el.get_text(strip=True)

        # Fallback: meta og:title
        meta = soup.select_one('meta[property="og:title"]')
        if meta and meta.get("content"):
            return meta["content"].strip()

        # Fallback: title tag
        el = soup.select_one("title")
        if el:
            text = el.get_text(strip=True)
            # Remove " : Amazon.com" suffix
            text = re.sub(r"\s*:?\s*Amazon\.\w+.*$", "", text)
            return text

        return ""

    def _parse_brand(self, soup: BeautifulSoup) -> str:
        """Extract brand name."""
        # "Visit the X Store" link
        el = soup.select_one("#bylineInfo")
        if el:
            text = el.get_text(strip=True)
            # "Visit the Apple Store" → "Apple"
            text = re.sub(r"^(Visit the |Brand:\s*)", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*(Store|store)$", "", text)
            return text.strip()

        # Product details table
        for row in soup.select("#productDetails_detailBullets_sections1 tr, #detailBullets_feature_div li"):
            text = row.get_text()
            if "brand" in text.lower():
                parts = text.split(":")
                if len(parts) >= 2:
                    return parts[-1].strip()

        return ""

    def _parse_price(self, soup: BeautifulSoup) -> tuple[float | None, float | None, float | None]:
        """Extract current price, original price, and discount percentage."""
        price: float | None = None
        original_price: float | None = None
        discount: float | None = None

        # Current price: multiple possible locations
        for selector in [
            ".a-price .a-offscreen",
            "#priceblock_ourprice",
            "#priceblock_dealprice",
            "#priceblock_saleprice",
            "span.a-price span.a-offscreen",
            "#corePrice_feature_div .a-price .a-offscreen",
            "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        ]:
            el = soup.select_one(selector)
            if el:
                val = _safe_float(el.get_text())
                if val is not None and val > 0:
                    price = val
                    break

        # Original (strikethrough) price
        for selector in [
            ".a-text-price .a-offscreen",
            "#priceblock_ourprice_lbl + .a-text-price .a-offscreen",
            "span.a-price[data-a-strike] .a-offscreen",
            ".basisPrice .a-offscreen",
        ]:
            el = soup.select_one(selector)
            if el:
                val = _safe_float(el.get_text())
                if val is not None and val > 0 and (price is None or val > price):
                    original_price = val
                    break

        # Discount
        if price and original_price and original_price > price:
            discount = round((1 - price / original_price) * 100, 1)
        else:
            # Check for explicit discount text like "20% off"
            el = soup.select_one(".savingsPercentage, #dealprice_savings .priceBlockSavingsString")
            if el:
                match = re.search(r"(\d+)%", el.get_text())
                if match:
                    discount = float(match.group(1))

        return price, original_price, discount

    def _extract_json_array(self, text: str, start: int) -> str | None:
        """Extract a complete JSON array from text starting at position of '['."""
        if start >= len(text) or text[start] != "[":
            return None
        depth = 0
        for i in range(start, min(start + 20000, len(text))):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        return None

    def _parse_images(self, soup: BeautifulSoup, raw_html: str) -> list[str]:
        """Extract product image URLs (hi-res preferred)."""
        images: list[str] = []

        # Best source: JavaScript colorImages data (has hi-res URLs)
        ci_match = re.search(r"'colorImages'\s*:\s*\{\s*'initial'\s*:\s*\[", raw_html)
        if not ci_match:
            ci_match = re.search(r'"colorImages"\s*:\s*\{\s*"initial"\s*:\s*\[', raw_html)

        if ci_match:
            # Find the start of the array
            arr_start = raw_html.rfind("[", ci_match.start(), ci_match.end())
            if arr_start >= 0:
                arr_str = self._extract_json_array(raw_html, arr_start)
                if arr_str:
                    try:
                        img_array = json.loads(arr_str)
                        for img in img_array:
                            img_url = img.get("hiRes") or img.get("large") or ""
                            if img_url and img_url not in images:
                                images.append(img_url)
                    except (json.JSONDecodeError, KeyError):
                        pass

        # Fallback: extract hiRes URLs directly via regex
        if not images:
            for match in re.finditer(r'"hiRes"\s*:\s*"(https://[^"]+)"', raw_html):
                url = match.group(1)
                if url not in images and "_SL1500_" in url:
                    images.append(url)

        # Fallback: parse from landing image
        if not images:
            el = soup.select_one("#landingImage, #imgBlkFront, #main-image")
            if el:
                # data-old-hires has higher resolution
                src = el.get("data-old-hires") or el.get("src", "")
                if src and "sprite" not in src and src not in images:
                    images.append(src)

        # Fallback: og:image meta
        if not images:
            meta = soup.select_one('meta[property="og:image"]')
            if meta and meta.get("content"):
                images.append(meta["content"])

        # Fallback: thumbnail strip
        if not images:
            for thumb in soup.select("#altImages img, .imageThumbnail img"):
                src = thumb.get("src", "")
                if src and "sprite" not in src and "grey-pixel" not in src:
                    # Convert thumbnail to large image URL
                    large = re.sub(r"\._[A-Z]+\d+_\.", "._SL1500_.", src)
                    if large not in images:
                        images.append(large)

        return images

    def _parse_bullets(self, soup: BeautifulSoup) -> list[str]:
        """Extract feature bullet points."""
        bullets: list[str] = []

        container = soup.select_one("#feature-bullets")
        if container:
            for li in container.select("li span.a-list-item"):
                text = li.get_text(strip=True)
                # Skip "Make sure this fits" disclaimer and empty
                if text and "Make sure this fits" not in text and len(text) > 5:
                    bullets.append(text)

        # Fallback: product description bullets
        if not bullets:
            for li in soup.select("#productDescription ul li, .aplus-v2 li"):
                text = li.get_text(strip=True)
                if text and len(text) > 5:
                    bullets.append(text)

        return bullets

    def _parse_description(self, soup: BeautifulSoup) -> str:
        """Extract product description."""
        # Primary: product description div
        el = soup.select_one("#productDescription")
        if el:
            text = _strip_html(str(el))
            if text and len(text) > 20:
                return text

        # A+ content
        aplus = soup.select_one("#aplus, #aplus_feature_div, .aplus-v2")
        if aplus:
            text = _strip_html(str(aplus))
            if text and len(text) > 20:
                return text

        # Meta description
        meta = soup.select_one('meta[name="description"]')
        if meta and meta.get("content"):
            return meta["content"].strip()

        return ""

    def _parse_reviews(self, soup: BeautifulSoup) -> tuple[float | None, int, dict[int, int]]:
        """Extract rating, review count, and rating distribution."""
        rating: float | None = None
        review_count = 0
        distribution: dict[int, int] = {}

        # Rating: "4.5 out of 5 stars"
        el = soup.select_one("#acrPopover span.a-icon-alt, .a-icon-alt")
        if el:
            match = re.search(r"([\d.]+)\s*(?:out of|de|von|sur|di|de)\s*5", el.get_text())
            if match:
                rating = _safe_float(match.group(1))

        # Review count: "1,234 ratings" or "1,234 global ratings"
        el = soup.select_one("#acrCustomerReviewText")
        if el:
            match = re.search(r"([\d,]+)", el.get_text())
            if match:
                review_count = int(match.group(1).replace(",", ""))

        # Rating distribution histogram
        for star in [5, 4, 3, 2, 1]:
            el = soup.select_one(f'#histogramTable tr:nth-child({6 - star}) .a-text-right a, a[title*="{star} star"]')
            if el:
                match = re.search(r"(\d+)%", el.get_text())
                if match and review_count > 0:
                    pct = int(match.group(1))
                    distribution[star] = round(review_count * pct / 100)

        return rating, review_count, distribution

    def _parse_category(self, soup: BeautifulSoup) -> tuple[str, str]:
        """Extract category from breadcrumb."""
        breadcrumbs = soup.select("#wayfinding-breadcrumbs_feature_div li a, .a-breadcrumb li a")
        if breadcrumbs:
            category = breadcrumbs[0].get_text(strip=True) if len(breadcrumbs) > 0 else ""
            subcategory = breadcrumbs[-1].get_text(strip=True) if len(breadcrumbs) > 1 else ""
            return category, subcategory
        return "", ""

    def _parse_seller(self, soup: BeautifulSoup) -> tuple[str, str]:
        """Extract seller name and fulfillment type."""
        seller = ""
        fulfillment = ""

        # Sold by
        el = soup.select_one("#merchant-info, #sellerProfileTriggerId, #tabular-buybox-truncate-1 a")
        if el:
            seller = el.get_text(strip=True)
            seller = re.sub(r"^(Sold by|Ships from|Vendido por)\s*", "", seller, flags=re.IGNORECASE).strip()

        # Fulfillment
        merchant_text = soup.select_one("#merchant-info")
        if merchant_text:
            text = merchant_text.get_text()
            if "Amazon" in text:
                fulfillment = "FBA"
            else:
                fulfillment = "FBM"
        else:
            # Check "Ships from Amazon" in tabular buybox
            for row in soup.select("#tabular-buybox .tabular-buybox-text"):
                text = row.get_text(strip=True)
                if "Amazon" in text:
                    fulfillment = "FBA"
                    break

        return seller, fulfillment

    def _parse_availability(self, soup: BeautifulSoup) -> bool:
        """Check if product is in stock."""
        el = soup.select_one("#availability span, #availability_feature_div span")
        if el:
            text = el.get_text(strip=True).lower()
            out_indicators = ["unavailable", "out of stock", "no disponible", "nicht verfügbar", "agotado"]
            return not any(ind in text for ind in out_indicators)

        # If add to cart button exists, it's in stock
        if soup.select_one("#add-to-cart-button"):
            return True

        return True  # Default to in stock if we can't determine

    def _parse_bsr(self, soup: BeautifulSoup) -> str | None:
        """Extract Best Sellers Rank."""
        # Product details table
        for row in soup.select("#productDetails_detailBullets_sections1 tr"):
            header = row.select_one("th")
            value = row.select_one("td")
            if header and value and "best seller" in header.get_text().lower():
                return value.get_text(strip=True)

        # Detail bullets section
        for li in soup.select("#detailBullets_feature_div li"):
            text = li.get_text()
            if "best seller" in text.lower() or "ranking" in text.lower():
                match = re.search(r"#([\d,]+)", text)
                if match:
                    return match.group(0)

        return None

    def _parse_price_from_scripts(self, raw_html: str) -> tuple[float | None, float | None, float | None]:
        """Try to extract price from embedded script/data in the page source."""
        price: float | None = None
        original_price: float | None = None
        discount: float | None = None

        # Pattern 1: priceAmount in JSON-like structures
        for pattern in [
            r'"priceAmount"\s*:\s*"?([\d.]+)',
            r'"price"\s*:\s*"?([\d.]+)',
            r'"buyingPrice"\s*:\s*"?([\d.]+)',
            r'data-asin-price="([\d.]+)"',
            r'"ourPrice"\s*:\s*\{\s*[^}]*"value"\s*:\s*([\d.]+)',
            r'"priceToPay"\s*:\s*\{\s*[^}]*"value"\s*:\s*([\d.]+)',
        ]:
            match = re.search(pattern, raw_html)
            if match:
                val = _safe_float(match.group(1))
                if val is not None and val > 0:
                    price = val
                    break

        # Pattern 2: savings/original price
        if price:
            for pattern in [
                r'"basisPrice"\s*:\s*\{\s*[^}]*"value"\s*:\s*([\d.]+)',
                r'"listPrice"\s*:\s*\{\s*[^}]*"value"\s*:\s*([\d.]+)',
            ]:
                match = re.search(pattern, raw_html)
                if match:
                    val = _safe_float(match.group(1))
                    if val is not None and val > price:
                        original_price = val
                        discount = round((1 - price / original_price) * 100, 1)
                        break

        return price, original_price, discount

    def _parse_videos(self, raw_html: str) -> list[str]:
        """Extract video URLs from page data."""
        videos: list[str] = []
        # Amazon stores video data in various script formats
        for match in re.finditer(r'"url"\s*:\s*"(https://[^"]*\.mp4[^"]*)"', raw_html):
            url = match.group(1)
            if url not in videos:
                videos.append(url)
        return videos
