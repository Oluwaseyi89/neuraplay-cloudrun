import React from "react";
import { GAMES, GAME_TYPES } from "../../types/game";
import type { GameType } from "../../types/game";

interface Props {
  selected: GameType;
  onSelect: (game: GameType) => void;
}

const GameSelector: React.FC<Props> = ({ selected, onSelect }) => (
  <div className="bg-gray-700/50 rounded-xl p-1 sm:p-2 w-full sm:w-auto">
    <div className="flex space-x-1 sm:space-x-2 justify-center sm:justify-start">
      {GAME_TYPES.map((game) => (
        <button
          key={game}
          className={`flex-1 sm:flex-none px-3 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-lg transition-all duration-200 ${
            selected === game ? GAMES[game].activeTab : "text-gray-300 hover:bg-gray-600 hover:text-white"
          }`}
          onClick={() => onSelect(game)}
        >
          {GAMES[game].icon} {GAMES[game].label}
        </button>
      ))}
    </div>
  </div>
);

export default GameSelector;
