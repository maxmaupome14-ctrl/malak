<p align="center">
  <img src="web/public/malak-logo.svg" alt="Malak AI" width="200" />
</p>

<h1 align="center">Malak AI</h1>

<p align="center">
  <strong>Your AI Chief Marketing Officer for Ecommerce</strong>
</p>

<p align="center">
  <a href="https://github.com/maxnmcl/malak/actions"><img src="https://img.shields.io/github/actions/workflow/status/maxnmcl/malak/ci.yml?branch=main&style=flat-square" alt="CI" /></a>
  <a href="https://github.com/maxnmcl/malak/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maxnmcl/malak?style=flat-square" alt="License" /></a>
  <a href="https://github.com/maxnmcl/malak/stargazers"><img src="https://img.shields.io/github/stars/maxnmcl/malak?style=flat-square" alt="Stars" /></a>
  <a href="https://discord.gg/malak-ai"><img src="https://img.shields.io/discord/000000000000000000?style=flat-square&label=discord" alt="Discord" /></a>
  <a href="https://github.com/maxnmcl/malak/releases"><img src="https://img.shields.io/github/v/release/maxnmcl/malak?style=flat-square" alt="Release" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#self-hosting">Self-Hosting</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#agents">Agents</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

<br />

<!-- TODO: Replace with actual demo GIF -->
<p align="center">
  <img src="https://placehold.co/800x450/1a1a2e/e94560?text=Demo+Coming+Soon" alt="Malak AI Demo" width="800" />
</p>

<br />

---

## What is Malak?

**Malak** is an open-source AI-powered marketing intelligence platform built for ecommerce sellers. It acts as your autonomous Chief Marketing Officer — scraping competitors, auditing your listings, generating optimized copy, and monitoring your market 24/7.

Paste a product URL. Malak's agents take it from there.

> **Malak** (Arabic: ملاك) means "angel" — your guardian angel for ecommerce.

### The Problem

Ecommerce sellers spend **hours every week** manually:
- Checking competitor prices and listings
- Optimizing product titles, bullets, and descriptions
- Tracking keyword rankings and market shifts
- Trying to figure out why sales dropped

### The Solution

Malak deploys a team of **seven specialized AI agents** that work together to give you an unfair advantage:

```
You paste a URL → Malak scrapes, analyzes, strategizes, and writes → You copy, paste, profit.
```

---

## Features

### Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| **Instant Audit** | Paste any product URL, get a full marketing audit in seconds | 🔜 |
| **Multi-Platform** | Amazon, Shopify, Walmart, MercadoLibre — and growing | 🔜 |
| **AI Copywriting** | SEO-optimized titles, bullets, and descriptions generated for you | 🔜 |
| **Competitive Intel** | Track competitor pricing, reviews, and listing changes | 🔜 |
| **24/7 Monitoring** | Get alerted when competitors change prices or new players enter | 🔜 |
| **Action Plans** | Concrete, prioritized recommendations — not vague advice | 🔜 |

### What Makes Malak Different

- **Self-hostable** — Your data stays on your servers. No SaaS lock-in.
- **Agent-based architecture** — Each agent is specialized. They collaborate, not compete.
- **Open source** — Audit the code. Extend it. Make it yours.
- **Multi-marketplace** — Not just Amazon. Any ecommerce platform.
- **Actionable output** — Not dashboards full of charts. Concrete copy you can use *today*.

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- An OpenAI API key (or compatible LLM provider)

### 1. Clone the repo

```bash
git clone https://github.com/maxnmcl/malak.git
cd malak
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

### 3. Start everything

```bash
docker compose up -d
```

### 4. Open the app

Navigate to [http://localhost:3000](http://localhost:3000) and paste your first product URL.

That's it. Three commands to your AI CMO.

---

## Self-Hosting

Malak is designed to be self-hosted from day one. The `docker-compose.yml` includes everything you need:

| Service | Port | Description |
|---------|------|-------------|
| **web** | 3000 | Next.js frontend |
| **api** | 8000 | FastAPI backend |
| **postgres** | 5432 | PostgreSQL 16 database |
| **valkey** | 6379 | Valkey (Redis-compatible) for task queue + caching |

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 10 GB | 50+ GB |
| OS | Any Docker-compatible | Linux (Ubuntu 22.04+) |

### Production Deployment

For production, we recommend:

1. **Reverse proxy** — Put Nginx or Caddy in front for HTTPS
2. **External database** — Use a managed PostgreSQL instance
3. **Backups** — Set up automated database backups
4. **Monitoring** — Connect to your observability stack

```bash
# Production example with external services
DATABASE_URL=postgresql+asyncpg://user:pass@your-db-host:5432/malak
VALKEY_URL=redis://your-valkey-host:6379/0
docker compose up -d api web
```

---

## Architecture

<!-- TODO: Replace with actual architecture diagram -->
```
┌─────────────────────────────────────────────────────────────┐
│                        MALAK AI                              │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                       │
│    Next.js Frontend  │         FastAPI Backend               │
│    (TypeScript)      │         (Python)                      │
│                      │                                       │
│  ┌────────────────┐  │  ┌──────────────────────────────┐    │
│  │  Dashboard      │  │  │  Agent Orchestrator           │    │
│  │  Audit View     │──┤  │                               │    │
│  │  Reports        │  │  │  ┌───────┐ ┌──────────┐      │    │
│  │  Settings       │  │  │  │ Scout │ │ Auditor  │      │    │
│  └────────────────┘  │  │  └───────┘ └──────────┘      │    │
│                      │  │  ┌───────┐ ┌──────────┐      │    │
│                      │  │  │  Spy  │ │Strategist│      │    │
│                      │  │  └───────┘ └──────────┘      │    │
│                      │  │  ┌──────────┐ ┌──────────┐   │    │
│                      │  │  │Copywriter│ │ Sentinel │   │    │
│                      │  │  └──────────┘ └──────────┘   │    │
│                      │  │  ┌──────────┐                │    │
│                      │  │  │Logistics │                │    │
│                      │  │  └──────────┘                │    │
│                      │  └──────────────────────────────┘    │
│                      │                                       │
├──────────────────────┴──────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │ PostgreSQL 16 │    │    Valkey     │                      │
│  │  (Data Store) │    │ (Task Queue) │                      │
│  └──────────────┘    └──────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15, TypeScript, Tailwind CSS | Fast, typed, great DX |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2 | Async-native, fast, validated |
| Database | PostgreSQL 16 with JSONB | Flexible schema for product data |
| Queue | Valkey + arq | Redis-compatible, async task processing |
| Scraping | Playwright + BeautifulSoup4 | JS-rendered pages + HTML parsing |
| AI | OpenAI GPT-4 (pluggable) | Best reasoning, swappable for any LLM |
| Auth | FastAPI-Users + JWT | Battle-tested auth, zero config |

