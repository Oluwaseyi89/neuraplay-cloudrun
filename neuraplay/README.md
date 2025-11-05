# NeuraPlay Backend - AI Game Coaching Engine

![Django 4.2](https://img.shields.io/badge/Django-4.2-green)
![Google Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-deployed-blue)
![AI](https://img.shields.io/badge/AI-Gemini_1.5-orange)

## 🧠 Overview

NeuraPlay Backend is a sophisticated Django server that powers real-time AI coaching for gamers. It leverages Google's Gemini AI to analyze gameplay data and provide personalized coaching advice through multiple input modalities.

## 🏗️ Architecture

Client Apps → Django Backend (Cloud Run) → AI Services → Data Storage
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

## 🛠️ Tech Stack

**Framework:** Django 4.2 + Django REST Framework  
**AI/ML:** Google Gemini 1.5 Flash, Google Speech-to-Text, Google Text-to-Speech  
**Cloud:** Google Cloud Run (Serverless), Firebase Admin SDK  
**Database:** Firebase Firestore (NoSQL)  
**Real-time:** Django Channels (WebSocket support)  
**Authentication:** Firebase Authentication  

## 🎮 Supported Games & Features

### League of Legends
- **KDA Analysis:** Kill/Death/Assist performance evaluation
- **Strategy Coaching:** Lane phase, team fights, objective control
- **Mechanical Tips:** CS optimization, champion-specific advice
- **Practice Drills:** Targeted training exercises

### FIFA/EA FC
- **Tactical Analysis:** Formation effectiveness, possession strategies
- **Gameplay Evaluation:** Shooting, passing, defensive positioning
- **Training Drills:** Skill move practice, set piece strategies
- **Real-time Adjustments:** In-match tactical recommendations


## 🚀 API Endpoints

### Voice Analysis Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| POST | `/api/analyze/lol/` | Analyze LoL gameplay from voice/text | Firebase JWT |
| POST | `/api/analyze/fifa/` | Analyze FIFA gameplay from voice/text | Firebase JWT |
| POST | `/api/process-voice-input/` | Unified voice processing (mobile) | Firebase JWT |

### Analyses History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analyses/recent/lol/` | Get recent LoL analyses |
| GET | `/api/analyses/recent/fifa/` | Get recent FIFA analyses |

### Browser Extension

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze/browser-stats/` | Analyze scraped game stats |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health/` | Health check & service status |


## 🔌 WebSocket Support

**Real-time voice analysis** via `/ws/voice-analysis/`:

- **Authentication:** Firebase JWT token
- **Streaming:** Continuous audio chunk processing
- **Real-time:** Live transcription and analysis
- **Bi-directional:** Text-to-Speech audio responses

## 🔧 Environment Variables

### Django Configuration
- `PORT=8080`
- `DJANGO_SECRET_KEY=your-secret-key-here`

### Google AI Services
- `GEMINI_API_KEY=your-gemini-api-key`
- `GEMINI_MODEL=gemini-1.5-flash`
- `GENAI_TIMEOUT_SECONDS=30`

### Firebase & Google Cloud
- `PROJECT_ID=your-gcp-project-id`
- `FIREBASE_CREDENTIALS_BASE64=base64-encoded-service-account-json`

### Performance Tuning
- `GRPC_DNS_RESOLVER=native`


## 📦 Installation & Setup

### Prerequisites
- Python 3.11+
- Google Cloud Project with enabled APIs:
  - Gemini AI API
  - Speech-to-Text API
  - Text-to-Speech API
- Firebase Project with Firestore


## Local Development

```bash
    # Clone repository
    git clone https://github.com/Oluwaseyi89/neuraplay-cloudrun.git
    cd neuraplay-cloudrun/neuraplay

    # Create virtual environment
    python -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate

    # Install dependencies
    pip install -r requirements.txt

    # Set environment variables
    cp .env.example .env
    # Edit .env with your actual values

    # Run migrations
    python manage.py migrate

    # Start development server for http only
    python manage.py runserver

    # Start development server for websocket
    daphne neuraplay.asgi:application --port 8000 --bind 0.0.0.0
```

## Production Deployment

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