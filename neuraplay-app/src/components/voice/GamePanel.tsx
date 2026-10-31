import React from "react";
import { GAMES } from "../../types/game";
import type { GameType } from "../../types/game";
import type { Analysis } from "../../types/analysis";
import VoiceInput from "./VoiceInput";
import AnalysisCard from "../analysis/AnalysisCard";

interface Props {
  game: GameType;
  token: string;
  latestAnalysis: Analysis | null;
  onAnalysis: (analysis: Analysis) => void;
}

/** One game's card: heading, voice controls and its latest analysis */
const GamePanel: React.FC<Props> = ({ game, token, latestAnalysis, onAnalysis }) => {
  const meta = GAMES[game];

  return (
    <div className={`bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border shadow-2xl w-full ${meta.panelBorder}`}>
      <div className="text-center mb-4 sm:mb-6">
        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 ${meta.iconBackground}`}>
          <span className="text-xl sm:text-2xl">{meta.icon}</span>
        </div>
        <h3 className={`text-lg sm:text-2xl font-bold mb-2 sm:mb-3 ${meta.titleText}`}>{meta.title}</h3>
        <p className="text-gray-300 text-xs sm:text-lg">{meta.description}</p>
      </div>

      <VoiceInput userToken={token} initialGame={game} onAnalysis={onAnalysis} />

      {latestAnalysis && (
        <div className="mt-4 sm:mt-6">
          <AnalysisCard analysis={latestAnalysis} gameLabel={meta.label} />
        </div>
      )}
    </div>
  );
};

export default GamePanel;
