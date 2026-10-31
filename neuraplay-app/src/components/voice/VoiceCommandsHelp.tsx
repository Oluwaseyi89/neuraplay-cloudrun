import React from "react";
import type { GameType } from "../../types/game";

interface Props {
  game: GameType;
  isMobile: boolean;
  useHttp: boolean;
  supportsTTS: boolean;
}

const COMMANDS: Record<GameType, { primary: string[]; mobileAlternative: string }> = {
  fifa: { primary: ["Hey FIFA", "FIFA"], mobileAlternative: "Fee Fa" },
  lol: { primary: ["Hey LOL", "LOL"], mobileAlternative: "Lowl" },
};

const VoiceCommandsHelp: React.FC<Props> = ({ game, isMobile, useHttp, supportsTTS }) => {
  const { primary, mobileAlternative } = COMMANDS[game];

  return (
    <div className="mt-3 p-2 sm:p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
      <div>Voice Commands for {game.toUpperCase()}:</div>
      <ul className="list-disc ml-3 mt-1 space-y-1">
        {primary.map((phrase) => (
          <li key={phrase}><span className="font-mono">"{phrase}"</span> — start analysis</li>
        ))}
        {isMobile && (
          <li><span className="font-mono">"{mobileAlternative}"</span> — mobile alternative</li>
        )}
      </ul>
      {useHttp && (
        <div className="mt-2 text-yellow-200">📱 Mobile Mode: Press mic to record and analyze</div>
      )}
      {!supportsTTS && (
        <div className="mt-2 text-yellow-200">ⓘ Browser voice not supported - server voice only</div>
      )}
    </div>
  );
};

export default VoiceCommandsHelp;
