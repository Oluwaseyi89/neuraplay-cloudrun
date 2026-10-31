import React from "react";
import { Mic, Square } from "lucide-react";

interface Props {
  listening: boolean;
  disabled: boolean;
  onClick: () => void;
  onPress: () => void;
  onRelease: () => void;
}

/** Click to toggle recording; on touch screens it works as push-to-talk */
const MicButton: React.FC<Props> = ({ listening, disabled, onClick, onPress, onRelease }) => (
  <button
    onTouchStart={(e) => {
      e.preventDefault();
      onPress();
    }}
    onTouchEnd={(e) => {
      e.preventDefault();
      onRelease();
    }}
    onClick={onClick}
    disabled={disabled}
    aria-label={listening ? "Stop recording" : "Start recording"}
    className={`flex-shrink-0 p-3 sm:p-4 rounded-full transition-all ${
      listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
  >
    {listening ? <Square size={18} /> : <Mic size={18} />}
  </button>
);

export default MicButton;
