import httpClient from "./httpClient";
import type { AnalysisHistory, RecentAnalysesResponse, VoiceResult } from "../types/analysis";
import type { GameType } from "../types/game";

export const analysisService = {
  getRecent: async (game: GameType): Promise<AnalysisHistory[]> => {
    const { data } = await httpClient.get<RecentAnalysesResponse>(`/api/analyses/recent/${game}/`);
    return data.analyses || [];
  },

  /** Upload a recording for transcription + analysis (used on mobile/tablet) */
  processVoice: async (audio: Blob, game: GameType): Promise<VoiceResult> => {
    const formData = new FormData();
    formData.append("audio", audio, "recording.webm");
    formData.append("game", game);

    const { data } = await httpClient.post<VoiceResult>("/api/process-voice-input/", formData);
    return data;
  },
};
