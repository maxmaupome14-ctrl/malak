# External API Research

## Recommendation: Jungle Scout + Keepa (Two-API Combo)

No single API covers all needs. JS has no historical BSR/price. Keepa has no keyword volume.

## Jungle Scout API
- **Auth:** `Authorization: KEY_NAME:API_KEY` + `X-API-Type: junglescout`
- **Base URL:** `https://developer.junglescout.com`
- **Markets:** US, UK, DE, IN, CA, FR, IT, ES, MX, JP
- **Key endpoints:**
  - Keywords by ASIN (POST) — keyword rankings for up to 10 ASINs
  - Keywords by Keyword (POST) — search volume, competition, PPC data
  - Historical Search Volume (GET) — weekly data, up to 1 year
  - Product Database (POST) — 30+ data points: BSR, sales estimates, revenue, reviews
  - Sales Estimates (GET) — daily granularity units sold + pricing
- **Pricing:** $29/mo (1K calls), $99/mo (4K), $199/mo (10K). Requires JS subscription.
- **Rate limit:** 300 req/min

## Keepa API
- **Auth:** Query param `key=YOUR_KEY`
- **Base URL:** `https://api.keepa.com`
- **Key data:**
  - Full price history (Amazon, 3P, Buy Box, etc.)
  - Full BSR history (time series)
  - `monthlySold` — actual Amazon bought-past-month (not estimate!)
  - Live offers, buy box history
- **Pricing:** 19 EUR/mo basic, 49 EUR for 20 tokens/min
- **Rate limit:** Token-gated (tokens/minute from plan)

## Amazon PA-API 5.0
- **DEPRECATING April 30, 2026** — being replaced by Creators API
- Free but requires Amazon Associates account + affiliate sales
- No search volume, no sales estimates — limited value
- **Skip this.**

## Helium 10 API
- Enterprise plan only, custom pricing, no self-serve
- **Not practical.**

## Amazon SP-API (Selling Partner)
- For actual sellers — access YOUR sales data only
- Useful for: 30-day measurement (BSR, sessions, conversion, revenue)
- Search Query Performance reports for keyword data
- **Use this for the measurement layer, not the audit layer**

## Canopy API
- Free tier: 100 req/month
- Just scraping, no proprietary data (no keyword volume, no sales estimates)
- **Not useful enough**

## Integration Priority
1. Ship without paid APIs (scraping + Opus 4.6 = solid audit)
2. Add Jungle Scout when revenue > $50/mo (keyword volumes in audit)
3. Add Keepa when revenue > $100/mo (BSR tracking for measurement)
4. Add SP-API when sellers connect (30-day proof)
