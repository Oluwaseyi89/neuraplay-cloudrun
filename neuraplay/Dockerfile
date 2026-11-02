# syntax=docker/dockerfile:1

# NeuraPlay backend image
#   builder  - installs dependencies into a virtualenv, collects static files and
#              precompiles bytecode (has pip and build tools; never shipped)
#   runtime  - slim image with only the virtualenv and app code, running as a
#              non-root user that cannot modify the code
#
# Build:  docker build -t neuraplay-backend .
# Run:    docker run --env-file .env -p 8000:8000 neuraplay-backend
#         (secrets are passed at runtime; .dockerignore keeps .env out of the image)

ARG PYTHON_VERSION=3.12

# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# Compilers only for packages without prebuilt wheels; they stay in this stage
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv "$VIRTUAL_ENV"

# Dependencies first so code changes don't invalidate this layer;
# the cache mount keeps downloaded wheels between builds
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install -r requirements.txt

WORKDIR /app
COPY . .

# Static files are collected at build time so the runtime image needs no write access.
# The placeholder values exist only for this command and are not kept in the image.
RUN DJANGO_SECRET_KEY=collectstatic-only GEMINI_API_KEY=collectstatic-only \
    python manage.py collectstatic --noinput \
    && python -m compileall -q /app "$VIRTUAL_ENV" \
    && chmod 0755 start.sh

# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PORT=8000

# Unprivileged user with no login shell
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /home/app --create-home --shell /usr/sbin/nologin app

# Code and dependencies stay owned by root: the app can read and run them but not change them
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app /app

WORKDIR /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health/', timeout=4)" || exit 1

# start.sh runs migrations, then execs Daphne so it receives stop signals directly
CMD ["./start.sh"]
