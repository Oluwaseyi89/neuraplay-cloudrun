# NeuraPlay - AI Game Coaching Platform

![NeuraPlay](https://img.shields.io/badge/NeuraPlay-AI_Coaching-purple)
![Google Cloud](https://img.shields.io/badge/Google_Cloud-Run-blue)
![React](https://img.shields.io/badge/React-18-cyan)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)

## 🎮 Overview

NeuraPlay is a comprehensive AI-powered game coaching platform that provides real-time analysis and personalized coaching for gamers. Using advanced AI and voice technology, NeuraPlay helps players improve their skills in popular games like League of Legends and FIFA/EA FC.

## ✨ Features

### 🤖 AI-Powered Coaching
- **Real-time Voice Analysis** - Speak your gameplay issues and get instant AI feedback
- **Multi-Game Support** - League of Legends and FIFA/EA FC coaching
- **Structured Advice** - Top tips, training drills, and performance ratings
- **Voice Responses** - Audio coaching with Text-to-Speech technology

### 🌐 Multi-Platform Access
- **Web Dashboard** - Full-featured React application with voice interface
- **Browser Extension** - Automatic analysis from gaming websites (OP.GG, U.GG, Futbin)
- **Responsive Design** - Works seamlessly on desktop and mobile devices

### 🚀 Technical Excellence
- **Serverless Architecture** - Deployed on Google Cloud Run for scalability
- **Real-time Processing** - WebSocket support for live voice analysis
- **Secure Authentication** - Firebase Auth with JWT tokens
- **Modern Tech Stack** - React, Django, Gemini AI, and Cloud Services

## 🏗️ System Architecture

Client Applications → Django Backend (Cloud Run) → AI Services → Data Storage
     │              │           │               │
     │              │           │               └── Firebase Firestore (Analysis History)
     │              │           │               └── Firebase Auth (User Management)
     │              │           │
     │              │           ├── Gemini AI (Game Analysis & Coaching)
     │              │           ├── Speech-to-Text (Voice Transcription)  
     │              │           └── Text-to-Speech (Audio Responses)
     │              │
     ├── React Frontend (Web Dashboard)
     └── Browser Extension (Game Data Capture)


## 📁 Project Structure

neuraplay-cloudrun/
├── neuraplay/                 # Django Backend
│   ├── analysis/             # Game analysis logic
│   ├── neuraplay_ai/         # AI services (Gemini, STT, TTS)
│   └── manage.py
├── neuraplay-app/            # React Frontend
│   ├── src/
│   │   ├── components/       # VoiceInput, LoginButton
│   │   ├── firebase/         # Firebase configuration
│   │   └── store/            # State management
│   └── package.json
├── neuraplay-extension/      # Chrome Browser Extension
│   ├── content/              # Page scraping scripts
│   ├── background/           # Service worker
│   ├── popup/                # Extension interface
│   └── manifest.json
└── README.md                 # This file


## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- Python 3.11+
- Google Cloud Project
- Firebase Project

1. Backend Setup (Django)

```bash
    # Clone the repository
    git clone https://github.com/Oluwaseyi89/neuraplay-cloudrun.git
    cd neuraplay-cloudrun/neuraplay

    # Set up Python environment
    python -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate

    # Install dependencies
    pip install -r requirements.txt

    # Set environment variables
    cp .env.example .env
    # Configure: GEMINI_API_KEY, FIREBASE_CREDENTIALS_BASE64, etc.

    # Run migrations
    python manage.py migrate

    # Start development server
    python manage.py runserver
```

2. Frontend Setup (React)

```bash
    cd ../neuraplay-app

    # Install dependencies
    npm install

    # Configure environment
    cp .env.example .env
    # Set VITE_API_BASE_URL, Firebase config values

    # Start development server
    npm run dev
```

3. Browser Extension Setup

```bash
    cd ../neuraplay-extension

    # Load in Chrome:
    # 1. Open chrome://extensions/
    # 2. Enable "Developer mode"
    # 3. Click "Load unpacked"
    # 4. Select neuraplay-extension folder
```

## 🎯 Usage Examples

### Voice Coaching
1. **Open Web Dashboard** - Access the React frontend
2. **Select Game** - Choose FIFA or League of Legends
3. **Speak Your Issue** - "I keep missing through passes in FIFA"
4. **Get AI Analysis** - Receive structured coaching with audio response

### Browser Extension
1. **Install Extension** - Add to Chrome browser
2. **Visit Gaming Sites** - OP.GG, U.GG, or Futbin
3. **Automatic Analysis** - Get instant coaching based on your stats
4. **View Overlay** - See tips and ratings directly on the page

### Analysis History
- Review past coaching sessions
- Track performance improvements
- Access previous tips and drills

## 🔧 API Endpoints

### Voice Analysis
- `POST /api/analyze/lol/` - League of Legends voice analysis
- `POST /api/analyze/fifa/` - FIFA voice analysis
- `POST /api/process-voice-input/` - Unified voice processing

### Analysis History
- `GET /api/analyses/recent/lol/` - Recent LoL analyses
- `GET /api/analyses/recent/fifa/` - Recent FIFA analyses

### Browser Extension
- `POST /api/analyze/browser-stats/` - Process scraped game data

## 🛠️ Technology Stack

### Backend Services
- **Framework:** Django 4.2 + Django REST Framework
- **AI/ML:** Google Gemini 1.5, Speech-to-Text, Text-to-Speech
- **Cloud:** Google Cloud Run, Firebase Firestore & Auth
- **Real-time:** Django Channels (WebSocket)

### Frontend Applications
- **Web Dashboard:** React 18, TypeScript, Tailwind CSS
- **Browser Extension:** Manifest V3, Chrome APIs
- **Authentication:** Firebase Auth
- **State Management:** Zustand

### External Services
- **Google AI:** Gemini, Speech-to-Text, Text-to-Speech
- **Firebase:** Authentication, Firestore Database
- **Cloud Run:** Serverless Container Deployment

## 🔒 Security & Privacy
- **JWT Authentication** - Secure user sessions with Firebase Auth
- **Data Encryption** - All communications over HTTPS
- **Privacy First** - No personal data stored unnecessarily
- **User Isolation** - Data separation by Firebase UID

## 📈 Performance
- **Response Time:** <5 seconds for voice analysis
- **Scalability:** Auto-scaling with Google Cloud Run
- **Concurrency:** Supports multiple simultaneous users
- **Availability:** 99.9% target with graceful degradation



## 🚀 Deployment

### Backend to Google Cloud Run

```bash
    # Deploy to Google Cloud Run
    REDIS_IP=$(gcloud redis instances describe neuraplay-redis --region=us-central1 --format="value(host)");
    echo "New Redis IP: $REDIS_IP";
    gcloud run deploy neuraplay-service \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="GEMINI_API_KEY=$GEMINI_API_KEY" \
    --set-env-vars="FIREBASE_CREDENTIALS_BASE64=$FIREBASE_CREDENTIALS_BASE64" \
    --port=8080 \
    --cpu=1 \
    --memory=1Gi \
    --min-instances=1 \
    --timeout=300s
```

### Frontend to Google Cloud Run

```bash
  npm run build

  docker build -t neuraplay-app .

  gcloud run deploy neuraplay-app \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated
```

## Extension Distribution

- Package as .crx file for Chrome Web Store
- Or load unpacked for development

## 🎮 Supported Games

### League of Legends
- KDA analysis and strategy coaching
- Objective control and macro decisions
- Champion-specific advice and drills
- Vision control and map awareness

### FIFA/EA FC
- Formation and tactical analysis
- Passing and shooting mechanics
- Defensive organization
- Set piece strategies

