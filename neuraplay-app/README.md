# NeuraPlay React Frontend

![React 18](https://img.shields.io/badge/React-18-blue)
![TypeScript 5.0](https://img.shields.io/badge/TypeScript-5.0-blue)
![Firebase Auth](https://img.shields.io/badge/Firebase-Auth-orange)
![Vite Build](https://img.shields.io/badge/Vite-Build-purple)

## 🎮 Overview

NeuraPlay Frontend is a modern React application that provides real-time AI game coaching through voice analysis. Get personalized coaching advice for FIFA/EA FC and League of Legends with voice input and audio responses.

## ✨ Features

- 🎤 **Real-time Voice Analysis** - Speak your gameplay issues and get AI coaching
- 🎮 **Multi-Game Support** - FIFA/EA FC and League of Legends analysis
- 🔊 **Voice Responses** - Audio feedback with Text-to-Speech
- 📊 **Analysis History** - Review past coaching sessions
- 📱 **Responsive Design** - Optimized for desktop and mobile
- 🔐 **Secure Authentication** - Firebase Auth integration
- 🎨 **Modern UI** - Beautiful gradient design with smooth animations

## 🚀 Quick Start

### Prerequisites

- Node.js 22 or higher
- Firebase project with Authentication enabled
- NeuraPlay backend API


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

Edit `.env` file with your Firebase and API settings:

```env
VITE_API_BASE_URL=your_backend_api_url
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## Development

```bash
  # Start development server
  npm run dev

  # Build for production
  npm run build

  # Preview production build
  npm run preview
```

## 🏗️ Project Structure

neuraplay-app/
├── src/
│   ├── components/          # React components
│   │   ├── LoginButton.tsx  # Firebase authentication
│   │   └── VoiceInput.tsx   # Voice recording & analysis
│   ├── firebase/           # Firebase configuration
│   │   └── firebaseClient.ts
│   ├── store/              # State management
│   │   └── auth-store.ts   # Authentication store
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Application entry point
├── public/                # Static assets
├── package.json
├── vite.config.ts        # Vite configuration
└── env.example           # Environment variables template


## 🎯 Core Components

### App.tsx
Main application component with:
- Authentication flow with Firebase
- Tab navigation between Voice Analysis and History
- Real-time state management for analyses
- Responsive design for mobile and desktop

### VoiceInput Component
- WebSocket integration for real-time voice processing
- Audio recording with browser MediaRecorder API
- Game selection (FIFA/LoL)
- Analysis display with structured coaching data

### Authentication
- Firebase Auth integration
- JWT token management for API calls
- Protected routes and user session handling


## 🔌 API Integration

### Backend Endpoints

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
- **Frontend Framework:** React 18 with TypeScript
- **Build Tool:** Vite for fast development and building
- **Styling:** Tailwind CSS for utility-first styling
- **State Management:** Zustand for lightweight state
- **Authentication:** Firebase Auth
- **HTTP Client:** Axios for API requests
- **Real-time:** WebSocket for voice processing

## 📱 Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+


## 🚀 Deployment

### Build for Production

```bash
  npm run build

  docker build -t neuraplay-app .

  gcloud run deploy neuraplay-app \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated
```