# Kansa Amazon Optimizer — Product Design

**Date:** 2026-03-19
**Authors:** Max + Diego (meeting), Claude (design)
**Status:** Approved for implementation

---

## 1. Product Architecture

**Kansa** is the platform brand. Products live under it:

```
KANSA (platform)
 ├── Amazon Optimizer    ← v1, building NOW
 ├── Walmart Optimizer   ← future (when measurable)
 ├── MercadoLibre Optimizer ← future
 └── [future products]
```

One account, one token wallet across all products.

---

## 2. Amazon Optimizer — Core Loop

```
Paste URL → Audit (FREE) → Fix (TOKENS) → Connect Seller Central → 30-Day Report (PROOF)
```

### User Journey
1. **Paste Amazon URL** — no account, no signup, any marketplace (.com, .com.mx, .de, .co.jp, etc.)
2. **See full audit** — 6 category scores, every issue detailed, all free
3. **Hit "Fix"** on any issue — prompted to create account + buy tokens
4. **Fix applies** via AI (Claude Opus 4.6) — before/after diff shown
5. **Connect Seller Central** — unlocks 30-day measurement + bulk tools
6. **Dashboard tracks** rank, sales, conversion changes over time

### The Pitch
> "Optimize your Amazon listing in any country. Prove it worked in 30 days."

---

## 3. What Makes This Not a Scam (Unlike Okara)

**Measurement.** Amazon gives hard data:
- BSR (Best Seller Rank) — tracked daily via Seller Central API
- Sessions & conversion rate — exact numbers
- Revenue — actual dollars
- Keyword ranking — position for specific terms
- Click-through rate — impressions to clicks

**30-day report:** "We fixed your title on March 20. In 30 days: sessions +34%, conversion +12%, revenue +$2,400."

New platforms only get added when we can answer: **"What metric proves the fix worked?"**

---

## 4. Global Amazon Coverage

| Marketplace | Domain | Currency |
|------------|--------|----------|
| US | amazon.com | USD |
| Mexico | amazon.com.mx | MXN |
| Brazil | amazon.com.br | BRL |
| UK | amazon.co.uk | GBP |
| Germany | amazon.de | EUR |
| Spain | amazon.es | EUR |
| France | amazon.fr | EUR |
| Italy | amazon.it | EUR |
| Japan | amazon.co.jp | JPY |
| India | amazon.in | INR |
| UAE | amazon.ae | AED |
| Saudi Arabia | amazon.sa | SAR |
| Australia | amazon.com.au | AUD |
| Canada | amazon.ca | CAD |

Audit is **marketplace-aware** — a listing on .com.mx gets scored against Mexican search behavior, Spanish keywords, MXN price positioning. Not US defaults.

---

## 5. Audit Engine (FREE)

### 6 Scoring Categories

| Category | What It Scores | Fixit Action | Token Cost |
|----------|---------------|--------------|------------|
| **Title** | Keywords, length, structure, brand position | Rewrite title | 5 |
| **Bullets** | Completeness, benefits vs features, keywords | Rewrite bullets | 8 |
| **Description** | A+ content quality, keyword density, structure | Rewrite description | 8 |
| **Images** | Count, quality, infographics, lifestyle shots | Image suggestions | 3 |
| **Keywords** | Backend/hidden keywords, gaps, missed terms | Keyword optimization list | 5 |
| **Competitive** | Price position, review gap, rank, market share | Strategy report | 10 |

### Audit Output
- Each category: **score (0-100)** + **color bar** (red/yellow/green)
- Each issue: **specific problem** + **impact level** (high/med/low) + **"Fix →" button with token cost**
- **"Fix All" button** at top = sum of all individual fix costs (whale bait)
- Full detail shown free — nothing gated. The audit is marketing. The Fix is the product.

### AI Model
- **Claude Opus 4.6** for all audits — best quality, Diego's requirement
- Cost: ~$0.02-0.05 per audit (pennies, Kansa eats it)
- No BYOK. No user API keys. Kansa pays, Kansa charges tokens.

---

## 6. Fixit Token System

### Token = Kansa's Currency (Not LLM Tokens)
Like arcade tokens. Buy packs, spend on fixes.

