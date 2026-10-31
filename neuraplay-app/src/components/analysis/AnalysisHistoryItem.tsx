import React from "react";
import { GAMES } from "../../types/game";
import type { AnalysisHistory } from "../../types/analysis";
import BulletList from "./BulletList";

// Only the first few tips fit in the history list
const PREVIEW_TIPS = 2;

const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory }> = ({ analysis }) => {
  const game = GAMES[analysis.game];
  const createdAt = new Date(analysis.created_at).toLocaleString();

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 mb-2 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className={`p-2 sm:p-3 rounded-xl flex-shrink-0 ${game.historyBadge}`}>
            <span className="text-lg sm:text-2xl">{game.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base sm:text-xl text-white truncate">{game.label.toUpperCase()} Analysis</h4>
            {analysis.user_text && (
              <p className="text-gray-300 text-xs sm:text-lg mt-1 line-clamp-2 break-words">"{analysis.user_text}"</p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 bg-gray-600/50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg flex-shrink-0 self-start sm:self-auto">
          {createdAt}
        </span>
      </div>

      <div className="space-y-2 sm:space-y-4">
        <p className="text-gray-200 text-xs sm:text-lg leading-relaxed break-words">{analysis.summary}</p>

        <div className="flex flex-wrap gap-2 sm:gap-6 text-xs sm:text-lg">
          {analysis.rating != null && (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-gray-400">Rating:</span>
              <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
            </div>
          )}
          {analysis.confidence != null && (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-gray-400">Confidence:</span>
              <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
            </div>
          )}
        </div>

        {analysis.topTips.length > 0 && (
          <div>
            <h5 className="font-semibold text-purple-300 text-xs sm:text-lg mb-1 sm:mb-2">Key Tips</h5>
            <BulletList items={analysis.topTips.slice(0, PREVIEW_TIPS)} bulletClass="text-purple-400" textClass="text-gray-300" />
          </div>
        )}

        <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
        </div>
      </div>
    </div>
  );
};

export default AnalysisHistoryItem;
