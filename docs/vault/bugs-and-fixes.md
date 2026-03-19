# Bugs & Fixes

## Python 3.14 breaks fastapi-users
**Error:** `ImportError: cannot import name 'SQLAlchemyBaseUserTableUUID' from 'fastapi_users.db'`
**Fix:** Must use Python 3.11 (`py -3.11`). Never run API with 3.14.

## MercadoLibre API 403
**Error:** Public API (`api.mercadolibre.com`) returns 403 PolicyAgent geo-block
**Fix:** Rewrote to HTML scraping + initialState JSON parsing (2026-03-19)

## Stale .pyc bytecode
**Symptom:** `--reload` serves old code after file changes
**Fix:** Delete `__pycache__/*.pyc` files and restart uvicorn

## httpx brotli decode failure
**Symptom:** Response decode error when `Accept-Encoding: br` is set
**Fix:** Don't set `Accept-Encoding` header — let httpx handle it

## Store credentials access
**Error:** `AttributeError: 'Store' object has no attribute 'access_token'`
**Fix:** Always use `(store.credentials or {}).get("access_token")`, never `store.access_token`

## Optimization "Try again" error
**Error:** Generic "Optimization failed. Try again." with no useful info
**Fix:** Updated error to "No AI API key configured. Go to Settings → API Keys" and made frontend show actual API error message
