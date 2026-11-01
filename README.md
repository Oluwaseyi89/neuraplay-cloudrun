# NeuraPlay - AI Game Coaching Platform

![NeuraPlay](https://img.shields.io/badge/NeuraPlay-AI_Coaching-purple)
![Django](https://img.shields.io/badge/Django-5.2-green)
![React](https://img.shields.io/badge/React-19-cyan)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)

## 🎮 Overview

NeuraPlay is an AI coaching platform for League of Legends and FIFA/EA FC players. Players describe what's going wrong in their games, by voice or text, and get coaching from Google Gemini: what the main problem is, what to change, and how to practise it, read back to them out loud.

## ✨ Features

### 🤖 AI Coaching
- **Voice analysis** - Say "hey FIFA" or "hey LoL", describe the problem, and hear the advice
- **Two depths** - A short three-sentence answer by default; ask for a "detailed" analysis to get top tips, training drills and a 1–10 rating
- **Two games** - League of Legends and FIFA/EA FC

### 🌐 Access
- **Web app** - React dashboard with hands-free wake word on desktop and tap-to-talk on mobile
- **Browser extension** - Analyzes stats scraped from OP.GG, U.GG and Futbin
- **Accounts** - Email/password sign-up with JWT sessions

### 🛡️ Fair Use & Privacy
- **Daily limits** - 3 analyses per user and 5 per network (IP address) per day
- **Short-lived history** - Analyses are kept for 24 hours, then deleted
- **No raw IPs stored** - Usage counters keep only hashed IP addresses

## 🏗️ System Architecture

```
    Clients                          Backend (Django ASGI on Daphne)             External services
    ───────                          ───────────────────────────────             ─────────────────
    React web app ─── HTTP + WS ──►  accounts · analysis · daily limits  ──┬──► Gemini (coaching)
    Browser extension ─── HTTP ───►                                         ├──► Speech-to-Text
                                              │                             └──► Text-to-Speech
                                              ▼
                                     PostgreSQL (Supabase in production)
                                     users · analyses (24h) · daily usage
```

- **Desktop browsers** stream audio over a WebSocket; **mobile browsers** upload the recording over HTTP.
- **Planned hosting:** the backend on Render, PostgreSQL on Supabase, and the web app on Vercel or Netlify.

## 📁 Project Structure

```
    neuraplay-cloudrun/
    ├── neuraplay/                  # Django backend
    │   ├── authentication/         # Accounts and JWT auth
    │   ├── analysis/               # Analysis REST API, WebSocket, history (TTL)
    │   ├── quotas/                 # Per-user and per-IP daily limits
    │   ├── neuraplay_ai/services/  # Gemini prompts and parsing, analysis storage
    │   ├── render.yaml             # Render deployment blueprint
    │   └── manage.py
    ├── neuraplay-app/              # React web app
    │   └── src/                    # types · lib · services · hooks · components · pages
    ├── neuraplay-extension/        # Chrome extension (Manifest V3)
    │   ├── content/                # Page scraping and on-page overlay
    │   ├── background/             # Service worker
    │   └── popup/                  # Extension popup
    └── README.md
```

Each part has its own README with details: [backend](neuraplay/README.md), [web app](neuraplay-app/README.md), [extension](neuraplay-extension/README.md).

## 🚀 Quick Start

### Prerequisites
- Python 3.11+ and PostgreSQL
- Node.js 22+
- A Gemini API key
- For voice: a Google Cloud service account with the Speech-to-Text and Text-to-Speech APIs enabled

### 1. Backend

```bash
    git clone https://github.com/Oluwaseyi89/neuraplay-cloudrun.git
    cd neuraplay-cloudrun/neuraplay

    python -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate
    pip install -r requirements.txt

    # Create a Postgres user (with CREATEDB, for tests) and database, then fill in
    # DJANGO_SECRET_KEY, POSTGRES_PASSWORD, GEMINI_API_KEY and DJANGO_DEBUG=true
    cp .env.example .env

    python manage.py migrate
    daphne -p 8000 neuraplay.asgi:application
```

### 2. Web app

```bash
    cd ../neuraplay-app
    npm install
    cp .env.example .env    # VITE_API_BASE_URL=http://localhost:8000
    npm run dev             # http://localhost:5173
```

### 3. Browser extension

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select the `neuraplay-extension` folder.

The extension's backend address is hard-coded in `background/background.js` and `content/content.js`, and the backend origin must also be in `host_permissions` in `manifest.json`. Point all three at your backend before using it.

## 🎯 Usage

### Voice coaching (web app)
1. **Sign up** or log in.
2. **Desktop:** say "hey FIFA" or "hey LoL". **Mobile:** tap the mic.
3. **Describe the problem**, e.g. "I keep conceding goals on the counter attack". Recording stops after a few seconds of silence.
4. **Read and hear the analysis.** Add "detailed" to your request for tips, drills and a rating.

### Recent analyses
Open the **Recent Analyses** tab to see each game's analyses from the last 24 hours.

### Browser extension
Visit a stats page on OP.GG, U.GG or Futbin. The extension scrapes the key numbers when the page loads, or when you press **Analyze** in its popup, and shows the coaching in an overlay on the page. Extension requests are anonymous and count toward the 5-per-day IP limit.

## 🔧 API Overview

| Area | Endpoints |
|------|-----------|
| Accounts | `POST /api/auth/register/`, `login/`, `token/refresh/`, `logout/`, `GET /api/auth/me/` |
| Analysis | `POST /api/analyze/fifa/`, `POST /api/analyze/lol/`, `POST /api/process-voice-input/` |
| History | `GET /api/analyses/recent/fifa/`, `GET /api/analyses/recent/lol/` |
| Extension | `POST /api/analyze/browser-stats/` |
| Real-time | WebSocket `/ws/voice-analysis/` |
| System | `GET /api/health/` |

Full request/response details, the WebSocket protocol, and all environment variables are in the [backend README](neuraplay/README.md).

## 🛡️ Limits & Data Retention

- **Daily analysis limits:** 3 per user and 5 per IP address. Both are checked on every analysis request, the day resets at midnight UTC, and over the limit the API returns `429` with the time until reset.
- **History:** analyses expire after 24 hours and are deleted; each user keeps at most 10 per game.
- **Configurable:** all of these are environment variables (`ANALYSIS_DAILY_LIMIT_PER_USER`, `ANALYSIS_DAILY_LIMIT_PER_IP`, `ANALYSIS_TTL_HOURS`).

## 🛠️ Technology Stack

### Backend
- **Framework:** Django 5.2 LTS, Django REST Framework, Django Channels on Daphne
- **Auth:** SimpleJWT (rotating refresh tokens, logout blacklist)
- **Database:** PostgreSQL (Supabase in production)
- **AI:** Gemini (`gemini-2.5-flash`), Google Cloud Speech-to-Text and Text-to-Speech

### Web app
- **Framework:** React 19, TypeScript, Vite 7
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Voice:** MediaRecorder and the Web Speech API
- **Tests:** Vitest

### Browser extension
- **Platform:** Chrome, Manifest V3

## 🔒 Security & Privacy
- **Sessions:** short-lived access tokens (30 minutes) and refresh tokens (7 days) that rotate on use and are blacklisted on logout.
- **Login protection:** register, login and token refresh are throttled per client.
- **Data isolation:** every analysis belongs to one user, and history endpoints only return the caller's own analyses.
- **Minimal retention:** analyses are deleted after 24 hours, and daily usage counters store hashed IPs, never raw addresses.
- **Secrets:** API keys and credentials are read from environment variables and never committed (`.env` is gitignored).

## 🚀 Deployment

| Part | Platform | How |
|------|----------|-----|
| Backend | Render | Blueprint from `neuraplay/render.yaml`; set `DATABASE_URL`, `GEMINI_API_KEY`, `GOOGLE_CLOUD_CREDENTIALS_BASE64` and `CORS_ALLOWED_ORIGINS` |
| Database | Supabase | Use the **Session pooler** connection string as `DATABASE_URL` |
| Web app | Vercel or Netlify | Build `npm run build`, output `dist`, set `VITE_API_BASE_URL` to the backend URL |
| Extension | Chrome | Load unpacked, or package for the Chrome Web Store |

Step-by-step instructions are in the [backend](neuraplay/README.md#-production-deployment-render--supabase) and [web app](neuraplay-app/README.md#-deployment) READMEs.

## 🎮 Supported Games

### League of Legends
- Lane phase, positioning and wave management
- Vision control and map awareness
- Champion-specific advice and practice drills

### FIFA/EA FC
- Formations and tactical adjustments
- Passing, shooting and defensive organization
- Targeted training drills