---

## Agents

Malak's power comes from its **seven specialized AI agents**, each designed for a specific domain of ecommerce marketing intelligence.

### 🔍 Scout
> *The Universal Scraper*

Extracts structured product data from any ecommerce platform. Handles JavaScript-rendered pages, pagination, anti-bot measures, and data normalization.

**Capabilities:** Product details, pricing, images, reviews, seller info, category data

### 📊 Auditor
> *The Listing Analyzer*

Takes scraped product data and performs a comprehensive marketing audit. Evaluates title optimization, image quality, pricing strategy, review sentiment, and SEO effectiveness.

**Capabilities:** Listing score, keyword analysis, competitive positioning, improvement priorities

### 🕵️ Spy
> *The Competitive Intelligence Agent*

Monitors competitors and builds market intelligence. Tracks pricing changes, new product launches, review velocity, and market share shifts.

**Capabilities:** Competitor tracking, price history, market trends, opportunity detection

### 🧠 Strategist
> *The Action Planner*

Synthesizes insights from Scout, Auditor, and Spy into concrete, prioritized action plans. No fluff — just what to do, in what order, and why.

**Capabilities:** Priority ranking, ROI estimation, timeline planning, A/B test suggestions

### ✍️ Copywriter
> *The Optimization Engine*

Generates SEO-optimized product copy based on Auditor's analysis and Strategist's plan. Writes titles, bullet points, descriptions, and A+ content.

**Capabilities:** Title optimization, bullet points, descriptions, keyword integration, A/B variants

### 👁️ Sentinel
> *The 24/7 Monitor*

Continuously watches your market. Detects competitor price changes, new entrants, review anomalies, and ranking shifts. Sends alerts when action is needed.

**Capabilities:** Real-time monitoring, anomaly detection, alert triggers, trend tracking

### 📦 Logistics
> *The Fulfillment Optimizer*

Analyzes shipping, delivery, and fulfillment strategy from public listing data. Compares your fulfillment against competitors, detects FBA/FBM/WFS, and identifies logistics gaps killing your conversions.

**Capabilities:** Fulfillment type detection, shipping competitiveness, delivery speed gaps, return signal analysis, multi-channel opportunities

---

## Development

### Backend (API)

```bash
cd api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Start the dev server
uvicorn src.main:app --reload --port 8000
```

### Frontend (Web)

```bash
cd web

# Install dependencies
npm install

# Start the dev server
npm run dev
```

### Running Tests

```bash
# Backend tests
cd api && pytest

# Frontend tests
cd web && npm test
```

---

## Roadmap

- [x] Project scaffolding and architecture
- [ ] Scout agent — universal scraper with Amazon support
- [ ] Auditor agent — listing analysis engine
- [ ] Instant audit flow (paste URL → get report)
- [ ] User authentication and multi-tenancy
- [ ] Dashboard with audit history
- [ ] Spy agent — competitive monitoring
- [ ] Copywriter agent — AI-generated optimized copy
- [ ] Strategist agent — action plan generation
- [ ] Sentinel agent — 24/7 monitoring with alerts
- [ ] Logistics agent — fulfillment optimization and shipping analysis
- [ ] Shopify, Walmart, MercadoLibre scraper support
- [ ] API integrations (Amazon SP-API, Shopify API)
- [ ] Browser extension for instant audits
- [ ] Mobile app

---

## Contributing

We welcome contributions! Malak is built by the community, for the community.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feat/amazing-feature`)
5. **Open** a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Adding tests
- `chore:` — Maintenance

### Development Guidelines

- Backend code follows **PEP 8** and uses **type hints** everywhere
- Frontend code uses **TypeScript strict mode**
- All new features need **tests**
- Agent implementations should follow the `BaseAgent` interface
- Scraper implementations should follow the `BaseScraper` interface

---

## Support

- [GitHub Issues](https://github.com/maxnmcl/malak/issues) — Bug reports and feature requests
- [Discord](https://discord.gg/malak-ai) — Community chat and support
- [Discussions](https://github.com/maxnmcl/malak/discussions) — Ideas and Q&A

---

## License

Malak is open source under the [MIT License](LICENSE).

---

<p align="center">
  Built with obsession by <a href="https://github.com/maxnmcl">Max</a>
</p>
