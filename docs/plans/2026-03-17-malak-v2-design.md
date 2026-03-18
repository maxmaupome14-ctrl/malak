# Malak AI v2 — Design Document

## Identity

**Malak is not an audit tool. Malak is an AI employee that runs your ecommerce store.**

Competitors report problems. Malak fixes them. You connect your store, Malak's agents optimize your listings, monitor competitors, push changes, and iterate — on autopilot.

## Target Customer

AI-savvy ecommerce sellers. Early adopters. People who want agents working for them 24/7, not another dashboard to stare at.

## Pricing (Okara Model)

- **Free**: Audit only. No account. The hook.
- **$99/mo** or **$1,000 lifetime**: Everything. Store connection, auto-fixes, all agents, auto-pilot, unlimited.

One price. One decision.

## Core Product Flow

### Free Tier (Hook)
1. Paste any product URL → get full audit (score, weaknesses, recommendations)
2. No account needed. Instant value.
3. CTA: "Want Malak to fix these automatically? Connect your store."

### Paid Tier (The Product)
1. **Connect Store** — Shopify OAuth, MercadoLibre OAuth, Walmart API
2. **Malak scans everything** — scrapes all listings, scores them, prioritizes
3. **Approval Mode** (default) — Malak generates fixes, shows diffs, you click Approve
4. **Auto-Pilot Mode** (earned trust) — set rules, Malak runs autonomously
5. **Monitor & Iterate** — Sentinel watches 24/7, re-optimizes as needed

## Agent Architecture (What They DO, Not Report)

| Agent | Reports (Free) | DOES (Paid) |
|-------|----------------|-------------|
| **Scout** | Scrapes product data | Scrapes ALL store listings on schedule |
| **Auditor** | Scores listing quality | Prioritizes which listings to fix first |
| **Copywriter** | Shows optimized copy | **Pushes new titles/descriptions to store** |
| **Spy** | Shows competitor data | Alerts when competitors change, auto-adjusts |
| **Strategist** | Shows action plan | **Executes the plan automatically** |
| **Sentinel** | N/A | **24/7 monitoring, triggers re-optimization** |
| **Logistics** | Shows fulfillment analysis | Recommends fulfillment changes with ROI |

## Store Integrations (Priority Order)

1. **Shopify** — Admin API, OAuth. Clean, fast. 70% of indie ecommerce. FIRST.
2. **MercadoLibre** — Public API, OAuth. Easy win. Latin America market.
3. **Walmart** — Marketplace API. Easier than Amazon. Good reach.
4. **Amazon** — SP-API. Hard (brand registry, restricted). Coming later.

## What "Push to Store" Means (Shopify)

Via Shopify Admin API:
- Update product title
- Update product description (body_html)
- Update SEO title & description (metafields)
- Update tags / search terms
- Update images (alt text, ordering)
- Update variant pricing (if rules allow)

All changes logged. Reversible. Diffed before/after.

## Frontend

- Hosted at wop.partners/malak
- Match wop.partners theme/brand
- Dark, technical but clean
- Priority: WORKS FIRST, polish second

### Key Pages
1. **Landing** — URL input (free audit hook), value prop, pricing
2. **Audit Results** — existing 4-tab UI (working)
3. **Dashboard** — connected stores, listing health, agent activity feed
4. **Store Connection** — OAuth flow for Shopify/ML/Walmart
5. **Listing Manager** — all products, scores, pending fixes, approve/reject
6. **Settings** — billing (Stripe), auto-pilot rules, notifications

## Payments (Stripe)

- Stripe Checkout for subscription ($99/mo)
- Stripe Checkout for lifetime ($1,000 one-time)
- Stripe Customer Portal for management
- Webhook for subscription status updates
- Grace period on failed payments

## Tech Stack (What We Have)

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + arq (Redis)
- **Frontend**: Next.js 15 + React
- **Scraping**: httpx (Shopify JSON), Playwright (Amazon/Walmart later)
- **LLM**: OpenAI gpt-4o (or Claude via Anthropic SDK)
- **Payments**: Stripe
- **Auth**: fastapi-users (JWT)
- **Deploy**: Docker Compose → Railway/Fly.io

## Build Priority

### Phase 1: Core Product (NOW)
- [ ] Shopify OAuth store connection
- [ ] Shopify Admin API write integration
- [ ] Listing manager UI (approve/reject changes)
- [ ] Stripe subscription + lifetime deal
- [ ] Dashboard with real data
- [ ] Login/register working
- [ ] Frontend polish

### Phase 2: Auto-Pilot
- [ ] Auto-pilot mode with rules engine
- [ ] Sentinel monitoring loop
- [ ] Change history / audit log
- [ ] Notification system (email alerts)

### Phase 3: Multi-Marketplace
- [ ] MercadoLibre OAuth + push
- [ ] Walmart API + push
- [ ] Cross-marketplace sync

### Phase 4: Growth
- [ ] Amazon SP-API
- [ ] Team seats / agency mode
- [ ] White-label reports
- [ ] Affiliate program
