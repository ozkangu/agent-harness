# Backend Dockerfile for Maestro
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml .
COPY maestro/ maestro/
COPY static/ static/
COPY WORKFLOW.example.md WORKFLOW.md

# Install Python package
RUN pip install --no-cache-dir -e .

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 8420

ENV MAESTRO_DB_PATH=/data/maestro.db

CMD ["maestro", "--db", "/data/maestro.db", "start", "--port", "8420"]
