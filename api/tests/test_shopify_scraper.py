"""
Tests for the Shopify scraper — URL handling and data parsing.

Focuses on deterministic, offline-testable logic:
- can_handle() URL matching
- extract_handle() URL parsing
- _strip_html() sanitisation
- _parse_json() response mapping
"""

from __future__ import annotations

import pytest

from src.scrapers.shopify import ShopifyScraper, extract_handle, _strip_html


@pytest.fixture
def scraper() -> ShopifyScraper:
    return ShopifyScraper()


# ------------------------------------------------------------------ #
# can_handle()
# ------------------------------------------------------------------ #


class TestCanHandle:
    """Verify URL routing logic."""

    def test_can_handle_myshopify_url(self, scraper: ShopifyScraper) -> None:
        url = "https://my-cool-store.myshopify.com/products/blue-widget"
        assert scraper.can_handle(url) is True

    def test_can_handle_custom_domain(self, scraper: ShopifyScraper) -> None:
        url = "https://www.custom-brand.com/products/fancy-sneaker"
        assert scraper.can_handle(url) is True

    def test_cannot_handle_amazon(self, scraper: ShopifyScraper) -> None:
        url = "https://www.amazon.com/dp/B09V3KXJPB"
        assert scraper.can_handle(url) is False

    def test_cannot_handle_random_site(self, scraper: ShopifyScraper) -> None:
        url = "https://www.nytimes.com/2024/01/01/some-article"
        assert scraper.can_handle(url) is False

    def test_can_handle_myshopify_root(self, scraper: ShopifyScraper) -> None:
        """myshopify.com domain is always Shopify, even without /products/."""
        url = "https://demo-store.myshopify.com/collections/all"
        assert scraper.can_handle(url) is True

    def test_cannot_handle_empty_string(self, scraper: ShopifyScraper) -> None:
        assert scraper.can_handle("") is False


# ------------------------------------------------------------------ #
# extract_handle()
# ------------------------------------------------------------------ #


class TestExtractHandle:
    """Verify product handle extraction from various URL shapes."""

    def test_extract_handle_standard(self) -> None:
        url = "https://store.myshopify.com/products/blue-widget"
        assert extract_handle(url) == "blue-widget"

    def test_extract_handle_with_collection(self) -> None:
        url = "https://example.com/collections/summer/products/red-dress"
        assert extract_handle(url) == "red-dress"

    def test_extract_handle_with_query_params(self) -> None:
        url = "https://store.myshopify.com/products/blue-widget?variant=12345&utm_source=ig"
        assert extract_handle(url) == "blue-widget"

    def test_extract_handle_trailing_slash(self) -> None:
        url = "https://store.myshopify.com/products/blue-widget/"
        assert extract_handle(url) == "blue-widget"

    def test_extract_handle_with_fragment(self) -> None:
        url = "https://store.myshopify.com/products/blue-widget#reviews"
        assert extract_handle(url) == "blue-widget"

    def test_extract_handle_no_match(self) -> None:
        url = "https://www.amazon.com/dp/B09V3KXJPB"
        assert extract_handle(url) is None

    def test_extract_handle_underscore(self) -> None:
        url = "https://example.com/products/my_cool_product"
        assert extract_handle(url) == "my_cool_product"


# ------------------------------------------------------------------ #
# _strip_html()
# ------------------------------------------------------------------ #


class TestStripHtml:
    """Verify HTML tag stripping utility."""

    def test_strips_tags(self) -> None:
        assert _strip_html("<p>Hello <b>world</b></p>") == "Hello world"

    def test_decodes_entities(self) -> None:
        assert _strip_html("5&amp;10 &lt;store&gt;") == "5&10 <store>"

    def test_empty_input(self) -> None:
        assert _strip_html("") == ""

    def test_none_like(self) -> None:
        # The function guards against falsy values.
        assert _strip_html("") == ""

    def test_multiline(self) -> None:
        html = "<p>Line one</p>\n<p>Line two</p>"
        result = _strip_html(html)
        assert "Line one" in result
        assert "Line two" in result


# ------------------------------------------------------------------ #
# _parse_json()
# ------------------------------------------------------------------ #


class TestParseJson:
    """Verify JSON-to-ScrapedProduct mapping with realistic payloads."""

    @pytest.fixture
    def sample_product_json(self) -> dict:
        """Minimal but realistic Shopify product JSON payload."""
        return {
            "id": 7890123456,
            "title": "Classic Blue Widget",
            "vendor": "Widget Co",
            "product_type": "Widgets",
            "body_html": "<p>A <strong>great</strong> widget.</p>",
            "tags": ["blue", "widget", "sale"],
            "images": [
                {"id": 1, "src": "https://cdn.shopify.com/img1.jpg"},
                {"id": 2, "src": "https://cdn.shopify.com/img2.jpg"},
            ],
            "variants": [
                {
                    "id": 111,
                    "title": "Small",
                    "price": "19.99",
                    "compare_at_price": "29.99",
                    "available": True,
                },
                {
                    "id": 222,
                    "title": "Large",
                    "price": "24.99",
                    "compare_at_price": None,
                    "available": False,
                },
            ],
        }

    def test_basic_fields(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://example.com/products/classic-blue-widget", sample_product_json)
        assert product.title == "Classic Blue Widget"
        assert product.brand == "Widget Co"
        assert product.platform == "shopify"
        assert product.platform_id == "7890123456"
        assert product.category == "Widgets"

    def test_pricing_picks_cheapest(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://x.com/products/w", sample_product_json)
        assert product.price == 19.99
        assert product.original_price == 29.99
        assert product.discount_percent is not None
        assert abs(product.discount_percent - 33.3) < 0.2

    def test_in_stock_if_any_variant_available(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://x.com/products/w", sample_product_json)
        assert product.in_stock is True

    def test_out_of_stock_all_unavailable(
        self, scraper: ShopifyScraper
    ) -> None:
        data = {
            "id": 1,
            "title": "Gone",
            "variants": [
                {"price": "10.00", "available": False},
            ],
        }
        product = scraper._parse_json("https://x.com/products/gone", data)
        assert product.in_stock is False

    def test_images_extracted(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://x.com/products/w", sample_product_json)
        assert len(product.images) == 2
        assert "img1.jpg" in product.images[0]

    def test_description_html_stripped(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://x.com/products/w", sample_product_json)
        assert "<" not in product.description
        assert "great" in product.description

    def test_tags_as_search_terms(
        self, scraper: ShopifyScraper, sample_product_json: dict
    ) -> None:
        product = scraper._parse_json("https://x.com/products/w", sample_product_json)
        assert "blue" in product.search_terms
        assert "sale" in product.search_terms

    def test_missing_fields_no_crash(self, scraper: ShopifyScraper) -> None:
        """A nearly-empty payload should still produce a valid ScrapedProduct."""
        data: dict = {"id": 42, "title": "Bare Bones"}
        product = scraper._parse_json("https://x.com/products/bb", data)
        assert product.title == "Bare Bones"
        assert product.price is None
        assert product.images == []
        assert product.description == ""
        assert product.in_stock is False  # no variants -> nothing available

    def test_tags_as_csv_string(self, scraper: ShopifyScraper) -> None:
        """Some Shopify responses return tags as a comma-separated string."""
        data = {"id": 1, "title": "T", "tags": "red, green, blue"}
        product = scraper._parse_json("https://x.com/products/t", data)
        assert product.search_terms == ["red", "green", "blue"]
