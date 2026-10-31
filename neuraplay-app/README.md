# NeuraPlay React Frontend

![React 19](https://img.shields.io/badge/React-19-blue)
![TypeScript 5.0](https://img.shields.io/badge/TypeScript-5.0-blue)
![JWT Auth](https://img.shields.io/badge/Auth-JWT-orange)
![Vite Build](https://img.shields.io/badge/Vite-Build-purple)

## 🎮 Overview

NeuraPlay Frontend is a modern React application that provides real-time AI game coaching through voice analysis. Get personalized coaching advice for FIFA/EA FC and League of Legends with voice input and audio responses.

## ✨ Features

- 🎤 **Real-time Voice Analysis** - Speak your gameplay issues and get AI coaching
- 🎮 **Multi-Game Support** - FIFA/EA FC and League of Legends analysis
- 🔊 **Voice Responses** - Audio feedback with Text-to-Speech
- 📊 **Analysis History** - Review past coaching sessions
- 📱 **Responsive Design** - Optimized for desktop and mobile
- 🔐 **Secure Authentication** - Email/password accounts with JWT sessions
- 🎨 **Modern UI** - Beautiful gradient design with smooth animations

## 🚀 Quick Start

### Prerequisites

- Node.js 22 or higher
- NeuraPlay backend API (see `../neuraplay`)


## Installation

```bash
  # Clone the repository
  git clone https://github.com/Oluwaseyi89/neuraplay-cloudrun.git
  cd neuraplay-cloudrun/neuraplay-app

  # Install dependencies
  npm install

  # Set up environment variables
  cp .env.example .env
```

## Environment Configuration

Edit `.env` with the backend URL (the WebSocket URL is derived from it):

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Development

```bash
  # Start development server
  npm run dev

  # Unit tests (Vitest) and lint
  npm test
  npm run lint

  # Build for production
  npm run build

  # Preview production build
  npm run preview
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

1. **Wake word (desktop):** `wakeWordListener` hears "hey FIFA" / "hey LoL" and wakes the matching panel.
2. **Record:** `useMicrophone` + `useAudioRecorder` capture audio; `useLiveTranscription` shows a live transcript and detects silence.
3. **Send:** desktop streams chunks over the WebSocket (`useVoiceSocket`); mobile/tablet uploads the recording over HTTP.
4. **Respond:** the analysis is shown and `useAudioPlayback` plays the server's voice reply, falling back to the browser's voice.

## 🔌 API Integration

### Backend Endpoints

- `POST /api/auth/register/` · `POST /api/auth/login/` · `POST /api/auth/token/refresh/` · `POST /api/auth/logout/` · `GET /api/auth/me/`
- `POST /api/analyze/fifa/` - FIFA voice analysis
- `POST /api/analyze/lol/` - League of Legends voice analysis
- `POST /api/process-voice-input/` - Voice analysis endpoint for Mobile browsers
- `GET /api/analyses/recent/fifa/` - Recent FIFA analyses
- `GET /api/analyses/recent/lol/` - Recent LoL analyses


### WebSocket

- `/ws/voice-analysis/` - Real-time voice processing for desktop browsers


## 🎨 UI/UX Features

### Design System
- **Color Scheme:** Dark theme with purple/blue gradients
- **Typography:** Modern font stack with proper hierarchy
- **Icons:** Emoji-based for better accessibility
- **Animations:** Smooth transitions and hover effects

### Responsive Breakpoints
- **Mobile:** < 640px - Stacked layout, hamburger menu
- **Tablet:** 640px - 1024px - Adaptive layout
- **Desktop:** > 1024px - Full featured sidebar layout

## 🔧 Technical Stack
- **Frontend Framework:** React 19 with TypeScript
- **Build Tool:** Vite for fast development and building
- **Styling:** Tailwind CSS for utility-first styling
- **State Management:** Zustand for lightweight state
- **Authentication:** Django + SimpleJWT (access/refresh tokens)
- **Testing:** Vitest
- **HTTP Client:** Axios for API requests
- **Real-time:** WebSocket for voice processing

## 📱 Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+


## 🚀 Deployment

The app builds to static files, so it can be hosted on Vercel or Netlify:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variable:** `VITE_API_BASE_URL=https://<your-backend>.onrender.com`

Add the deployed frontend URL to the backend's `CORS_ALLOWED_ORIGINS`.
