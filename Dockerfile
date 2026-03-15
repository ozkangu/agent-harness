# Backend Dockerfile for Cortex
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock .python-version ./

# Install dependencies only (not the project itself) for layer caching
RUN uv sync --frozen --no-dev --no-install-project

# Copy project source
COPY cortex/ cortex/
COPY static/ static/
COPY WORKFLOW.example.md ./

# Install the project itself
RUN uv sync --frozen --no-dev

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 8420

ENV CORTEX_DB_PATH=/data/cortex.db

CMD ["uv", "run", "uvicorn", "cortex.asgi:app", "--host", "0.0.0.0", "--port", "8420"]
