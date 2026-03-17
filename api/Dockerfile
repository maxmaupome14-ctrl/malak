FROM python:3.11-slim AS base

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definition first for layer caching
COPY pyproject.toml ./

# Create a minimal package so pip install works without full source
RUN mkdir -p src && touch src/__init__.py && \
    pip install --no-cache-dir "." && \
    rm -rf src

# Install Playwright browsers
RUN playwright install --with-deps chromium

# Copy full source code
COPY . .

# Install package in editable mode (now source exists)
RUN pip install --no-cache-dir -e "."

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/health'); r.raise_for_status()"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
