import React from "react";
import type { Analysis } from "../../types/analysis";
import BulletList from "./BulletList";

interface Props {
  analysis: Analysis;
  gameLabel: string;
}

/** The latest analysis shown under a voice panel */
const AnalysisCard: React.FC<Props> = ({ analysis, gameLabel }) => {
  const { summary, topTips, trainingDrills, rating, confidence, responseType } = analysis;

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-purple-500/40 shadow-2xl">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="font-bold text-base sm:text-xl text-white">Latest {gameLabel} Analysis</h3>
        {rating != null && (
          <div className="bg-purple-600 px-2 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-lg font-bold shadow-lg">
            {rating}/10
          </div>
        )}
      </div>

      <div className="space-y-2 sm:space-y-4">
        <p className="text-gray-200 text-sm sm:text-lg leading-relaxed">{summary}</p>

        {confidence != null && (
          <div className="flex items-center gap-1 sm:gap-3 text-sm sm:text-lg">
            <span className="text-gray-400">Confidence:</span>
            <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
          </div>
        )}

        {topTips.length > 0 && (
          <div>
            <h4 className="font-semibold text-purple-300 text-sm sm:text-lg mb-1 sm:mb-3">🎯 Top Tips</h4>
            <BulletList items={topTips} bulletClass="text-purple-400" />
          </div>
        )}

        {trainingDrills.length > 0 && (
          <div>
            <h4 className="font-semibold text-blue-300 text-sm sm:text-lg mb-1 sm:mb-3">🏋️ Training Drills</h4>
            <BulletList items={trainingDrills} bulletClass="text-blue-400" />
          </div>
        )}

        <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs text-gray-400 capitalize">Response Type: {responseType}</span>
        </div>
      </div>
    </div>
  );
};

export default AnalysisCard;
