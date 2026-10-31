import { useCallback, useEffect, useState } from "react";
import { analysisService } from "../services/analysisService";
import type { AnalysisHistory } from "../types/analysis";
import type { GameType } from "../types/game";

/** Loads a game's recent analyses, keeping each game's list cached while switching */
export const useRecentAnalyses = (game: GameType) => {
  const [analysesByGame, setAnalysesByGame] = useState<Partial<Record<GameType, AnalysisHistory[]>>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const analyses = await analysisService.getRecent(game);
      setAnalysesByGame((prev) => ({ ...prev, [game]: analyses }));
    } catch (error) {
      console.error("❌ Failed to load recent analyses:", error);
      setAnalysesByGame((prev) => ({ ...prev, [game]: [] }));
    } finally {
      setLoading(false);
    }
  }, [game]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    analyses: analysesByGame[game] ?? [],
    loading,
    refresh,
  };
};
