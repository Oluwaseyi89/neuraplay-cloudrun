import type { GameType } from "./game";

/** Coaching result as returned by the backend (HTTP and WebSocket) */
export interface Analysis {
  summary: string;
  topTips: string[];
  trainingDrills: string[];
  rating: number | null;
  confidence: number | null;
  responseType: "simple" | "detailed" | string;
}

/** A stored analysis from the recent-analyses endpoint */
export interface AnalysisHistory extends Analysis {
  id: string;
  user_id: string;
  user_text: string;
  game: GameType;
  created_at: string;
  expire_at: string;
}

export interface RecentAnalysesResponse {
  analyses: AnalysisHistory[];
  count: number;
  game: GameType;
}

/** Message from the voice endpoints (WebSocket or /api/process-voice-input/) */
export interface VoiceResult {
  transcript?: string;
  analysis?: Analysis;
  tts_audio?: string;
  error?: string;
  status?: string;
}
