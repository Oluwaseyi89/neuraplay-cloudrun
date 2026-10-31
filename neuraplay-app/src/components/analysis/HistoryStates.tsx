import React from "react";

export const HistoryLoading: React.FC = () => (
  <div className="text-center py-8 sm:py-16">
    <div className="animate-spin rounded-full h-8 w-8 sm:h-16 sm:w-16 border-b-2 border-purple-500 mx-auto mb-3 sm:mb-4"></div>
    <p className="text-gray-400 text-sm sm:text-lg">Loading your analyses...</p>
  </div>
);

export const HistoryEmpty: React.FC<{ gameLabel: string }> = ({ gameLabel }) => (
  <div className="text-center py-8 sm:py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
    <div className="text-4xl sm:text-8xl mb-4 sm:mb-6">📊</div>
    <h3 className="text-lg sm:text-2xl font-semibold text-gray-300 mb-2 sm:mb-4">No analyses found</h3>
    <p className="text-gray-400 text-sm sm:text-lg max-w-md mx-auto px-4">
      Use Voice Analysis to create your first {gameLabel.toUpperCase()} analysis!
    </p>
  </div>
);
