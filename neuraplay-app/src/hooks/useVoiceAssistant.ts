import { useEffect, useMemo, useRef, useState } from "react";
import { detectPlatform } from "../lib/platform";
import { blobToBase64 } from "../lib/audio";
import { detectWakeIntent, getWakePrompt } from "../lib/wakePhrases";
import { analysisService } from "../services/analysisService";
import { createSubscriberId, wakeWordListener } from "../services/wakeWordListener";
import { useMicrophone } from "./useMicrophone";
import { useAudioRecorder } from "./useAudioRecorder";
import { useLiveTranscription } from "./useLiveTranscription";
import { useAudioPlayback } from "./useAudioPlayback";
import { useVoiceSocket } from "./useVoiceSocket";
import type { Analysis, VoiceResult } from "../types/analysis";
import type { GameType } from "../types/game";

// Give up waiting for the server after this long
const RESPONSE_TIMEOUT_MS = 90000;

interface Options {
  token: string;
  initialGame: GameType;
  onAnalysis?: (analysis: Analysis) => void;
}

/**
 * Voice coaching flow for one panel: wake word → record → send (WebSocket on
 * desktop, HTTP on mobile) → show the analysis and speak the response.
 */
export const useVoiceAssistant = ({ token, initialGame, onAnalysis }: Options) => {
  const platform = useMemo(() => detectPlatform(), []);
  const [subscriberId] = useState(createSubscriberId);

  const [game, setGame] = useState<GameType>(initialGame);
  const [listening, setListening] = useState(false);
  const [wakeActive, setWakeActive] = useState(true);
  const [enableTTS, setEnableTTS] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Initializing...");

  // Live values for callbacks that outlive a render (recognizers, sockets, timers)
  const gameRef = useRef(game);
  const listeningRef = useRef(false);
  const wakeActiveRef = useRef(wakeActive);
  const enableTTSRef = useRef(enableTTS);
  const awaitingResponse = useRef(false);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  gameRef.current = game;
  wakeActiveRef.current = wakeActive;
  enableTTSRef.current = enableTTS;

  const mic = useMicrophone(platform.audioConstraints);
  const playback = useAudioPlayback(platform.supportsTTS);

  const isIdle = () => !listeningRef.current && !awaitingResponse.current;

  const getIdleStatus = (): string => {
    if (platform.useHttp) return "Ready - Press mic to speak";
    return wakeActiveRef.current ? getWakePrompt(gameRef.current) : "Ready";
  };

  const updateListening = (value: boolean) => {
    listeningRef.current = value;
    setListening(value);
  };

  const clearSilenceTimer = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

  // ----------------------
  // Response lifecycle
  // ----------------------
  const beginAwaitingResponse = () => {
    awaitingResponse.current = true;
    if (responseTimer.current) clearTimeout(responseTimer.current);
    responseTimer.current = setTimeout(() => {
      console.warn("No response from server in time");
      finishResponse("No response - try again");
    }, RESPONSE_TIMEOUT_MS);
  };

  const finishResponse = (finalStatus?: string) => {
    awaitingResponse.current = false;
    if (responseTimer.current) {
      clearTimeout(responseTimer.current);
      responseTimer.current = null;
    }
    wakeWordListener.resume(subscriberId);
    setStatus(finalStatus || getIdleStatus());
  };

  const handleResult = async (data: VoiceResult) => {
    if (data.transcript) {
      setTranscript(data.transcript);
      setStatus("Analyzing...");
    }

    if (data.analysis) {
      console.log("✅ Analysis received:", data.analysis);
      onAnalysis?.(data.analysis);
      setStatus("Analysis received");
      if (enableTTSRef.current) await playback.speak(data, setStatus);
      finishResponse();
      return;
    }

    if (data.error && !data.error.includes("TTS failed")) {
      finishResponse("Error: " + data.error);
    }
  };

  // Mobile/tablet: upload the whole recording
  const processViaHttp = async (audio: Blob) => {
    setStatus("Processing...");
    console.log(`📤 Sending audio via HTTP: ${audio.size} bytes`);
    try {
      await handleResult(await analysisService.processVoice(audio, gameRef.current));
      if (awaitingResponse.current) finishResponse();
    } catch (error) {
      console.error("❌ HTTP processing failed:", error);
      finishResponse("Processing failed - try again");
    }
  };

  // ----------------------
  // Transport, recording and live transcript
  // ----------------------
  const socket = useVoiceSocket({
    token,
    enabled: !platform.useHttp,
    onAuthenticated: () => {
      if (isIdle()) setStatus(getIdleStatus());
    },
    onUnauthorized: () => setStatus("Session expired - log in again"),
    onMessage: handleResult,
    onDisconnected: (willReconnect) => {
      if (awaitingResponse.current) finishResponse("Connection lost - try again");
      if (willReconnect) setStatus("Reconnecting...");
    },
  });

  const recorder = useAudioRecorder({
    intervalMs: platform.recordingIntervalMs,
    // Desktop streams chunks as they are recorded
    onChunk: platform.useHttp
      ? undefined
      : async (chunk) => socket.send({ type: "audio_chunk", audio_base64: await blobToBase64(chunk) }),
    onStop: async (chunks, mimeType, send) => {
      if (platform.useHttp) {
        if (send && chunks.length > 0) {
          await processViaHttp(new Blob(chunks, { type: mimeType }));
        } else if (send) {
          finishResponse("No audio recorded - try again");
        }
        return;
      }
      socket.send(send ? { type: "speech_end", game: gameRef.current } : { type: "speech_cancel" });
    },
  });

  const transcription = useLiveTranscription({
    onUpdate: (display) => {
      setTranscript(display);
      resetSilenceTimer();
    },
    onError: (error) => {
      console.warn("Main rec error:", error);
      if (error === "not-allowed") {
        mic.markDenied();
        setStatus("Microphone denied");
      }
      stopListening(false);
    },
    onEnd: () => {
      if (listeningRef.current) stopListening(true);
    },
  });

  // ----------------------
  // Listening
  // ----------------------
  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => stopListening(true), platform.silenceTimeoutMs);
  };

  const startListening = async () => {
    if (!isIdle()) return;

    playback.stop();
    wakeWordListener.pause(subscriberId);

    if (!platform.useHttp && !socket.isOpen()) {
      finishResponse("Not connected");
      return;
    }

    setTranscript("");
    setStatus("Starting...");

    const stream = await mic.ensureStream();
    if (!stream || !recorder.start(stream)) {
      finishResponse("Failed to start recording");
      return;
    }
    updateListening(true);

    if (platform.useHttp) {
      setStatus("Recording... Speak now");
    } else if (platform.supportsRecognition && transcription.start()) {
      setStatus("Listening...");
    } else {
      setStatus("Recording... press stop when done");
    }
  };

  const stopListening = (sendData: boolean) => {
    if (!listeningRef.current) return;

    const text = transcription.stop();
    clearSilenceTimer();
    updateListening(false);

    // Without browser recognition we can't tell if anything was said, so let the server decide
    const send = sendData && (platform.useHttp || Boolean(text) || !platform.supportsRecognition);

    if (send) {
      beginAwaitingResponse();
      setStatus("Processing...");
    }
    recorder.stop(send);

    if (!send) {
      finishResponse(sendData ? "Didn't catch that - try again" : undefined);
    }
  };

  // ----------------------
  // Wake word (desktop only) and setup status
  // ----------------------
  const wakeHandlersRef = useRef({ startListening });
  wakeHandlersRef.current = { startListening };

  useEffect(() => {
    if (platform.useHttp || !wakeActive || !socket.isConnected || !mic.ready) return;

    wakeWordListener.subscribe(
      subscriberId,
      (heard) => detectWakeIntent(heard, gameRef.current, platform.wakeSimilarityThreshold),
      () => {
        setStatus("Wake detected");
        wakeHandlersRef.current.startListening();
      }
    );
    if (isIdle()) setStatus(getWakePrompt(gameRef.current));

    return () => wakeWordListener.unsubscribe(subscriberId);
  }, [platform, subscriberId, wakeActive, socket.isConnected, mic.ready]);

  useEffect(() => {
    if (mic.initializing) return;
    if (!mic.ready) {
      setStatus("Microphone required");
      setWakeActive(false);
    } else if (platform.useHttp) {
      setStatus("Ready - Press mic to speak");
    } else if (!socket.isConnected) {
      setStatus("Connecting...");
    }
    // Only react to the initial microphone setup finishing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.initializing]);

  useEffect(() => () => {
    wakeWordListener.unsubscribe(subscriberId);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (responseTimer.current) clearTimeout(responseTimer.current);
  }, [subscriberId]);

  // ----------------------
  // User actions
  // ----------------------
  const toggleListening = () => {
    playback.unlock();
    if (listeningRef.current) {
      stopListening(true);
    } else {
      startListening();
    }
  };

  /** Push-to-talk on touch screens */
  const pressToTalk = () => {
    playback.unlock();
    if (!listeningRef.current) startListening();
  };

  const releaseToTalk = () => {
    if (listeningRef.current) stopListening(true);
  };

  const sendNow = () => stopListening(true);

  const toggleWake = () => {
    if (platform.useHttp) {
      setStatus("Wake word not available on mobile");
      return;
    }
    playback.unlock();
    setWakeActive(!wakeActive);
    setStatus(wakeActive ? "Wake disabled" : getWakePrompt(gameRef.current));
  };

  const toggleTTS = () => {
    playback.unlock();
    if (enableTTS) playback.stop();
    setEnableTTS(!enableTTS);
    setStatus(enableTTS ? "Voice responses disabled" : "Voice responses enabled");
  };

  const switchGame = () => {
    const next: GameType = game === "fifa" ? "lol" : "fifa";
    setGame(next);
    gameRef.current = next;
    if (isIdle()) setStatus(getIdleStatus());
  };

  const resetMicrophone = async () => {
    playback.unlock();
    setStatus("Resetting...");

    transcription.stop();
    clearSilenceTimer();
    if (listeningRef.current) recorder.stop(false);
    playback.stop();
    updateListening(false);
    setTranscript("");

    await mic.reinitialize();
    finishResponse();
  };

  const clearTranscript = () => {
    setTranscript("");
    transcription.clear();
  };

  return {
    platform,
    game,
    status,
    transcript,
    listening,
    wakeActive,
    enableTTS,
    isConnected: socket.isConnected,
    micPermission: mic.permission,
    isInitializing: mic.initializing,
    toggleListening,
    pressToTalk,
    releaseToTalk,
    sendNow,
    toggleWake,
    toggleTTS,
    switchGame,
    resetMicrophone,
    clearTranscript,
  };
};
