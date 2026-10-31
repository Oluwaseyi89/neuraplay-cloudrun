import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Ear, EarOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import api, { API_BASE } from "../services/api";
import { wakeWordListener } from "../services/wakeWordListener";

type GameType = "fifa" | "lol";

interface Props {
  userToken: string;
  initialGame?: GameType;
  onAnalysis?: (data: any) => void;
}

// Game-specific wake phrases
const FIFA_WAKE_PHRASES = [
  "hey fifa", "fifa", "fee fa", "vyfa", "vifa", "fiver", "ea fc", "ea football", "hey ea"
];

const LOL_WAKE_PHRASES = [
  "hey lol", "lol", "league", "league of legends", "lowl", "lawl", "hey league", "hey legends", "legends"
];

// Tiny silent WAV used to unlock audio playback during a user gesture (needed on iOS)
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// Give up waiting for the server after this long
const RESPONSE_TIMEOUT_MS = 90000;

let nextInstanceId = 1;

// Platform detection utilities
const getPlatformType = (): 'mobile' | 'desktop' | 'tablet' => {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP)))/i.test(userAgent);

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
};

const isAndroidChrome = (): boolean => {
  return /android.*chrome\/[.0-9]*/i.test(navigator.userAgent);
};

const isIOS = (): boolean => {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

const getBrowserType = (): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'chrome';
  if (userAgent.includes('Firefox')) return 'firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'safari';
  if (userAgent.includes('Edg')) return 'edge';
  return 'other';
};

