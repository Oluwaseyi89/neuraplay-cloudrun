import React from "react";
import PageHeading from "../components/layout/PageHeading";
import GamePanel from "../components/voice/GamePanel";
import { GAME_TYPES } from "../types/game";
import type { GameType } from "../types/game";
import type { Analysis } from "../types/analysis";

interface Props {
  token: string;
  latestAnalyses: Record<GameType, Analysis | null>;
  onAnalysis: (game: GameType, analysis: Analysis) => void;
}

const VoiceAnalysisPage: React.FC<Props> = ({ token, latestAnalyses, onAnalysis }) => (
  <div className="w-full space-y-6 sm:space-y-8">
    <PageHeading
      title="Voice Analysis"
      subtitle="Speak your game stats to get real-time AI analysis with voice responses."
    />

    <div className="w-full flex justify-center">
      <div className="bg-blue-900/30 rounded-2xl p-3 sm:p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <div className="w-2 h-2 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse"></div>
          <span className="font-semibold text-xs sm:text-lg text-blue-200">Real-time connection active</span>
        </div>
      </div>
    </div>

    {/* Stack on mobile, side-by-side on desktop */}
    <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
      {GAME_TYPES.map((game) => (
        <GamePanel
          key={game}
          game={game}
          token={token}
          latestAnalysis={latestAnalyses[game]}
          onAnalysis={(analysis) => onAnalysis(game, analysis)}
        />
      ))}
    </div>
  </div>
);

export default VoiceAnalysisPage;
