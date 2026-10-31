import React from "react";
import { useVoiceAssistant } from "../../hooks/useVoiceAssistant";
import type { Analysis } from "../../types/analysis";
import type { GameType } from "../../types/game";
import VoiceToolbar from "./VoiceToolbar";
import MicButton from "./MicButton";
import TranscriptPanel from "./TranscriptPanel";
import VoiceCommandsHelp from "./VoiceCommandsHelp";

interface Props {
  userToken: string;
  initialGame?: GameType;
  onAnalysis?: (analysis: Analysis) => void;
}

const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
  const voice = useVoiceAssistant({ token: userToken, initialGame, onAnalysis });
  const { platform } = voice;

  const micDenied = voice.micPermission === "denied";
  const micDisabled = micDenied || (!platform.useHttp && !voice.isConnected) || voice.isInitializing;
  const wakeDisabled =
    micDenied || !voice.isConnected || voice.isInitializing || platform.useHttp || !platform.supportsRecognition;
  const connectionLabel = platform.useHttp ? "📱 HTTP" : voice.isConnected ? "🟢" : "🔴";

  return (
    <div className="p-3 sm:p-4 bg-gray-900 rounded-xl text-white max-w-xl">
      <VoiceToolbar
        game={voice.game}
        status={voice.status}
        connectionLabel={connectionLabel}
        platformInfo={platform.info}
        enableTTS={voice.enableTTS}
        wakeActive={voice.wakeActive}
        wakeDisabled={wakeDisabled}
        resetDisabled={voice.isInitializing}
        onReset={voice.resetMicrophone}
        onToggleTTS={voice.toggleTTS}
        onToggleWake={voice.toggleWake}
        onSwitchGame={voice.switchGame}
      />

      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        <MicButton
          listening={voice.listening}
          disabled={micDisabled}
          onClick={voice.toggleListening}
          onPress={voice.pressToTalk}
          onRelease={voice.releaseToTalk}
        />
        <TranscriptPanel
          transcript={voice.transcript}
          listening={voice.listening}
          showActions={voice.listening && !platform.useHttp}
          onSend={voice.sendNow}
          onClear={voice.clearTranscript}
        />
      </div>

      <VoiceCommandsHelp
        game={voice.game}
        isMobile={platform.isMobile}
        useHttp={platform.useHttp}
        supportsTTS={platform.supportsTTS}
      />
    </div>
  );
};

export default VoiceInput;
