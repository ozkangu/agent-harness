# Backend Dockerfile for Maestro
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

# Copy project source
COPY maestro/ maestro/
COPY static/ static/
COPY WORKFLOW.example.md WORKFLOW.md

# Install Python package (production only, no dev deps)
RUN uv sync --frozen --no-dev

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 8420

ENV MAESTRO_DB_PATH=/data/maestro.db

CMD ["uv", "run", "maestro", "--db", "/data/maestro.db", "start", "--port", "8420"]