### Pricing

| Pack | Price | Tokens | Per-Token |
|------|-------|--------|-----------|
| Starter | $9 | 30 | $0.30 |
| Pro | $29 | 120 | $0.24 |
| Beast | $99 | 500 | $0.20 |
| Agency | $299 | 2,000 | $0.15 |

### Mechanics
- **First 10 tokens free** — enough to fix ONE thing, get hooked
- **Tokens never expire** — removes purchase anxiety
- **Every fix shows before/after diff** — dopamine hit
- **Low balance nudge** — "3 tokens remaining. 2 issues left unfixed."
- **Token wallet is platform-wide** — same balance across future Kansa products

### Revenue Model
- Zero subscriptions at launch. Pure consumption.
- No ceiling — power seller with 200 listings burns thousands of tokens
- AI cost per fix: ~$0.05 (Opus 4.6). Token price: $0.15-0.30. **3-6x margin.**

---

## 7. Seller Central Integration

### Purpose
- Pull real sales data for 30-day measurement
- Access backend keywords, advertising data
- Enable bulk listing optimization

### Data Points
- BSR history
- Sessions, page views, conversion rate
- Revenue, units sold
- Keyword rankings (via Advertising API)
- Buy Box percentage

### Flow
1. User connects Seller Central via OAuth (SP-API)
2. Kansa snapshots current metrics for all listings
3. After any Fix, tracking begins automatically
4. 30-day report generated and emailed

---

## 8. Competitive Intelligence (Jungle Scout API)

### Purpose
Feed real market data into audit reasoning. Not vibes — data.

### Data Points
- Estimated monthly revenue for competitors
- Search volume for keywords
- Market share by category
- Historical BSR trends
- Review velocity

### How It's Used
- Audit's "Competitive" category powered by real data
- Keyword suggestions based on actual search volume
- Price positioning against real competitor revenue

---

## 9. Tech Stack

- **Frontend:** Next.js App Router, React, inline styles (no Tailwind), dark theme
- **Backend:** FastAPI (Python 3.11), PostgreSQL 16, Valkey (Redis)
- **AI:** Claude Opus 4.6 (audits + fixes), no BYOK
- **Scraping:** Amazon HTML scraping (existing, works globally)
- **APIs:** Amazon SP-API (Seller Central), Jungle Scout API
- **Payments:** Stripe (token pack purchases)
- **Infra:** Docker Compose (dev), production TBD

---

## 10. Implementation Priority

### Phase 1 — Core (Ship First)
1. New audit format (6 categories, scored, with Fix buttons)
2. Fixit engine (apply AI fixes, show before/after)
3. Token system (wallet, purchase, deduction)
4. Stripe integration (token pack checkout)
5. New landing page ("Kansa Amazon Optimizer")

### Phase 2 — Measurement
6. Seller Central OAuth (SP-API)
7. Metric snapshot on fix
8. 30-day tracking dashboard
9. Report generation + email

### Phase 3 — Intelligence
10. Jungle Scout API integration
11. Real competitive data in audits
12. Keyword research powered by search volume

### Phase 4 — Scale
13. Bulk listing optimizer
14. Multi-marketplace keyword translation
15. A/B testing suggestions
16. Seller analytics dashboard

---

## 11. Competitive Landscape

| Competitor | Price | Why Kansa Wins |
|-----------|-------|----------------|
| Helium 10 | $129-359/mo | US-centric, AI is bolt-on, no measurement proof |
| Jungle Scout | $29-399/mo | US-centric, basic AI, no one-click fix |
| Okara AI CMO | $99/mo | SEO/web only, no measurement = vibes = scam |
| Triple Whale | $129-4,489/mo | DTC/Shopify only, attribution not optimization |

### Kansa's Moat
1. **Global** — 14 Amazon marketplaces, marketplace-aware scoring
2. **Measurable** — 30-day proof, not vibes
3. **One-click Fix** — not suggestions, actual rewrites applied
4. **Token model** — no subscription ceiling, consumption scales
5. **Platform play** — Amazon first, expand to any marketplace with measurable data
