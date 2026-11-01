# NeuraPlay React Frontend

![React 19](https://img.shields.io/badge/React-19-blue)
![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-blue)
![JWT Auth](https://img.shields.io/badge/Auth-JWT-orange)
![Vite 7](https://img.shields.io/badge/Vite-7-purple)

## 🎮 Overview

The NeuraPlay web app is a voice-first coaching dashboard. Players sign up, say "hey FIFA" or "hey LoL", describe a problem in their game, and get AI coaching back as text and speech. Recent analyses stay available for 24 hours.

## ✨ Features

- 🔐 **Accounts** - Email/password registration and login; sessions refresh automatically
- 🗣️ **Wake word (desktop)** - Say "hey FIFA" or "hey LoL" to start recording hands-free
- 🎤 **Tap to talk (mobile/tablet)** - Press the mic to record; recordings are uploaded over HTTP
- 📝 **Live transcript** - See what you're saying while you speak; on desktop, recording stops about 2 seconds after you finish (detected from the microphone's volume)
- 🔊 **Spoken replies** - Plays the server's voice reply, falling back to the browser's own voice
- 🎮 **Two games** - Separate FIFA/EA FC and League of Legends panels
- 📊 **Recent analyses** - History per game, for the last 24 hours
- ⏳ **Daily limits** - When the daily analysis limit is reached, the panel shows the server's message with the time until reset
- 📱 **Responsive** - Works on phones, tablets and desktops

## 🚀 Quick Start

### Prerequisites

- Node.js 22 or higher
- A running NeuraPlay backend (see `../neuraplay`)
- For voice: a browser with microphone access. The wake word and live transcript need the Web Speech API (Chrome, Edge, Safari); in other browsers you can still record with the mic button

### Installation

```bash
  cd neuraplay-cloudrun/neuraplay-app
  npm install
  cp .env.example .env
```

### Environment Configuration

`.env` needs only the backend URL; the WebSocket URL is derived from it (`http` → `ws`, `https` → `wss`):

```env
VITE_API_BASE_URL=http://localhost:8000
```

The backend must list the app's origin in `CORS_ALLOWED_ORIGINS` (the default allows `http://localhost:5173`).

### Development

```bash
  npm run dev        # Dev server on http://localhost:5173
  npm test           # Unit tests (Vitest)
  npm run lint       # ESLint
  npm run build      # Type-check and build to dist/
  npm run preview    # Serve the production build
```

## 🏗️ Project Structure

Each layer has one job: `lib/` is pure logic, `services/` talks to the backend,
`hooks/` own stateful behaviour, and `components/` only render.

```
  neuraplay-app/src/
  ├── types/                  # Shared types and game metadata (labels, colours, icons)
  ├── lib/                    # Pure, unit-tested helpers
  │   ├── wakePhrases.ts      # Wake phrases + whole-word/fuzzy wake detection
  │   ├── platform.ts         # Device/browser detection and voice settings per platform
  │   ├── jwt.ts · errors.ts  # Token expiry, readable API error messages
  │   └── audio.ts · speechRecognition.ts
  ├── services/
  │   ├── httpClient.ts       # Axios instance, auth header, refresh-and-retry on 401
  │   ├── authService.ts      # register / login / logout / me
  │   ├── analysisService.ts  # recent analyses, mobile voice upload
  │   └── wakeWordListener.ts # One shared wake-word recognizer for all voice panels
  ├── store/auth-store.ts     # Persisted user + tokens (Zustand)
  ├── hooks/
  │   ├── useAuthSession.ts   # Session validation, proactive token refresh, logout
  │   ├── useRecentAnalyses.ts
  │   ├── useVoiceAssistant.ts  # Orchestrates the voice flow below
  │   ├── useMicrophone.ts · useAudioRecorder.ts · useLiveTranscription.ts
  │   └── useAudioPlayback.ts · useVoiceSocket.ts
  ├── components/
  │   ├── auth/               # LoginForm, RegisterForm, form building blocks
  │   ├── layout/             # AppHeader, TabSwitcher, MobileMenu, PageHeading
  │   ├── analysis/           # AnalysisCard, AnalysisHistoryItem, GameSelector
  │   └── voice/              # VoiceInput, VoiceToolbar, MicButton, TranscriptPanel, GamePanel
  ├── pages/                  # AuthPage, DashboardPage, VoiceAnalysisPage, RecentAnalysesPage
  ├── App.tsx                 # Chooses AuthPage or DashboardPage
  └── main.tsx
```

## 🎯 Voice Flow

1. **Wake word (desktop):** `wakeWordListener` hears "hey FIFA" / "hey LoL" and wakes the matching panel. Browsers allow only one speech recognizer per page, so both panels share it.
2. **Record:** `useMicrophone` + `useAudioRecorder` capture audio. On desktop, `lib/voiceActivity.ts` watches the microphone volume and ends the recording about 2 seconds after you stop talking, or cancels it if nobody speaks within 8 seconds (45-second cap). `useLiveTranscription` only shows the live transcript and never ends the recording.
3. **Send:** desktop streams chunks over the WebSocket (`useVoiceSocket`); mobile/tablet uploads the recording over HTTP.
4. **Respond:** the analysis appears under the panel and `useAudioPlayback` plays the server's voice reply. Audio is unlocked on the first click or key press, because browsers block sound that starts without a user gesture.

Say "detailed", "comprehensive", "full analysis" or "complete" in your request to get tips, drills and a rating instead of a short three-sentence answer.

## 🔐 Sessions

- Login returns an access token (30 minutes) and a refresh token (7 days), stored in `localStorage` via Zustand.
- `httpClient` refreshes the access token on a `401` and retries the request once; `useAuthSession` also refreshes it a minute before it expires so the WebSocket keeps a valid token.
- Logout blacklists the refresh token on the server.

## 🔌 Backend Endpoints Used

- `POST /api/auth/register/` · `POST /api/auth/login/` · `POST /api/auth/token/refresh/` · `POST /api/auth/logout/` · `GET /api/auth/me/`
- `POST /api/process-voice-input/` - Voice analysis for mobile/tablet
- `GET /api/analyses/recent/fifa/` · `GET /api/analyses/recent/lol/` - Recent analyses
- WebSocket `/ws/voice-analysis/` - Voice analysis for desktop

See the backend README for request/response details and limits.

## 🎨 UI

- **Theme:** Dark, with purple/blue gradients; Tailwind CSS
- **Icons:** Emoji plus `lucide-react` icons for controls
- **Layout:**
  - **Under 640px:** compact header with a menu button and tab bar.
  - **640px and up:** full header with tabs.
  - **1280px and up:** the FIFA and LoL panels sit side by side.

## 🔧 Technical Stack
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite 7
- **Styling:** Tailwind CSS 3
- **State Management:** Zustand
- **HTTP Client:** Axios
- **Real-time:** WebSocket
- **Voice:** MediaRecorder, Web Speech API (recognition and synthesis)
- **Testing:** Vitest

## 🚀 Deployment

The app builds to static files, so it can be hosted on Vercel or Netlify:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variable:** `VITE_API_BASE_URL` set to the backend's public URL. It's baked in at build time, so rebuild after changing it.

Then add the deployed frontend URL to the backend's `CORS_ALLOWED_ORIGINS`.

The `Dockerfile`, `nginx.conf.template` and `start-nginx.sh` are kept for container hosting: they build the app and serve `dist/` with nginx on `$PORT` (default 8080). `VITE_API_BASE_URL` must be available during the image build.
