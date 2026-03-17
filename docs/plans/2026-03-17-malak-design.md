# Malak AI — Design Document

**Date:** 2026-03-17
**Author:** Max Nicolas Maupome
**Status:** Draft

---

## Overview

Malak AI is an open-source AI-powered Chief Marketing Officer for ecommerce sellers. It automates the tedious, time-consuming parts of ecommerce marketing: competitive analysis, listing optimization, copywriting, and market monitoring.

## Problem Statement

Ecommerce sellers (Amazon, Shopify, Walmart, MercadoLibre) spend 5-15 hours per week on:
1. Manually checking competitor prices and listings
2. Trying to optimize product titles and descriptions with guesswork
3. Reacting to market changes instead of proactively monitoring
4. Paying for expensive tools that give dashboards but not action

Existing tools either:
- Cost $200-500/month (Helium 10, Jungle Scout, Sellics)
- Only work on one platform (usually Amazon)
- Give you data but not action (charts, not copy you can use)
- Are closed source with no self-hosting option

## Solution

Malak is different because:
1. **Open source** — self-host it, audit it, extend it
2. **Agent-based** — AI agents that do the work, not just show you data
3. **Multi-platform** — Amazon, Shopify, Walmart, MercadoLibre from day one
4. **Action-oriented** — generates copy you can paste, not charts you have to interpret

## Architecture

### Agent System

Six specialized agents, each with a clear responsibility:

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| Scout | Universal Scraper | URL | Structured product data |
| Auditor | Listing Analyzer | Product data | Quality scores + weaknesses |
| Spy | Competitive Intel | Product/keywords | Competitor data + market insights |
| Strategist | Action Planner | Audit + intel | Prioritized action plan |
| Copywriter | Copy Generator | Product + audit + strategy | Optimized copy variants |
| Sentinel | 24/7 Monitor | Store config | Change detection + alerts |

### Data Flow

```
User pastes URL
    → Scout (scrape)
    → Auditor (analyze)
    → Spy (competitors) [parallel with Auditor]
    → Strategist (plan)
    → Copywriter (generate)
    → User gets report + optimized copy
```

### Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2
- **Database:** PostgreSQL 16 (JSONB for flexible product data)
- **Queue:** Valkey (Redis-compatible) + arq
- **Scraping:** Playwright + BeautifulSoup4
- **AI:** OpenAI GPT-4o (pluggable — any OpenAI-compatible API)
- **Auth:** FastAPI-Users with JWT

### Database Schema

Key tables:
- `users` — accounts (via fastapi-users)
- `stores` — connected ecommerce stores
- `products` — scraped product data (JSONB for flexibility)
- `audit_results` — audit reports with scores and recommendations

### Scraping Strategy

1. **Playwright for JS-heavy sites** (Amazon, Walmart) — handles dynamic content and anti-bot
2. **httpx for API-friendly sites** (Shopify JSON API, MercadoLibre API)
3. **Fallback chain:** API → Static HTML → Playwright → Proxy API (ScraperAPI)
4. **Anti-bot measures:** Stealth mode, random delays, proxy rotation, browser fingerprint randomization

## MVP Scope (v0.1)

1. Paste a URL → get an audit report
2. Amazon scraping (US marketplace)
3. Basic listing scoring (title, images, price, reviews)
4. LLM-generated recommendations
5. LLM-generated optimized copy (title + bullets)
6. User accounts with JWT auth
7. Docker self-hosting

## Post-MVP Roadmap

### v0.2 — Multi-platform
- Shopify scraper
- Walmart scraper
- MercadoLibre scraper

### v0.3 — Competitive Intelligence
- Spy agent implementation
- Competitor tracking dashboard
- Price monitoring

### v0.4 — Monitoring
- Sentinel agent implementation
- Email/webhook alerts
- Scheduled monitoring jobs

### v0.5 — API Integrations
- Amazon SP-API integration
- Shopify Admin API integration
- Direct listing updates from Malak

### v1.0 — Production Ready
- Browser extension
- Team/organization support
- Advanced analytics
- Custom AI model fine-tuning

## Design Decisions

### Why JSONB for product data?
Each platform has different fields. Amazon has BSR and bullet points, Shopify has variants and collections, MercadoLibre has questions. JSONB lets us store platform-specific data without 50+ nullable columns.

### Why Valkey over Redis?
Valkey is the community fork of Redis after the license change. Fully compatible, truly open source (BSD), actively maintained by the Linux Foundation.

### Why FastAPI-Users?
Battle-tested auth that handles registration, login, password reset, email verification, and user management out of the box. No need to roll our own.

### Why arq for task queue?
Lightweight, async-native, Redis-based. Celery is overkill for our use case and doesn't play well with async Python.

### Why not a SaaS?
The ecommerce tool market charges $200-500/month for what should be commodity intelligence. Open source democratizes access. Self-hosting means your product data never leaves your servers.

---

*This is a living document. Updated as the project evolves.*