// Check if browser supports SpeechSynthesis API
const supportsSpeechSynthesis = (): boolean => {
  return 'speechSynthesis' in window;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Levenshtein distance utility
function levenshteinDistance(a: string, b: string): number {
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const v0 = new Array(blen + 1).fill(0);
  const v1 = new Array(blen + 1).fill(0);

  for (let j = 0; j <= blen; j++) v0[j] = j;
  for (let i = 0; i < alen; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < blen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= blen; j++) v0[j] = v1[j];
  }
  return v1[blen];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
  const [game, setGame] = useState<GameType>(initialGame);
  const [listening, setListening] = useState(false);
  const [wakeActive, setWakeActive] = useState(true);
  const [transcript, setTranscript] = useState<string>("");
  const [status, setStatus] = useState<string>("Initializing...");
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [micReady, setMicReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [enableTTS, setEnableTTS] = useState(true);

  // Refs
  const instanceId = useRef(nextInstanceId++).current;
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const chunkSendQueue = useRef<Promise<void>>(Promise.resolve());
  const sendOnStop = useRef(false);
  const mainRec = useRef<any | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalBuffer = useRef<string>("");
  const ws = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const audioUnlocked = useRef(false);

  // Live values for callbacks that outlive a render (recognizers, sockets, timers)
  const gameRef = useRef(game);
  const listeningRef = useRef(false);
  const wakeActiveRef = useRef(wakeActive);
  const enableTTSRef = useRef(enableTTS);
  const awaitingResponse = useRef(false);
  gameRef.current = game;
  wakeActiveRef.current = wakeActive;
  enableTTSRef.current = enableTTS;

  // Platform-specific configuration
  const platformType = getPlatformType();
  const browserType = getBrowserType();
  const isAndroid = isAndroidChrome();
  const isApple = isIOS();
  const supportsTTS = supportsSpeechSynthesis();

  // Protocol decision: Mobile/Tablet use HTTP, Desktop uses WebSocket
  const shouldUseHTTP = platformType === 'mobile' || platformType === 'tablet';

  const platformConfig = {
    isMobile: platformType === 'mobile',
    isDesktop: platformType === 'desktop',
    isTablet: platformType === 'tablet',
    isAndroidChrome: isAndroid,
    isIOS: isApple,
    browser: browserType,
    supportsTTS: supportsTTS,
    supportsRecognition: wakeWordListener.isSupported,

    // Platform-specific settings
    getAudioConstraints: () => {
      if (platformType === 'mobile') {
        if (isAndroid) {
          return {
            audio: {
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: false,
            }
          };
        } else if (isApple) {
          return {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            }
          };
        }
      }

      return {
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
    },

    getRecordingInterval: () => {
      return platformType === 'mobile' ? 250 : 100;
    },

    getSilenceTimeout: () => {
      return platformType === 'mobile' ? 6000 : 4000;
    },

    getWakeSimilarityThreshold: () => {
      return platformType === 'mobile' ? 0.55 : 0.65;
    },

    getMimeType: (): string => {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        return 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        return 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        return 'audio/webm';
      }
      return '';
    },
  };

  const updateListening = (value: boolean) => {
    listeningRef.current = value;
    setListening(value);
  };

  const getCurrentWakePhrases = (): string[] => {
    return gameRef.current === "fifa" ? FIFA_WAKE_PHRASES : LOL_WAKE_PHRASES;
  };

  const getWakeStatusMessage = (): string => {
    const phrases = getCurrentWakePhrases();
    const mainPhrase = phrases[0];
    return `Say '${mainPhrase}'`;
  };

  const getIdleStatus = (): string => {
    if (shouldUseHTTP) return "Ready - Press mic to speak";
    return wakeActiveRef.current ? getWakeStatusMessage() : "Ready";
  };

  const getPlatformInfo = (): string => {
    return `${platformType}-${browserType}`;
  };

  // ----------------------
  // Audio output
  // ----------------------
  const getAudioElement = (): HTMLAudioElement => {
    if (!audioEl.current) audioEl.current = new Audio();
    return audioEl.current;
  };

  // Must run inside a user gesture; afterwards the same element may play without one
  const unlockAudio = () => {
    if (audioUnlocked.current) return;
    const el = getAudioElement();
    el.src = SILENT_WAV;
    el.play()
      .then(() => {
        el.pause();
        audioUnlocked.current = true;
      })
      .catch(() => {});

    if (platformConfig.supportsTTS) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  };

  const stopPlayback = () => {
    audioEl.current?.pause();
    if (platformConfig.supportsTTS) window.speechSynthesis.cancel();
  };

  const playBase64Audio = (base64Data: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const el = getAudioElement();
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("Audio playback failed"));
      el.src = base64Data.startsWith('data:') ? base64Data : `data:audio/mpeg;base64,${base64Data}`;
      el.play().catch(reject);
    });
  };

  // Client-side TTS as fallback
  const speakText = (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!platformConfig.supportsTTS) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      const ttsTimeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        reject(new Error('TTS timeout'));
      }, Math.max(10000, text.length * 120));

      utterance.onend = () => {
        clearTimeout(ttsTimeout);
        resolve();
      };

      utterance.onerror = () => {
        clearTimeout(ttsTimeout);
        reject(new Error('TTS failed'));
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  // Server audio first; fall back to the browser's voice if it is missing or blocked
  const speakResponse = async (data: any) => {
    if (!enableTTSRef.current) return;

    if (data.tts_audio) {
      setStatus("Playing response...");
      try {
        await playBase64Audio(data.tts_audio);
        return;
      } catch (err) {
        console.warn("Server audio playback failed, using browser voice:", err);
      }
    }

    const text = data.analysis?.summary;
    if (text && platformConfig.supportsTTS) {
      setStatus("Speaking response...");
      try {
        await speakText(text);
      } catch (err) {
        console.warn("Browser voice failed:", err);
      }
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
    wakeWordListener.resume(instanceId);
    setStatus(finalStatus || getIdleStatus());
  };

  const handleServerResult = async (data: any) => {
    if (data.transcript) {
      setTranscript(data.transcript);
      setStatus("Analyzing...");
    }

    if (data.analysis) {
      console.log("✅ Analysis received:", data.analysis);
      onAnalysis?.(data.analysis);
      setStatus("Analysis received");
      await speakResponse(data);
      finishResponse();
      return;
    }

    if (data.error && !data.error.includes('TTS failed')) {
      finishResponse("Error: " + data.error);
    }
  };

  // HTTP Processing for Mobile/Tablet
  const processVoiceViaHTTP = async (audioBlob: Blob): Promise<void> => {
    setStatus("Processing...");

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('game', gameRef.current);

      console.log(`📤 Sending audio via HTTP: ${audioBlob.size} bytes`);

      const { data } = await api.post('/api/process-voice-input/', formData);
      await handleServerResult(data);
      if (awaitingResponse.current) finishResponse();
    } catch (error) {
      console.error("❌ HTTP processing failed:", error);
      finishResponse("Processing failed - try again");
    }
  };

  // Latest handlers for long-lived callbacks
  const messageHandlerRef = useRef(handleServerResult);
  messageHandlerRef.current = handleServerResult;

  // WebSocket connection - ONLY for Desktop
  useEffect(() => {
    // Skip WebSocket setup if using HTTP (mobile/tablet)
    if (shouldUseHTTP) {
      console.log("🔄 HTTP Mode: WebSocket disabled");
      setIsConnected(false);
      return;
    }

    if (!userToken) return;

    let disposed = false;
    let unauthorized = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/voice-analysis/';
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log(`WebSocket connected on ${getPlatformInfo()}`);
        socket.send(JSON.stringify({ type: 'auth', token: userToken }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        if (data.status === 'authenticated') {
          setIsConnected(true);
          if (!listeningRef.current && !awaitingResponse.current) setStatus(getIdleStatus());
          return;
        }

        if (data.error === 'Unauthorized') {
          unauthorized = true;
          setStatus("Session expired - log in again");
          return;
        }

        messageHandlerRef.current(data);
      };

      socket.onclose = (event) => {
        console.log(`WebSocket disconnected on ${getPlatformInfo()}:`, event.code, event.reason);
        if (ws.current === socket) {
          ws.current = null;
          setIsConnected(false);
        }
        if (awaitingResponse.current) finishResponse("Connection lost - try again");

        if (!disposed && !unauthorized) {
          setStatus("Reconnecting...");
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
      ws.current = null;
      setIsConnected(false);
    };
  }, [userToken, shouldUseHTTP]);

  // ----------------------
  // Microphone and recording
  // ----------------------
  const acquireMicrophone = async (): Promise<MediaStream | null> => {
    try {
      const constraints = platformConfig.getAudioConstraints();
      console.log(`Initializing microphone for ${getPlatformInfo()} with constraints:`, constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
        .catch(async (err) => {
          console.warn("Primary constraints failed, trying fallback:", err);
          return await navigator.mediaDevices.getUserMedia({ audio: true });
        });

      setMicPermission("granted");
      return stream;
    } catch (err) {
      console.error("Microphone initialization failed:", err);
      setMicPermission("denied");
      setStatus("Microphone access denied");
      return null;
    }
  };

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const initializeMicrophone = async (): Promise<boolean> => {
    setStatus("Requesting microphone...");
    releaseMicrophone();
    const stream = await acquireMicrophone();
    streamRef.current = stream;
    setMicReady(Boolean(stream));
    return Boolean(stream);
  };

  const hasLiveStream = (): boolean =>
    Boolean(streamRef.current?.getAudioTracks().some(track => track.readyState === 'live'));

  const sendWs = (payload: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(payload));
    }
  };

  const startAudioRecording = async (): Promise<boolean> => {
    try {
      if (!hasLiveStream()) {
        const initialized = await initializeMicrophone();
        if (!initialized) return false;
      }

      audioChunks.current = [];
      chunkSendQueue.current = Promise.resolve();
      sendOnStop.current = false;

      const mimeType = platformConfig.getMimeType();
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current!, { mimeType })
        : new MediaRecorder(streamRef.current!);
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        audioChunks.current.push(event.data);

        // Desktop streams chunks over the WebSocket, in order
        if (!shouldUseHTTP) {
          const chunk = event.data;
          chunkSendQueue.current = chunkSendQueue.current
            .then(() => blobToBase64(chunk))
            .then((audio_base64) => sendWs({ type: 'audio_chunk', audio_base64 }))
            .catch((err) => console.warn("Failed to send audio chunk:", err));
        }
      };

      // The final chunk is delivered just before stop, so signal the server only after it is sent
      recorder.onstop = async () => {
        const send = sendOnStop.current;

        if (shouldUseHTTP) {
          if (send && audioChunks.current.length > 0) {
            const audioBlob = new Blob(audioChunks.current, { type: recorder.mimeType || 'audio/webm' });
            await processVoiceViaHTTP(audioBlob);
          } else if (send) {
            finishResponse("No audio recorded - try again");
          }
          return;
        }

        await chunkSendQueue.current;
        if (send) {
          sendWs({ type: 'speech_end', game: gameRef.current });
        } else {
          sendWs({ type: 'speech_cancel' });
        }
      };

      const interval = platformConfig.getRecordingInterval();
      recorder.start(interval);

      console.log(`Started recording with ${interval}ms interval on ${getPlatformInfo()}`);
      return true;

    } catch (err) {
      console.error("Audio recording failed:", err);
      setStatus("Recording failed");
      return false;
    }
  };

  const stopAudioRecording = (send: boolean) => {
    sendOnStop.current = send;
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  };

  const safeStop = (rec: any | null) => {
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      rec.stop();
    } catch {}
  };

  const resetSilenceTimer = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }

    const timeout = platformConfig.getSilenceTimeout();
    silenceTimer.current = setTimeout(() => {
      stopMainRecognition(true);
    }, timeout);
  };

  const startMainRecognition = async () => {
    if (listeningRef.current || awaitingResponse.current) return;

    stopPlayback();
    wakeWordListener.pause(instanceId);

    // HTTP Mode (mobile/tablet): Simple recording
    if (shouldUseHTTP) {
      const recordingStarted = await startAudioRecording();
      if (!recordingStarted) {
        finishResponse("Failed to start recording");
        return;
      }
      updateListening(true);
      setStatus("Recording... Speak now");
      return;
    }

    // WebSocket Mode (desktop)
    if (ws.current?.readyState !== WebSocket.OPEN) {
      finishResponse("Not connected");
      return;
    }

    finalBuffer.current = "";
    setTranscript("");
    setStatus("Starting...");

    const recordingStarted = await startAudioRecording();
    if (!recordingStarted) {
      finishResponse("Failed to start");
      return;
    }

    updateListening(true);

    if (platformConfig.supportsRecognition) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const rec = new SpeechRecognition();
      mainRec.current = rec;

      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const t = r[0]?.transcript || "";
          if (r.isFinal) {
            finalBuffer.current += (finalBuffer.current ? " " : "") + t;
          } else {
            interim += t;
          }
        }
        const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
        setTranscript(display);
        resetSilenceTimer();
      };

      rec.onerror = (ev: any) => {
        console.warn("Main rec error:", ev?.error);
        if (ev?.error === "not-allowed") {
          setMicPermission("denied");
          setStatus("Microphone denied");
        }
        stopMainRecognition(false);
      };

      rec.onend = () => {
        if (listeningRef.current) stopMainRecognition(true);
      };

      try {
        rec.start();
        setStatus("Listening...");
      } catch (err) {
        console.error("Failed to start recognition:", err);
        setStatus("Recording...");
      }
    } else {
      setStatus("Recording... press stop when done");
    }
  };

  const stopMainRecognition = (sendData: boolean) => {
    if (!listeningRef.current) return;

    safeStop(mainRec.current);
    mainRec.current = null;

    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }

    const text = finalBuffer.current.trim();
    finalBuffer.current = "";
    updateListening(false);

    // Without browser recognition we can't tell if anything was said, so let the server decide
    const send = sendData && (shouldUseHTTP || Boolean(text) || !platformConfig.supportsRecognition);

    if (send) {
      beginAwaitingResponse();
      setStatus("Processing...");
    }
    stopAudioRecording(send);

    if (!send) {
      finishResponse(sendData ? "Didn't catch that - try again" : undefined);
    }
  };

  // Whole-word matching so e.g. "league" or "yeah" never trigger the FIFA panel
  const detectWakeIntent = (textRaw: string): boolean => {
    if (!textRaw) return false;
    const text = textRaw.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return false;

    const similarityThreshold = platformConfig.getWakeSimilarityThreshold();

    return getCurrentWakePhrases().some((phrase) =>
      new RegExp(`\\b${phrase}\\b`).test(text) || similarity(text, phrase) >= similarityThreshold
    );
  };

  const wakeHandlersRef = useRef({ detectWakeIntent, startMainRecognition });
  wakeHandlersRef.current = { detectWakeIntent, startMainRecognition };

  // Shared wake-word listener (desktop only)
  useEffect(() => {
    if (shouldUseHTTP || !wakeActive || !isConnected || !micReady) return;

    wakeWordListener.subscribe(
      instanceId,
      (text) => wakeHandlersRef.current.detectWakeIntent(text),
      () => {
        setStatus("Wake detected");
        wakeHandlersRef.current.startMainRecognition();
      }
    );
    if (!listeningRef.current && !awaitingResponse.current) setStatus(getWakeStatusMessage());

    return () => wakeWordListener.unsubscribe(instanceId);
  }, [wakeActive, isConnected, micReady, shouldUseHTTP]);

  const toggleWake = () => {
    // No wake word for HTTP mode (mobile/tablet)
    if (shouldUseHTTP) {
      setStatus("Wake word not available on mobile");
      return;
    }

    unlockAudio();
    if (wakeActive) {
      setWakeActive(false);
      setStatus("Wake disabled");
    } else {
      setWakeActive(true);
      setStatus(getWakeStatusMessage());
    }
  };

  const toggleTTS = () => {
    unlockAudio();
    if (enableTTS) stopPlayback();
    setEnableTTS(!enableTTS);
    setStatus(enableTTS ? "Voice responses disabled" : "Voice responses enabled");
  };

  const handleGameSwitch = (newGame: GameType) => {
    setGame(newGame);
    gameRef.current = newGame;
    if (!listeningRef.current && !awaitingResponse.current) setStatus(getIdleStatus());
  };

  const handleMicClick = () => {
    unlockAudio();
    if (listeningRef.current) {
      stopMainRecognition(true);
    } else {
      startMainRecognition();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!listeningRef.current) {
      startMainRecognition();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (listeningRef.current) {
      stopMainRecognition(true);
    }
  };

  const handleResetMicrophone = async () => {
    unlockAudio();
    setStatus("Resetting...");

    safeStop(mainRec.current);
    mainRec.current = null;
    stopAudioRecording(false);
    stopPlayback();
    updateListening(false);
    setTranscript("");
    finalBuffer.current = "";

    await initializeMicrophone();
    finishResponse();
  };

  const clearTranscript = () => {
    setTranscript("");
    finalBuffer.current = "";
  };

  // Microphone setup on mount, full teardown on unmount
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setIsInitializing(true);
      setStatus("Requesting microphone...");

      const stream = await acquireMicrophone();
      if (cancelled) {
        stream?.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;
      setMicReady(Boolean(stream));
      if (!stream) {
        setStatus("Microphone required");
        setWakeActive(false);
      } else {
        setStatus(shouldUseHTTP ? "Ready - Press mic to speak" : "Connecting...");
      }
      setIsInitializing(false);
    };

    initialize();

    // Any first interaction unlocks audio so wake-word responses can play aloud
    const unlockOnGesture = () => unlockAudio();
    document.addEventListener('pointerdown', unlockOnGesture, { once: true });
    document.addEventListener('keydown', unlockOnGesture, { once: true });

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', unlockOnGesture);
      document.removeEventListener('keydown', unlockOnGesture);
      safeStop(mainRec.current);
      wakeWordListener.unsubscribe(instanceId);
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.onstop = null;
        mediaRecorder.current.stop();
      }
      releaseMicrophone();
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (responseTimer.current) clearTimeout(responseTimer.current);
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-3 sm:p-4 bg-gray-900 rounded-xl text-white max-w-xl">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
          <div className="text-xs text-gray-400">
            {status} {shouldUseHTTP ? "📱 HTTP" : (isConnected ? "🟢" : "🔴")}
            <span className="ml-1 text-gray-500">({getPlatformInfo()})</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-1 sm:gap-2">
          <button
            onClick={handleResetMicrophone}
            disabled={isInitializing}
            className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
            title="Reset microphone"
          >
            <RefreshCw size={12} />
            Reset
          </button>

          <button
            onClick={toggleTTS}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              enableTTS ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={enableTTS ? "Disable voice responses" : "Enable voice responses"}
          >
            {enableTTS ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {enableTTS ? "Voice On" : "Voice Off"}
          </button>

          <button
            onClick={toggleWake}
            disabled={micPermission === "denied" || !isConnected || isInitializing || shouldUseHTTP || !platformConfig.supportsRecognition}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            } ${(micPermission === "denied" || !isConnected || isInitializing || shouldUseHTTP || !platformConfig.supportsRecognition) ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {wakeActive ? <Ear size={12} /> : <EarOff size={12} />}
            {wakeActive ? "Wake On" : "Wake Off"}
          </button>

          <button
            onClick={() => handleGameSwitch(game === "fifa" ? "lol" : "fifa")}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
          >
            Switch
          </button>
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        {/* Microphone Button with touch support */}
        <button
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleMicClick}
          disabled={micPermission === "denied" || (!shouldUseHTTP && !isConnected) || isInitializing}
          className={`flex-shrink-0 p-3 sm:p-4 rounded-full transition-all ${
            listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
          } ${(micPermission === "denied" || (!shouldUseHTTP && !isConnected) || isInitializing) ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {listening ? <Square size={18} /> : <Mic size={18} />}
        </button>

        {/* Transcript Area */}
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

          {/* Action Buttons */}
          {transcript && listening && !shouldUseHTTP && (
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <button
                onClick={() => stopMainRecognition(true)}
                className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm"
              >
                Send for Analysis
              </button>
              <button
                onClick={clearTranscript}
                className="px-3 bg-gray-600 hover:bg-gray-700 py-2 rounded text-sm"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Voice Commands Help */}
      <div className="mt-3 p-2 sm:p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
        <div>Voice Commands for {game.toUpperCase()}:</div>
        <ul className="list-disc ml-3 mt-1 space-y-1">
          {game === "fifa" ? (
            <>
              <li><span className="font-mono">"Hey FIFA"</span> — start analysis</li>
              <li><span className="font-mono">"FIFA"</span> — start analysis</li>
              {platformConfig.isMobile && (
                <li><span className="font-mono">"Fee Fa"</span> — mobile alternative</li>
              )}
            </>
          ) : (
            <>
              <li><span className="font-mono">"Hey LOL"</span> — start analysis</li>
              <li><span className="font-mono">"LOL"</span> — start analysis</li>
              {platformConfig.isMobile && (
                <li><span className="font-mono">"Lowl"</span> — mobile alternative</li>
              )}
            </>
          )}
        </ul>
        {shouldUseHTTP && (
          <div className="mt-2 text-yellow-200">
            📱 Mobile Mode: Press mic to record and analyze
          </div>
        )}
        {!platformConfig.supportsTTS && (
          <div className="mt-2 text-yellow-200">
            ⓘ Browser voice not supported - server voice only
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInput;
