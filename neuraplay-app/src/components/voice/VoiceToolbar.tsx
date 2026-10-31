import React from "react";
import { Ear, EarOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import type { GameType } from "../../types/game";

interface Props {
  game: GameType;
  status: string;
  connectionLabel: string;
  platformInfo: string;
  enableTTS: boolean;
  wakeActive: boolean;
  wakeDisabled: boolean;
  resetDisabled: boolean;
  onReset: () => void;
  onToggleTTS: () => void;
  onToggleWake: () => void;
  onSwitchGame: () => void;
}

const VoiceToolbar: React.FC<Props> = ({
  game,
  status,
  connectionLabel,
  platformInfo,
  enableTTS,
  wakeActive,
  wakeDisabled,
  resetDisabled,
  onReset,
  onToggleTTS,
  onToggleWake,
  onSwitchGame,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3">
    <div className="flex items-center gap-2">
      <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
      <div className="text-xs text-gray-400">
        {status} {connectionLabel}
        <span className="ml-1 text-gray-500">({platformInfo})</span>
      </div>
    </div>

    <div className="flex flex-wrap gap-1 sm:gap-2">
      <button
        onClick={onReset}
        disabled={resetDisabled}
        className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
        title="Reset microphone"
      >
        <RefreshCw size={12} />
        Reset
      </button>

      <button
        onClick={onToggleTTS}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          enableTTS ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
        }`}
        title={enableTTS ? "Disable voice responses" : "Enable voice responses"}
      >
        {enableTTS ? <Volume2 size={12} /> : <VolumeX size={12} />}
        {enableTTS ? "Voice On" : "Voice Off"}
      </button>

      <button
        onClick={onToggleWake}
        disabled={wakeDisabled}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
        } ${wakeDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {wakeActive ? <Ear size={12} /> : <EarOff size={12} />}
        {wakeActive ? "Wake On" : "Wake Off"}
      </button>

      <button onClick={onSwitchGame} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">
        Switch
      </button>
    </div>
  </div>
);

export default VoiceToolbar;
