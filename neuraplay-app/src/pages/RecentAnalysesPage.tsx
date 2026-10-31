import React, { useState } from "react";
import PageHeading from "../components/layout/PageHeading";
import GameSelector from "../components/analysis/GameSelector";
import AnalysisHistoryItem from "../components/analysis/AnalysisHistoryItem";
import { HistoryEmpty, HistoryLoading } from "../components/analysis/HistoryStates";
import { useRecentAnalyses } from "../hooks/useRecentAnalyses";
import { GAMES } from "../types/game";
import type { GameType } from "../types/game";

const RecentAnalysesPage: React.FC = () => {
  const [game, setGame] = useState<GameType>("fifa");
  const { analyses, loading, refresh } = useRecentAnalyses(game);

  return (
    <div className="w-full space-y-6 sm:space-y-8">
      <PageHeading title="Recent Analyses" subtitle="Review your previous game analyses" />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-3 sm:p-6 border border-purple-500/20">
        <div className="w-full sm:w-auto">
          <GameSelector selected={game} onSelect={setGame} />
        </div>

        <button
          onClick={refresh}
          className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-sm sm:text-lg shadow-lg"
          disabled={loading}
        >
          {loading ? "🔄 Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {loading ? (
        <HistoryLoading />
      ) : analyses.length === 0 ? (
        <HistoryEmpty gameLabel={GAMES[game].label} />
      ) : (
        <div className="grid gap-3 sm:gap-6">
          {analyses.map((analysis) => (
            <AnalysisHistoryItem key={analysis.id} analysis={analysis} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentAnalysesPage;
