# NeuraPlay Backend - AI Game Coaching Engine

![Django 5.2](https://img.shields.io/badge/Django-5.2_LTS-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-blue)
![Render](https://img.shields.io/badge/Deploy-Render-purple)
![AI](https://img.shields.io/badge/AI-Gemini_2.5_Flash-orange)

## 🧠 Overview

The NeuraPlay backend is a Django ASGI server that turns a player's description of their gameplay (typed, spoken, or scraped from a stats site) into coaching advice from Google Gemini. It handles user accounts, transcribes speech, speaks the advice back, keeps a short analysis history, and enforces daily usage limits.

## 🏗️ Architecture

```
    Clients                         Django ASGI app (Daphne)                    External services
    ───────                         ────────────────────────                    ─────────────────
    React web app ── HTTP + WS ──►  authentication/  JWT accounts         ┌──► Gemini (coaching)
    Browser extension ── HTTP ───►  analysis/        REST + WebSocket ────┼──► Speech-to-Text
                                    quotas/          daily limits         └──► Text-to-Speech
                                         │
                                         ▼
                                    PostgreSQL (local, or Supabase in production)
                                    users · analyses (24h TTL) · daily usage counters
```

## 🛠️ Tech Stack

- **Framework:** Django 5.2 LTS, Django REST Framework
- **Auth:** SimpleJWT (access + rotating refresh tokens, refresh-token blacklist)
- **Real-time:** Django Channels on Daphne (HTTP and WebSocket in one process)
- **Database:** PostgreSQL via `psycopg` and `dj-database-url`
- **AI:** `google-genai` (Gemini, default `gemini-2.5-flash`), Google Cloud Speech-to-Text and Text-to-Speech
- **Static files:** WhiteNoise
- **Tests:** pytest + pytest-django

## 📁 Project Layout

```
    neuraplay/
    ├── authentication/          # Custom User model (email login), register/login/refresh/logout/me
    ├── analysis/
    │   ├── models.py            # Analysis model + active()/expired() querysets (TTL)
    │   ├── views.py             # REST endpoints for analysis, history, health
    │   ├── consumers.py         # WebSocket voice analysis
    │   └── management/commands/cleanup_analyses.py
    ├── quotas/                  # Per-user and per-IP daily limits (DailyUsage model)
    ├── neuraplay_ai/services/
    │   ├── gemini_service.py    # Prompts, Gemini calls with retry, response parsing
    │   └── analysis_service.py  # Saving, history, TTL and per-game cap
    ├── neuraplay/               # settings.py, urls.py, asgi.py
    ├── render.yaml              # Render blueprint
    └── start.sh                 # Production entrypoint: migrate, then Daphne
```

## 🚀 API Endpoints

All endpoints are under `/api/`. "JWT" means an `Authorization: Bearer <access token>` header is required. "Quota" means the request counts toward the daily limits (see [Limits & Data Retention](#-limits--data-retention)).

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register/` | Create an account; returns the user plus `access` and `refresh` tokens | — |
| POST | `/api/auth/login/` | Email + password; returns the user plus tokens | — |
| POST | `/api/auth/token/refresh/` | Exchange a refresh token for a new pair (the old refresh token stops working) | — |
| POST | `/api/auth/logout/` | Blacklist the given refresh token | JWT |
| GET / PATCH | `/api/auth/me/` | Read or update the current user's profile | JWT |

Register, login and refresh are throttled to 20 requests per minute per client.

### Analysis

| Method | Endpoint | Description | Auth | Quota |
|--------|----------|-------------|------|-------|
| POST | `/api/analyze/fifa/` | Analyze FIFA/EA FC text (`{"stats": "..."}`) | JWT | ✅ |
| POST | `/api/analyze/lol/` | Analyze League of Legends text | JWT | ✅ |
| POST | `/api/process-voice-input/` | Upload a recording (`audio` file + `game`); returns transcript, analysis and spoken reply. Used by mobile browsers | JWT | ✅ |
| POST | `/api/analyze/browser-stats/` | Analyze stats scraped by the browser extension | — | ✅ (per IP) |
| GET | `/api/analyses/recent/fifa/` | The user's unexpired FIFA analyses, newest first | JWT | — |
| GET | `/api/analyses/recent/lol/` | The user's unexpired LoL analyses, newest first | JWT | — |
| GET | `/api/health/` | Status of the database and the speech/TTS clients | — | — |

Analyses are **simple** (three sentences) by default. Including "detailed", "comprehensive", "full analysis" or "complete" in the request asks Gemini for a **detailed** analysis with top tips, training drills and a 1–10 rating.

## 🔌 WebSocket: `/ws/voice-analysis/`

Desktop browsers stream audio over a WebSocket. All messages are JSON.

| Client → server | Purpose |
|-----------------|---------|
| `{"type": "auth", "token": "<access token>"}` | Authenticate (server replies `{"status": "authenticated"}` or `{"error": "Unauthorized"}` and closes) |
| `{"type": "audio_chunk", "audio_base64": "..."}` | Append WebM/Opus audio to the buffer |
| `{"type": "speech_end", "game": "fifa" \| "lol"}` | Transcribe the buffer, analyze it, and reply (counts toward the quota) |
| `{"type": "speech_cancel"}` | Discard the buffered audio |

The server first sends `{"transcript": "..."}`, then `{"transcript", "analysis", "tts_audio"}` where `tts_audio` is base64 MP3. Errors arrive as `{"error": "..."}`; a reached limit adds `"code": "rate_limited"`.

## 🛡️ Limits & Data Retention

**Daily analysis limits**: every quota-counted request (REST or WebSocket) is checked against both:

- **3 requests per user per day**
- **5 requests per IP address per day** (shared by everyone on that network; the only limit for the anonymous browser-extension endpoint)

Details:

- Days are UTC calendar days; counters reset at midnight UTC.
- Counters live in PostgreSQL (`quotas.DailyUsage`), so they survive restarts.
- A request rejected by one limit doesn't use up the other.
- Invalid requests (no text, no audio, unsupported game) don't count.
- Over the limit, HTTP returns `429` with a `Retry-After` header and `{"error", "code": "rate_limited", "scope", "limit", "retry_after"}`.
- IP addresses are stored only as keyed hashes.
- To reset someone's quota, delete their row under **Daily usage** in the Django admin.
- **Behind a proxy**, set `TRUSTED_PROXY_COUNT` so the real client IP is read from `X-Forwarded-For` (`1` on Render). With `0` behind a proxy, every user would appear to share the proxy's IP.

**Analysis history** expires `ANALYSIS_TTL_HOURS` (default 24) after creation:

- Expired analyses are never returned.
- A user's expired analyses are deleted whenever that user saves or loads history.
- Each user keeps at most 10 analyses per game.
- `python manage.py cleanup_analyses` deletes expired analyses for all users; schedule it if you want a periodic sweep.

## 🔧 Environment Variables

See `.env.example` for a template.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DJANGO_SECRET_KEY` | — (required) | Django secret key; also keys the IP hashes |
| `DJANGO_DEBUG` | `false` | Debug mode |
| `PORT` | `8000` | Port used by `start.sh` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated; Render's hostname is added automatically |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Frontend origins, comma separated |
| `CSRF_TRUSTED_ORIGINS` | empty | Extra origins for the admin |
| `DATABASE_URL` | unset | Postgres URL (Supabase session pooler in production). Overrides `POSTGRES_*` |
| `DATABASE_SSL_REQUIRE` | `true` | Require SSL for `DATABASE_URL` |
| `DATABASE_TRANSACTION_POOLER` | `false` | Set `true` when using Supabase's transaction pooler (port 6543) |
| `POSTGRES_DB` / `_USER` / `_PASSWORD` / `_HOST` / `_PORT` | `neuraplay_db` / `neura_play_user` / — / `localhost` / `5432` | Local database |
| `JWT_ACCESS_TOKEN_MINUTES` | `30` | Access token lifetime |
| `JWT_REFRESH_TOKEN_DAYS` | `7` | Refresh token lifetime |
| `AUTH_THROTTLE_RATE` | `20/minute` | Rate for register/login/refresh |
| `ANALYSIS_DAILY_LIMIT_PER_USER` | `3` | Daily limit per user (empty = no limit) |
| `ANALYSIS_DAILY_LIMIT_PER_IP` | `5` | Daily limit per IP address (empty = no limit) |
| `ANALYSIS_TTL_HOURS` | `24` | Analysis lifetime |
| `TRUSTED_PROXY_COUNT` | `0` | Proxies that append to `X-Forwarded-For` (`1` on Render) |
| `GEMINI_API_KEY` | — (required) | Gemini API key; the app won't start without it |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `GEMINI_MAX_RETRIES` / `GEMINI_RETRY_DELAY` | `3` / `2.0` | Retries with exponential backoff when Gemini is overloaded |
| `GENAI_TIMEOUT_SECONDS` | `30` | Read but not yet applied to Gemini calls |
| `GOOGLE_CLOUD_CREDENTIALS_BASE64` | unset | Base64 service-account JSON for Speech-to-Text and Text-to-Speech. Without it, voice input and spoken replies are disabled |
| `GRPC_DNS_RESOLVER` | `native` | gRPC DNS resolver for the Google clients |

## 📦 Local Development

### Prerequisites
- Python 3.11+
- PostgreSQL
- A Gemini API key
- For voice: a Google Cloud service account with the Speech-to-Text and Text-to-Speech APIs enabled

### Setup

```bash
    cd neuraplay-cloudrun/neuraplay

    # Virtual environment and dependencies
    python -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate
    pip install -r requirements.txt

    # Database (CREATEDB lets the test suite create its test database)
    sudo -u postgres psql -c "CREATE USER neura_play_user WITH PASSWORD '<password>' CREATEDB;"
    sudo -u postgres psql -c "CREATE DATABASE neuraplay_db OWNER neura_play_user;"

    # Configuration: set DJANGO_SECRET_KEY, POSTGRES_PASSWORD, GEMINI_API_KEY,
    # DJANGO_DEBUG=true, and optionally GOOGLE_CLOUD_CREDENTIALS_BASE64
    cp .env.example .env

    python manage.py migrate
    python manage.py createsuperuser   # optional, for /admin/

    # Run (HTTP + WebSocket)
    daphne -p 8000 neuraplay.asgi:application
```

`python manage.py runserver 8000` also serves WebSockets (Daphne is installed as an app) and reloads on code changes. Daphne itself does not reload, so restart it after edits.

To encode a service-account key for `GOOGLE_CLOUD_CREDENTIALS_BASE64`: `base64 -w0 key.json`.

### Tests

```bash
    pytest
```

The tests need the Postgres user to have `CREATEDB`, and `GEMINI_API_KEY` set (any value works, since Gemini calls are mocked; the module refuses to load without it).

## 🚀 Production Deployment (Render + Supabase)

1. **Supabase:** create a project and copy the **Session pooler** connection string (port 5432). Render can't reach Supabase's direct connection, which is IPv6-only.
2. **Render:** create a Blueprint from this repository; it reads `neuraplay/render.yaml`, which:
   - runs `pip install -r requirements.txt && python manage.py collectstatic --noinput` to build;
   - starts with `./start.sh`, which runs migrations and then Daphne on `$PORT`;
   - health-checks `/api/health/`;
   - generates `DJANGO_SECRET_KEY` and sets `TRUSTED_PROXY_COUNT=1` and the daily limits.
3. In Render, set the secret values the blueprint leaves blank: `DATABASE_URL`, `GEMINI_API_KEY`, `GOOGLE_CLOUD_CREDENTIALS_BASE64`, and `CORS_ALLOWED_ORIGINS` (the frontend's URL).

The `Dockerfile` is kept for container-based hosting; Render's Python runtime doesn't use it.
