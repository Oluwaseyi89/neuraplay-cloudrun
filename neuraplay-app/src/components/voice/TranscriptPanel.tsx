import React from "react";

interface Props {
  transcript: string;
  listening: boolean;
  /** Show the Send/Clear actions (desktop, while recording) */
  showActions: boolean;
  onSend: () => void;
  onClear: () => void;
}

const TranscriptPanel: React.FC<Props> = ({ transcript, listening, showActions, onSend, onClear }) => (
  <div className="flex-1 min-w-0 w-full">
    <div className="p-3 bg-gray-800 rounded-lg min-h-[60px] w-full">
      {transcript ? (
        <div className="break-words">
          <div className="text-xs text-gray-300 mb-1">You said:</div>
          <div className="text-white text-sm">{transcript}</div>
        </div>
      ) : (
        <div className="text-gray-400 text-xs h-[60px] flex items-center">
          {listening ? "🎤 Speak now..." : "Transcript will appear here"}
        </div>
      )}
    </div>

    {transcript && showActions && (
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button onClick={onSend} className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm">
          Send for Analysis
        </button>
        <button onClick={onClear} className="px-3 bg-gray-600 hover:bg-gray-700 py-2 rounded text-sm">
          Clear
        </button>
      </div>
    )}
  </div>
);

export default TranscriptPanel;
