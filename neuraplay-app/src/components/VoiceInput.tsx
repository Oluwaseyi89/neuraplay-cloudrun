// VoiceInput.tsx
import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Ear, EarOff, RefreshCw } from "lucide-react";

type GameType = "fifa" | "lol";

interface Props {
  userToken: string;
  initialGame?: GameType;
  onAnalysis?: (data: any) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// Game-specific wake phrases
const FIFA_WAKE_PHRASES = [
  "hey fifa",
  "fifa",
  "fee fa", 
  "vyfa",
  "vifa",
  "ea fc",
  "ea football",
  "hey ea"
];

const LOL_WAKE_PHRASES = [
  "hey lol",
  "lol",
  "league",
  "league of legends", 
  "lowl",
  "hey league",
  "hey legends"
];

/* --------------------------
   Utility - Levenshtein-based similarity (0..1)
   -------------------------- */
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

/* --------------------------
   Component
   -------------------------- */
const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
  const [game, setGame] = useState<GameType>(initialGame);
  const [listening, setListening] = useState(false);
  const [wakeActive, setWakeActive] = useState(true);
  const [transcript, setTranscript] = useState<string>("");
  const [status, setStatus] = useState<string>("Initializing...");
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // refs
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const mainRec = useRef<any | null>(null);
  const wakeRec = useRef<any | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalBuffer = useRef<string>("");
  const processingWake = useRef(false);
  const wakeBackoff = useRef<number>(500);
  const isInitialized = useRef(false);
  const ws = useRef<WebSocket | null>(null);
  // const audioContext = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Get current game's wake phrases
  const getCurrentWakePhrases = (): string[] => {
    return game === "fifa" ? FIFA_WAKE_PHRASES : LOL_WAKE_PHRASES;
  };

  // Get status message based on current game
  const getWakeStatusMessage = (): string => {
    const phrases = getCurrentWakePhrases();
    const mainPhrase = phrases[0];
    return `Wake listening - say '${mainPhrase}'`;
  };

  // WebSocket connection
  useEffect(() => {
    if (!userToken) return;

    const wsUrl = API_BASE.replace('https', 'wss') + '/ws/voice-analysis/';
    console.log("WsUrl: ", wsUrl);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      ws.current?.send(JSON.stringify({
        type: 'auth',
        token: userToken
      }));
      setStatus("Connected - Ready");
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);

      if (data.status === 'authenticated') {
        setStatus("Authenticated - Ready");
      }

      if (data.transcript) {
        setTranscript(data.transcript);
        setStatus("Transcribed - Analyzing...");
      }

      if (data.analysis) {
        console.log("Analysis received:", data.analysis);
        onAnalysis?.(data.analysis);
        setStatus("Analysis received");
      }

      if (data.tts_audio) {
        setStatus("Playing response...");
        playBase64Audio(data.tts_audio).then(() => {
          setStatus("Response complete");
          if (wakeActive && !listening) {
            setTimeout(() => {
              setStatus(getWakeStatusMessage());
              startWakeEngine();
            }, 500);
          }
        }).catch(err => {
          console.warn("Audio playback failed:", err);
          setStatus("Analysis complete (audio failed)");
          if (wakeActive && !listening) {
            setTimeout(() => {
              setStatus(getWakeStatusMessage());
              startWakeEngine();
            }, 500);
          }
        });
      }

      if (data.error) {
        console.error("WebSocket error:", data.error);
        setStatus("Error: " + data.error);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setStatus("Disconnected");
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus("Connection error");
    };

    return () => {
      ws.current?.close();
    };
  }, [userToken, onAnalysis]);

  // Convert base64 to Audio and play
  const playBase64Audio = (base64Data: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const dataUri = base64Data.startsWith('data:') ? base64Data : `data:audio/mpeg;base64,${base64Data}`;
        const audio = new Audio(dataUri);
        
        audio.onended = () => {
          console.log("Audio playback finished");
          resolve();
        };
        
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          reject(new Error("Audio playback failed"));
        };

        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(err => {
            console.warn("Audio play blocked:", err);
            resolve();
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  // Pre-initialize microphone - FIXED
  const initializeMicrophone = async (): Promise<boolean> => {
    try {
      setStatus("Requesting microphone access...");
      
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;
      setMicPermission("granted");
      setStatus("Microphone ready");
      
      // Test the stream by creating a temporary recorder
      const testRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      return new Promise((resolve) => {
        testRecorder.onstart = () => {
          testRecorder.stop();
          resolve(true);
        };
        testRecorder.onerror = () => resolve(false);
        testRecorder.start();
        setTimeout(() => {
          try { testRecorder.stop(); } catch {}
          resolve(true);
        }, 100);
      });
      
    } catch (err) {
      console.error("Microphone initialization failed:", err);
      setMicPermission("denied");
      setStatus("Microphone access denied");
      return false;
    }
  };

  // Start recording audio for WebSocket - FIXED
  const startAudioRecording = async (): Promise<boolean> => {
    try {
      if (!streamRef.current) {
        const initialized = await initializeMicrophone();
        if (!initialized) return false;
      }

      if (!streamRef.current) {
        setStatus("Microphone not available");
        return false;
      }

      audioChunks.current = [];
      
      mediaRecorder.current = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({
                type: 'audio_chunk',
                audio_base64: base64
              }));
            }
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      mediaRecorder.current.start(100);
      return true;
      
    } catch (err) {
      console.error("Audio recording failed:", err);
      setStatus("Recording failed - try refreshing");
      return false;
    }
  };

  // Stop audio recording and send for analysis
  const stopAudioRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'speech_end',
          game: game
        }));
      }
    }
    
    // Don't stop the stream - keep it for reuse
  };

  // Helper: safe stop
  const safeStop = (rec: any | null) => {
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      rec.stop();
    } catch {
      // ignore
    }
  };

  // Permission check
  // const checkMicrophonePermission = async (): Promise<boolean> => {
  //   try {
  //     if (navigator.permissions && (navigator as any).permissions.query) {
  //       const p = await (navigator as any).permissions.query({ name: "microphone" });
  //       const state = p.state as "granted" | "denied" | "prompt";
  //       setMicPermission(state);
  //       return state === "granted";
  //     }
  //     return true;
  //   } catch (err) {
  //     console.warn("Permission check failed:", err);
  //     return false;
  //   }
  // };

  /* --------------------------
     Silence timer behavior
     -------------------------- */
  const resetSilenceTimer = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    silenceTimer.current = setTimeout(() => {
      const finalText = finalBuffer.current.trim();
      stopMainRecognition(Boolean(finalText));
    }, 4000);
  };

  /* --------------------------
     Main recognition (active recording) - FIXED
     -------------------------- */
  const startMainRecognition = async () => {
    if (listening) return;
    if (!isConnected) {
      setStatus("Not connected to server");
      return;
    }

    // Stop wake engine while actively recording
    safeStop(wakeRec.current);
    wakeRec.current = null;

    finalBuffer.current = "";
    setTranscript("");
    setStatus("Starting recording...");

    // Initialize microphone first
    const recordingStarted = await startAudioRecording();
    if (!recordingStarted) {
      setStatus("Failed to start recording");
      return;
    }

    setListening(true);

    // Start speech recognition if available
    if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
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
          setStatus("Microphone permission denied");
        }
        stopMainRecognition(false);
      };

      rec.onend = () => {
        stopMainRecognition(true);
      };

      try {
        rec.start();
        setStatus("Listening... Speak now");
      } catch (err) {
        console.error("Failed to start recognition:", err);
        setStatus("Speech recognition failed - audio only");
        // Continue with audio recording only
      }
    } else {
      setStatus("Recording... Speak now (no live transcript)");
    }
  };

  const stopMainRecognition = (sendData: boolean) => {
    safeStop(mainRec.current);
    mainRec.current = null;
    stopAudioRecording();

    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }

    const text = finalBuffer.current.trim();
    finalBuffer.current = "";
    setListening(false);

    if (!sendData || !text) {
      if (wakeActive) {
        setTimeout(() => startWakeEngine(), 300);
      } else {
        setStatus("Ready");
      }
    }
  };

  /* --------------------------
     Wake engine - GAME SPECIFIC - FIXED
     -------------------------- */
  const detectWakeIntent = (textRaw: string): boolean => {
    if (!textRaw) return false;
    const text = textRaw.toLowerCase().trim();

    const currentPhrases = getCurrentWakePhrases();
    
    for (const phrase of currentPhrases) {
      if (similarity(text, phrase) >= 0.65) return true;
    }
    
    if (game === "fifa" && (text.includes("fifa") || text.includes("ea") || text.includes("fc"))) {
      return true;
    }
    if (game === "lol" && (text.includes("lol") || text.includes("league") || text.includes("legends"))) {
      return true;
    }
    
    return false;
  };

  const startWakeEngine = () => {
    if (wakeRec.current || listening || !isConnected) return;
    if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
      setStatus("Wake not supported");
      return;
    }
    if (micPermission === "denied") {
      setStatus("Microphone permission denied - wake disabled");
      return;
    }

    try {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const rec = new SpeechRecognition();
      wakeRec.current = rec;

      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.maxAlternatives = 1;

      rec.onresult = (ev: any) => {
        if (processingWake.current || listening) return;
        const last = ev.results[ev.results.length - 1];
        const text = last && last[0] && last[0].transcript ? String(last[0].transcript).toLowerCase() : "";
        if (!text) return;
        
        const isWakeCommand = detectWakeIntent(text);
        if (!isWakeCommand) return;

        processingWake.current = true;
        safeStop(rec);
        wakeRec.current = null;

        setStatus("Wake detected - starting recording");

        setTimeout(() => {
          processingWake.current = false;
          startMainRecognition();
        }, 300);
      };

      rec.onerror = (ev: any) => {
        console.warn("Wake engine error:", ev?.error);
        safeStop(rec);
        wakeRec.current = null;

        if (ev?.error === "not-allowed") {
          setMicPermission("denied");
          setWakeActive(false);
          setStatus("Mic permission denied - wake disabled");
          return;
        }

        const backoff = Math.min(wakeBackoff.current, 5000);
        restartWakeTimer.current = setTimeout(() => {
          wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
          if (wakeActive && !listening) startWakeEngine();
        }, backoff);
      };

      rec.onend = () => {
        wakeRec.current = null;
        if (wakeActive && !listening) {
          const backoff = Math.min(wakeBackoff.current, 5000);
          restartWakeTimer.current = setTimeout(() => {
            if (wakeActive && !listening) startWakeEngine();
          }, backoff);
        }
      };

      rec.start();
      setStatus(getWakeStatusMessage());
      wakeBackoff.current = 500;
    } catch (err) {
      console.error("Failed to start wake engine:", err);
      setStatus("Wake failed");
      wakeRec.current = null;
      if (wakeActive && !listening) {
        restartWakeTimer.current = setTimeout(() => startWakeEngine(), 1200);
      }
    }
  };

  const stopWakeEngine = () => {
    safeStop(wakeRec.current);
    wakeRec.current = null;
    setStatus("Wake disabled");
  };

  const toggleWake = () => {
    if (wakeActive) {
      setWakeActive(false);
      stopWakeEngine();
      setStatus("Wake disabled");
    } else {
      setWakeActive(true);
      startWakeEngine();
      setStatus(getWakeStatusMessage());
    }
  };

  // Handle game switching - restart wake engine with new phrases
  const handleGameSwitch = (newGame: GameType) => {
    setGame(newGame);
    if (wakeActive && !listening) {
      safeStop(wakeRec.current);
      setTimeout(() => {
        setStatus(getWakeStatusMessage());
        startWakeEngine();
      }, 300);
    }
  };

  // Mic button handler (manual start/stop)
  const handleMicClick = () => {
    if (listening) {
      stopMainRecognition(true);
    } else {
      startMainRecognition();
    }
  };

  // Reset and reinitialize everything
  const handleResetMicrophone = async () => {
    setStatus("Resetting microphone...");
    
    // Stop everything
    safeStop(mainRec.current);
    safeStop(wakeRec.current);
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setListening(false);
    setTranscript("");
    finalBuffer.current = "";
    
    // Reinitialize
    await initializeMicrophone();
    
    if (wakeActive && !listening) {
      setTimeout(() => {
        setStatus(getWakeStatusMessage());
        startWakeEngine();
      }, 500);
    } else {
      setStatus("Ready - click mic to start");
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    finalBuffer.current = "";
  };

  // Initialize on mount - FIXED
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;
      setIsInitializing(true);

      setStatus("Initializing microphone...");
      
      // Pre-initialize microphone
      await initializeMicrophone();
      
      if (isConnected && wakeActive && micPermission === "granted") {
        setStatus("Starting wake engine...");
        setTimeout(() => {
          startWakeEngine();
        }, 400);
      } else if (micPermission === "denied") {
        setStatus("Microphone access required for voice commands");
        setWakeActive(false);
      }
      
      setIsInitializing(false);
    };

    if (isConnected) {
      initialize();
    }

    return () => {
      safeStop(mainRec.current);
      safeStop(wakeRec.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
    };
  }, [isConnected]);

  // Update wake status message when game changes
  useEffect(() => {
    if (wakeActive && !listening) {
      setStatus(getWakeStatusMessage());
    }
  }, [game]);

  return (
    <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
          <div className="text-xs text-gray-400 mt-1">
            {status} {isConnected ? "🟢" : "🔴"}
            {isInitializing && " (Initializing...)"}
          </div>
          {micPermission === "denied" && (
            <div className="text-xs text-red-400 mt-1">
              Microphone access denied. Please allow microphone permissions.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleResetMicrophone}
            disabled={isInitializing}
            className="flex items-center gap-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
            title="Reset microphone"
          >
            <RefreshCw size={14} />
            Reset Mic
          </button>

          <button
            onClick={toggleWake}
            disabled={micPermission === "denied" || !isConnected || isInitializing}
            className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
              wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            } ${(micPermission === "denied" || !isConnected || isInitializing) ? "opacity-50 cursor-not-allowed" : ""}`}
            title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
          >
            {wakeActive ? <Ear size={14} /> : <EarOff size={14} />}
            {wakeActive ? "Wake On" : "Wake Off"}
          </button>

          <button
            onClick={() => handleGameSwitch(game === "fifa" ? "lol" : "fifa")}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
            title="Switch game manually"
          >
            Switch Game
          </button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <button
          onClick={handleMicClick}
          disabled={micPermission === "denied" || !isConnected || isInitializing}
          className={`flex-shrink-0 p-4 rounded-full transition-all ${
            listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
          } ${(micPermission === "denied" || !isConnected || isInitializing) ? "opacity-50 cursor-not-allowed" : ""}`}
          title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : listening ? "Stop listening" : "Start listening"}
        >
          {listening ? <Square size={20} /> : <Mic size={20} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="p-3 bg-gray-800 rounded-lg min-h-[60px]">
            {transcript ? (
              <div className="break-words">
                <div className="text-sm text-gray-300 mb-1">You said:</div>
                <div className="text-white">{transcript}</div>
              </div>
            ) : (
              <div className="text-gray-400 text-sm h-[60px] flex items-center">
                {listening ? "🎤 Speak now..." : "Transcript will appear here"}
              </div>
            )}
          </div>

          {transcript && (
            <div className="flex gap-2 mt-2">
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

      <div className="mt-4 p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
        <div>Voice Commands for {game.toUpperCase()}:</div>
        <ul className="list-disc ml-4 mt-2">
          {game === "fifa" ? (
            <>
              <li><span className="font-mono">"Hey FIFA"</span> — start FIFA analysis</li>
              <li><span className="font-mono">"FIFA"</span> — start FIFA analysis</li>
              <li><span className="font-mono">"EA FC"</span> — start FIFA analysis</li>
            </>
          ) : (
            <>
              <li><span className="font-mono">"Hey LOL"</span> — start LoL analysis</li>
              <li><span className="font-mono">"LOL"</span> — start LoL analysis</li>
              <li><span className="font-mono">"League"</span> — start LoL analysis</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
};

export default VoiceInput;













// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import { Mic, Square, Ear, EarOff } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// // Game-specific wake phrases
// const FIFA_WAKE_PHRASES = [
//   "hey fifa",
//   "fifa",
//   "fee fa", 
//   "vyfa",
//   "vifa",
//   "ea fc",
//   "ea football",
//   "hey ea"
// ];

// const LOL_WAKE_PHRASES = [
//   "hey lol",
//   "lol",
//   "league",
//   "league of legends", 
//   "lowl",
//   "hey league",
//   "hey legends"
// ];

// /* --------------------------
//    Utility - Levenshtein-based similarity (0..1)
//    -------------------------- */
// function levenshteinDistance(a: string, b: string): number {
//   const alen = a.length;
//   const blen = b.length;
//   if (alen === 0) return blen;
//   if (blen === 0) return alen;

//   const v0 = new Array(blen + 1).fill(0);
//   const v1 = new Array(blen + 1).fill(0);

//   for (let j = 0; j <= blen; j++) v0[j] = j;
//   for (let i = 0; i < alen; i++) {
//     v1[0] = i + 1;
//     for (let j = 0; j < blen; j++) {
//       const cost = a[i] === b[j] ? 0 : 1;
//       v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
//     }
//     for (let j = 0; j <= blen; j++) v0[j] = v1[j];
//   }
//   return v1[blen];
// }

// function similarity(a: string, b: string): number {
//   if (!a || !b) return 0;
//   const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
//   const maxLen = Math.max(a.length, b.length);
//   if (maxLen === 0) return 1;
//   return 1 - dist / maxLen;
// }

// /* --------------------------
//    Component
//    -------------------------- */
// const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(true);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
//   const [isConnected, setIsConnected] = useState(false);

//   // refs
//   const mediaRecorder = useRef<MediaRecorder | null>(null);
//   const audioChunks = useRef<Blob[]>([]);
//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const processingWake = useRef(false);
//   const wakeBackoff = useRef<number>(500);
//   const isInitialized = useRef(false);
//   const ws = useRef<WebSocket | null>(null);
//   const audioContext = useRef<AudioContext | null>(null);

//   // Get current game's wake phrases
//   const getCurrentWakePhrases = (): string[] => {
//     return game === "fifa" ? FIFA_WAKE_PHRASES : LOL_WAKE_PHRASES;
//   };

//   // Get status message based on current game
//   const getWakeStatusMessage = (): string => {
//     const phrases = getCurrentWakePhrases();
//     const mainPhrase = phrases[0]; // "hey fifa" or "hey lol"
//     return `Wake listening - say '${mainPhrase}'`;
//   };

//   // WebSocket connection
//   useEffect(() => {
//     if (!userToken) return;

//     const wsUrl = API_BASE.replace('http', 'ws') + '/ws/voice-analysis/';
//     ws.current = new WebSocket(wsUrl);

//     ws.current.onopen = () => {
//       console.log('WebSocket connected');
//       setIsConnected(true);
//       // Authenticate
//       ws.current?.send(JSON.stringify({
//         type: 'auth',
//         token: userToken
//       }));
//       setStatus("Connected - Ready");
//     };

//     ws.current.onmessage = (event) => {
//       const data = JSON.parse(event.data);
//       console.log('WebSocket message:', data);

//       if (data.status === 'authenticated') {
//         setStatus("Authenticated - Ready");
//       }

//       if (data.transcript) {
//         setTranscript(data.transcript);
//         setStatus("Transcribed - Analyzing...");
//       }

//       if (data.analysis) {
//         console.log("Analysis received:", data.analysis);
//         onAnalysis?.(data.analysis);
//         setStatus("Analysis received");
//       }

//       if (data.tts_audio) {
//         setStatus("Playing response...");
//         playBase64Audio(data.tts_audio).then(() => {
//           setStatus("Response complete");
//           // Restart wake engine after playback
//           if (wakeActive && !listening) {
//             setTimeout(() => {
//               setStatus(getWakeStatusMessage());
//               startWakeEngine();
//             }, 500);
//           }
//         }).catch(err => {
//           console.warn("Audio playback failed:", err);
//           setStatus("Analysis complete (audio failed)");
//           if (wakeActive && !listening) {
//             setTimeout(() => {
//               setStatus(getWakeStatusMessage());
//               startWakeEngine();
//             }, 500);
//           }
//         });
//       }

//       if (data.error) {
//         console.error("WebSocket error:", data.error);
//         setStatus("Error: " + data.error);
//       }
//     };

//     ws.current.onclose = () => {
//       console.log('WebSocket disconnected');
//       setIsConnected(false);
//       setStatus("Disconnected");
//     };

//     ws.current.onerror = (error) => {
//       console.error('WebSocket error:', error);
//       setStatus("Connection error");
//     };

//     return () => {
//       ws.current?.close();
//     };
//   }, [userToken, onAnalysis]);

//   // Convert base64 to Audio and play
//   const playBase64Audio = (base64Data: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       try {
//         // Ensure it's a data URI
//         const dataUri = base64Data.startsWith('data:') ? base64Data : `data:audio/mpeg;base64,${base64Data}`;
//         const audio = new Audio(dataUri);
        
//         audio.onended = () => {
//           console.log("Audio playback finished");
//           resolve();
//         };
        
//         audio.onerror = (e) => {
//           console.error("Audio playback error:", e);
//           reject(new Error("Audio playback failed"));
//         };

//         const playPromise = audio.play();
//         if (playPromise) {
//           playPromise.catch(err => {
//             console.warn("Audio play blocked:", err);
//             // Still resolve to continue flow
//             resolve();
//           });
//         }
//       } catch (err) {
//         reject(err);
//       }
//     });
//   };

//   // Start recording audio for WebSocket
//   const startAudioRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ 
//         audio: {
//           sampleRate: 16000,
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true
//         } 
//       });
      
//       audioChunks.current = [];
      
//       // Create MediaRecorder with 16kHz sample rate
//       mediaRecorder.current = new MediaRecorder(stream, {
//         mimeType: 'audio/webm;codecs=opus'
//       });
      
//       mediaRecorder.current.ondataavailable = (event) => {
//         if (event.data.size > 0) {
//           audioChunks.current.push(event.data);
          
//           // Send chunk via WebSocket
//           const reader = new FileReader();
//           reader.onload = () => {
//             const base64 = (reader.result as string).split(',')[1];
//             if (ws.current?.readyState === WebSocket.OPEN) {
//               ws.current.send(JSON.stringify({
//                 type: 'audio_chunk',
//                 audio_base64: base64
//               }));
//             }
//           };
//           reader.readAsDataURL(event.data);
//         }
//       };
      
//       mediaRecorder.current.start(100); // Send chunks every 100ms
//       setStatus("Recording audio...");
      
//     } catch (err) {
//       console.error("Audio recording failed:", err);
//       setStatus("Microphone access denied");
//       setMicPermission("denied");
//     }
//   };

//   // Stop audio recording and send for analysis
//   const stopAudioRecording = () => {
//     if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//       mediaRecorder.current.stop();
//       mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      
//       // Send speech_end message
//       if (ws.current?.readyState === WebSocket.OPEN) {
//         ws.current.send(JSON.stringify({
//           type: 'speech_end',
//           game: game
//         }));
//       }
      
//       setStatus("Sending for analysis...");
//     }
//   };

//   // Helper: safe stop
//   const safeStop = (rec: any | null) => {
//     if (!rec) return;
//     try {
//       rec.onresult = null;
//       rec.onend = null;
//       rec.onerror = null;
//       rec.stop();
//     } catch {
//       // ignore
//     }
//   };

//   // Permission check
//   const checkMicrophonePermission = async (): Promise<boolean> => {
//     try {
//       if (navigator.permissions && (navigator as any).permissions.query) {
//         const p = await (navigator as any).permissions.query({ name: "microphone" });
//         const state = p.state as "granted" | "denied" | "prompt";
//         setMicPermission(state);
//         return state === "granted";
//       }
//       return true; // Assume granted if we can't check
//     } catch (err) {
//       console.warn("Permission check failed:", err);
//       return false;
//     }
//   };

//   /* --------------------------
//      Silence timer behavior
//      -------------------------- */
//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }
//     silenceTimer.current = setTimeout(() => {
//       const finalText = finalBuffer.current.trim();
//       stopMainRecognition(Boolean(finalText));
//     }, 4000);
//   };

//   /* --------------------------
//      Main recognition (active recording)
//      -------------------------- */
//   const startMainRecognition = async () => {
//     if (listening) return;
//     if (!isConnected) {
//       setStatus("Not connected to server");
//       return;
//     }
//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied. Please allow access.");
//       return;
//     }

//     // Stop wake engine while actively recording
//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Starting recording...");

//     // Start both speech recognition and audio recording
//     if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
//       const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       mainRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = true;
//       rec.lang = "en-US";

//       rec.onresult = (ev: any) => {
//         let interim = "";
//         for (let i = ev.resultIndex; i < ev.results.length; i++) {
//           const r = ev.results[i];
//           const t = r[0]?.transcript || "";
//           if (r.isFinal) {
//             finalBuffer.current += (finalBuffer.current ? " " : "") + t;
//           } else {
//             interim += t;
//           }
//         }
//         const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//         setTranscript(display);
//         resetSilenceTimer();
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Main rec error:", ev?.error);
//         if (ev?.error === "not-allowed") {
//           setMicPermission("denied");
//           setStatus("Microphone permission denied");
//           setListening(false);
//           safeStop(rec);
//           return;
//         }
//         stopMainRecognition(false);
//       };

//       rec.onend = () => {
//         stopMainRecognition(true);
//       };

//       try {
//         rec.start();
//         await startAudioRecording(); // Start WebSocket audio recording
//         setStatus("Listening... Speak now");
//       } catch (err) {
//         console.error("Failed to start recognition:", err);
//         setStatus("Failed to start microphone");
//         setListening(false);
//       }
//     } else {
//       // Fallback: only audio recording without speech recognition
//       await startAudioRecording();
//       setStatus("Recording... Speak now (no live transcript)");
//       setListening(true);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;
//     stopAudioRecording();

//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const text = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);

//     if (!sendData || !text) {
//       // Not sending -> restart wake engine immediately if enabled
//       if (wakeActive) {
//         setTimeout(() => startWakeEngine(), 300);
//       } else {
//         setStatus("Ready");
//       }
//     }
//     // If sending data, WebSocket will handle the response and restart wake engine
//   };

//   /* --------------------------
//      Wake engine - GAME SPECIFIC
//      -------------------------- */
//   const detectWakeIntent = (textRaw: string): boolean => {
//     if (!textRaw) return false;
//     const text = textRaw.toLowerCase().trim();

//     const currentPhrases = getCurrentWakePhrases();
    
//     for (const phrase of currentPhrases) {
//       if (similarity(text, phrase) >= 0.65) return true;
//     }
    
//     // Additional fuzzy matching for the current game
//     if (game === "fifa" && (text.includes("fifa") || text.includes("ea") || text.includes("fc"))) {
//       return true;
//     }
//     if (game === "lol" && (text.includes("lol") || text.includes("league") || text.includes("legends"))) {
//       return true;
//     }
    
//     return false;
//   };

//   const startWakeEngine = () => {
//     if (wakeRec.current || listening || !isConnected) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//       setStatus("Wake not supported");
//       return;
//     }
//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied - wake disabled");
//       return;
//     }

//     try {
//       const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       wakeRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = false;
//       rec.lang = "en-US";
//       rec.maxAlternatives = 1;

//       rec.onresult = (ev: any) => {
//         if (processingWake.current || listening) return;
//         const last = ev.results[ev.results.length - 1];
//         const text = last && last[0] && last[0].transcript ? String(last[0].transcript).toLowerCase() : "";
//         if (!text) return;
        
//         const isWakeCommand = detectWakeIntent(text);
//         if (!isWakeCommand) return;

//         processingWake.current = true;
//         safeStop(rec);
//         wakeRec.current = null;

//         setStatus("Wake detected - starting recording");

//         setTimeout(() => {
//           processingWake.current = false;
//           startMainRecognition();
//         }, 300);
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Wake engine error:", ev?.error);
//         safeStop(rec);
//         wakeRec.current = null;

//         if (ev?.error === "not-allowed") {
//           setMicPermission("denied");
//           setWakeActive(false);
//           setStatus("Mic permission denied - wake disabled");
//           return;
//         }

//         const backoff = Math.min(wakeBackoff.current, 5000);
//         restartWakeTimer.current = setTimeout(() => {
//           wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//           if (wakeActive && !listening) startWakeEngine();
//         }, backoff);
//         wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//       };

//       rec.onend = () => {
//         wakeRec.current = null;
//         if (wakeActive && !listening) {
//           const backoff = Math.min(wakeBackoff.current, 5000);
//           restartWakeTimer.current = setTimeout(() => {
//             if (wakeActive && !listening) startWakeEngine();
//           }, backoff);
//           wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.25);
//         }
//       };

//       rec.start();
//       setStatus(getWakeStatusMessage());
//       wakeBackoff.current = 500;
//     } catch (err) {
//       console.error("Failed to start wake engine:", err);
//       setStatus("Wake failed");
//       wakeRec.current = null;
//       if (wakeActive && !listening) {
//         restartWakeTimer.current = setTimeout(() => startWakeEngine(), 1200);
//       }
//     }
//   };

//   const stopWakeEngine = () => {
//     safeStop(wakeRec.current);
//     wakeRec.current = null;
//     setStatus("Wake disabled");
//   };

//   const toggleWake = () => {
//     if (wakeActive) {
//       setWakeActive(false);
//       stopWakeEngine();
//       setStatus("Wake disabled");
//     } else {
//       setWakeActive(true);
//       startWakeEngine();
//       setStatus(getWakeStatusMessage());
//     }
//   };

//   // Handle game switching - restart wake engine with new phrases
//   const handleGameSwitch = (newGame: GameType) => {
//     setGame(newGame);
//     if (wakeActive && !listening) {
//       // Restart wake engine with new game's wake phrases
//       safeStop(wakeRec.current);
//       setTimeout(() => {
//         setStatus(getWakeStatusMessage());
//         startWakeEngine();
//       }, 300);
//     }
//   };

//   // Mic button handler (manual start/stop)
//   const handleMicClick = () => {
//     if (listening) {
//       stopMainRecognition(true);
//     } else {
//       startMainRecognition();
//     }
//   };

//   const clearTranscript = () => {
//     setTranscript("");
//     finalBuffer.current = "";
//   };

//   // Initialize on mount
//   useEffect(() => {
//     const initialize = async () => {
//       if (isInitialized.current) return;
//       isInitialized.current = true;

//       setStatus("Checking microphone access...");
//       const hasPermission = await checkMicrophonePermission();
//       if (hasPermission && isConnected) {
//         setStatus("Starting wake engine...");
//         setTimeout(() => {
//           if (wakeActive) startWakeEngine();
//         }, 400);
//       } else if (!hasPermission) {
//         setStatus("Microphone access required for voice commands");
//         setWakeActive(false);
//       }
//     };

//     if (isConnected) {
//       initialize();
//     }

//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//         mediaRecorder.current.stop();
//       }
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//     };
//   }, [isConnected]);

//   // If wakeActive toggled or connection changes
//   useEffect(() => {
//     if (wakeActive && !listening && !wakeRec.current && micPermission !== "denied" && isConnected) {
//       startWakeEngine();
//     } else if (!wakeActive && wakeRec.current) {
//       stopWakeEngine();
//     }
//   }, [wakeActive, listening, micPermission, isConnected]);

//   // Update wake status message when game changes
//   useEffect(() => {
//     if (wakeActive && !listening) {
//       setStatus(getWakeStatusMessage());
//     }
//   }, [game]);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between mb-3">
//         <div>
//           <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
//           <div className="text-xs text-gray-400 mt-1">
//             {status} {isConnected ? "🟢" : "🔴"}
//           </div>
//           {micPermission === "denied" && (
//             <div className="text-xs text-red-400 mt-1">
//               Microphone access denied. Please allow microphone permissions.
//             </div>
//           )}
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             disabled={micPermission === "denied" || !isConnected}
//             className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
//             title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
//           >
//             {wakeActive ? <Ear size={14} /> : <EarOff size={14} />}
//             {wakeActive ? "Wake On" : "Wake Off"}
//           </button>

//           <button
//             onClick={() => handleGameSwitch(game === "fifa" ? "lol" : "fifa")}
//             className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
//             title="Switch game manually"
//           >
//             Switch Game
//           </button>
//         </div>
//       </div>

//       <div className="flex items-start gap-4">
//         <button
//           onClick={handleMicClick}
//           disabled={micPermission === "denied" || !isConnected}
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
//           } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
//           title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : listening ? "Stop listening" : "Start listening"}
//         >
//           {listening ? <Square size={20} /> : <Mic size={20} />}
//         </button>

//         <div className="flex-1 min-w-0">
//           <div className="p-3 bg-gray-800 rounded-lg min-h-[60px]">
//             {transcript ? (
//               <div className="break-words">
//                 <div className="text-sm text-gray-300 mb-1">You said:</div>
//                 <div className="text-white">{transcript}</div>
//               </div>
//             ) : (
//               <div className="text-gray-400 text-sm h-[60px] flex items-center">
//                 {listening ? "🎤 Speak now..." : "Transcript will appear here"}
//               </div>
//             )}
//           </div>

//           {transcript && (
//             <div className="flex gap-2 mt-2">
//               <button
//                 onClick={() => stopMainRecognition(true)}
//                 className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm"
//               >
//                 Send for Analysis
//               </button>
//               <button
//                 onClick={clearTranscript}
//                 className="px-3 bg-gray-600 hover:bg-gray-700 py-2 rounded text-sm"
//               >
//                 Clear
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="mt-4 p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
//         <div>Voice Commands for {game.toUpperCase()}:</div>
//         <ul className="list-disc ml-4 mt-2">
//           {game === "fifa" ? (
//             <>
//               <li><span className="font-mono">"Hey FIFA"</span> — start FIFA analysis</li>
//               <li><span className="font-mono">"FIFA"</span> — start FIFA analysis</li>
//               <li><span className="font-mono">"EA FC"</span> — start FIFA analysis</li>
//             </>
//           ) : (
//             <>
//               <li><span className="font-mono">"Hey LOL"</span> — start LoL analysis</li>
//               <li><span className="font-mono">"LOL"</span> — start LoL analysis</li>
//               <li><span className="font-mono">"League"</span> — start LoL analysis</li>
//             </>
//           )}
//         </ul>
//       </div>
//     </div>
//   );
// };

// export default VoiceInput;

















// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import { Mic, Square, Ear, EarOff } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// // tweakable similarity threshold (higher = stricter)
// const WAKE_SIMILARITY_THRESHOLD = 0.65;

// const WAKE_PHRASES = [
//   "hey neuraplay",
//   "hey neural play",
//   "neuraplay",
//   "neura play",
//   "hey neura play",
// ];

// const FIFA_PHRASES = ["hey fifa", "fifa", "fee fa", "vyfa", "vifa"];
// const LOL_PHRASES = ["hey lol", "lol", "league", "league of legends", "lowl"];

// /* --------------------------
//    Utility - Levenshtein-based similarity (0..1)
//    -------------------------- */
// function levenshteinDistance(a: string, b: string): number {
//   const alen = a.length;
//   const blen = b.length;
//   if (alen === 0) return blen;
//   if (blen === 0) return alen;

//   const v0 = new Array(blen + 1).fill(0);
//   const v1 = new Array(blen + 1).fill(0);

//   for (let j = 0; j <= blen; j++) v0[j] = j;
//   for (let i = 0; i < alen; i++) {
//     v1[0] = i + 1;
//     for (let j = 0; j < blen; j++) {
//       const cost = a[i] === b[j] ? 0 : 1;
//       v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
//     }
//     for (let j = 0; j <= blen; j++) v0[j] = v1[j];
//   }
//   return v1[blen];
// }

// function similarity(a: string, b: string): number {
//   if (!a || !b) return 0;
//   const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
//   const maxLen = Math.max(a.length, b.length);
//   if (maxLen === 0) return 1;
//   return 1 - dist / maxLen;
// }

// /* --------------------------
//    Component
//    -------------------------- */
// const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(true);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
//   const [isConnected, setIsConnected] = useState(false);

//   // refs
//   const mediaRecorder = useRef<MediaRecorder | null>(null);
//   const audioChunks = useRef<Blob[]>([]);
//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const processingWake = useRef(false);
//   const wakeBackoff = useRef<number>(500);
//   const isInitialized = useRef(false);
//   const ws = useRef<WebSocket | null>(null);
//   const audioContext = useRef<AudioContext | null>(null);

//   // WebSocket connection
//   useEffect(() => {
//     if (!userToken) return;

//     const wsUrl = API_BASE.replace('http', 'ws') + '/ws/voice-analysis/';
//     ws.current = new WebSocket(wsUrl);

//     ws.current.onopen = () => {
//       console.log('WebSocket connected');
//       setIsConnected(true);
//       // Authenticate
//       ws.current?.send(JSON.stringify({
//         type: 'auth',
//         token: userToken
//       }));
//       setStatus("Connected - Ready");
//     };

//     ws.current.onmessage = (event) => {
//       const data = JSON.parse(event.data);
//       console.log('WebSocket message:', data);

//       if (data.status === 'authenticated') {
//         setStatus("Authenticated - Ready");
//       }

//       if (data.transcript) {
//         setTranscript(data.transcript);
//         setStatus("Transcribed - Analyzing...");
//       }

//       if (data.analysis) {
//         console.log("Analysis received:", data.analysis);
//         onAnalysis?.(data.analysis);
//         setStatus("Analysis received");
//       }

//       if (data.tts_audio) {
//         setStatus("Playing response...");
//         playBase64Audio(data.tts_audio).then(() => {
//           setStatus("Response complete");
//           // Restart wake engine after playback
//           if (wakeActive && !listening) {
//             setTimeout(() => {
//               setStatus("Wake listening - say 'Hey NeuraPlay'");
//               startWakeEngine();
//             }, 500);
//           }
//         }).catch(err => {
//           console.warn("Audio playback failed:", err);
//           setStatus("Analysis complete (audio failed)");
//           if (wakeActive && !listening) {
//             setTimeout(() => {
//               setStatus("Wake listening - say 'Hey NeuraPlay'");
//               startWakeEngine();
//             }, 500);
//           }
//         });
//       }

//       if (data.error) {
//         console.error("WebSocket error:", data.error);
//         setStatus("Error: " + data.error);
//       }
//     };

//     ws.current.onclose = () => {
//       console.log('WebSocket disconnected');
//       setIsConnected(false);
//       setStatus("Disconnected");
//     };

//     ws.current.onerror = (error) => {
//       console.error('WebSocket error:', error);
//       setStatus("Connection error");
//     };

//     return () => {
//       ws.current?.close();
//     };
//   }, [userToken, onAnalysis]);

//   // Convert base64 to Audio and play
//   const playBase64Audio = (base64Data: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       try {
//         // Ensure it's a data URI
//         const dataUri = base64Data.startsWith('data:') ? base64Data : `data:audio/mpeg;base64,${base64Data}`;
//         const audio = new Audio(dataUri);
        
//         audio.onended = () => {
//           console.log("Audio playback finished");
//           resolve();
//         };
        
//         audio.onerror = (e) => {
//           console.error("Audio playback error:", e);
//           reject(new Error("Audio playback failed"));
//         };

//         const playPromise = audio.play();
//         if (playPromise) {
//           playPromise.catch(err => {
//             console.warn("Audio play blocked:", err);
//             // Still resolve to continue flow
//             resolve();
//           });
//         }
//       } catch (err) {
//         reject(err);
//       }
//     });
//   };

//   // Start recording audio for WebSocket
//   const startAudioRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ 
//         audio: {
//           sampleRate: 16000,
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true
//         } 
//       });
      
//       audioChunks.current = [];
      
//       // Create MediaRecorder with 16kHz sample rate
//       mediaRecorder.current = new MediaRecorder(stream, {
//         mimeType: 'audio/webm;codecs=opus'
//       });
      
//       mediaRecorder.current.ondataavailable = (event) => {
//         if (event.data.size > 0) {
//           audioChunks.current.push(event.data);
          
//           // Send chunk via WebSocket
//           const reader = new FileReader();
//           reader.onload = () => {
//             const base64 = (reader.result as string).split(',')[1];
//             if (ws.current?.readyState === WebSocket.OPEN) {
//               ws.current.send(JSON.stringify({
//                 type: 'audio_chunk',
//                 audio_base64: base64
//               }));
//             }
//           };
//           reader.readAsDataURL(event.data);
//         }
//       };
      
//       mediaRecorder.current.start(100); // Send chunks every 100ms
//       setStatus("Recording audio...");
      
//     } catch (err) {
//       console.error("Audio recording failed:", err);
//       setStatus("Microphone access denied");
//       setMicPermission("denied");
//     }
//   };

//   // Stop audio recording and send for analysis
//   const stopAudioRecording = () => {
//     if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//       mediaRecorder.current.stop();
//       mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      
//       // Send speech_end message
//       if (ws.current?.readyState === WebSocket.OPEN) {
//         ws.current.send(JSON.stringify({
//           type: 'speech_end',
//           game: game
//         }));
//       }
      
//       setStatus("Sending for analysis...");
//     }
//   };

//   // Helper: safe stop
//   const safeStop = (rec: any | null) => {
//     if (!rec) return;
//     try {
//       rec.onresult = null;
//       rec.onend = null;
//       rec.onerror = null;
//       rec.stop();
//     } catch {
//       // ignore
//     }
//   };

//   // Permission check
//   const checkMicrophonePermission = async (): Promise<boolean> => {
//     try {
//       if (navigator.permissions && (navigator as any).permissions.query) {
//         const p = await (navigator as any).permissions.query({ name: "microphone" });
//         const state = p.state as "granted" | "denied" | "prompt";
//         setMicPermission(state);
//         return state === "granted";
//       }
//       return true; // Assume granted if we can't check
//     } catch (err) {
//       console.warn("Permission check failed:", err);
//       return false;
//     }
//   };

//   /* --------------------------
//      Silence timer behavior
//      -------------------------- */
//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }
//     silenceTimer.current = setTimeout(() => {
//       const finalText = finalBuffer.current.trim();
//       stopMainRecognition(Boolean(finalText));
//     }, 4000);
//   };

//   /* --------------------------
//      Main recognition (active recording)
//      -------------------------- */
//   const startMainRecognition = async () => {
//     if (listening) return;
//     if (!isConnected) {
//       setStatus("Not connected to server");
//       return;
//     }
//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied. Please allow access.");
//       return;
//     }

//     // Stop wake engine while actively recording
//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Starting recording...");

//     // Start both speech recognition and audio recording
//     if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
//       const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       mainRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = true;
//       rec.lang = "en-US";

//       rec.onresult = (ev: any) => {
//         let interim = "";
//         for (let i = ev.resultIndex; i < ev.results.length; i++) {
//           const r = ev.results[i];
//           const t = r[0]?.transcript || "";
//           if (r.isFinal) {
//             finalBuffer.current += (finalBuffer.current ? " " : "") + t;
//           } else {
//             interim += t;
//           }
//         }
//         const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//         setTranscript(display);
//         resetSilenceTimer();
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Main rec error:", ev?.error);
//         if (ev?.error === "not-allowed") {
//           setMicPermission("denied");
//           setStatus("Microphone permission denied");
//           setListening(false);
//           safeStop(rec);
//           return;
//         }
//         stopMainRecognition(false);
//       };

//       rec.onend = () => {
//         stopMainRecognition(true);
//       };

//       try {
//         rec.start();
//         await startAudioRecording(); // Start WebSocket audio recording
//         setStatus("Listening... Speak now");
//       } catch (err) {
//         console.error("Failed to start recognition:", err);
//         setStatus("Failed to start microphone");
//         setListening(false);
//       }
//     } else {
//       // Fallback: only audio recording without speech recognition
//       await startAudioRecording();
//       setStatus("Recording... Speak now (no live transcript)");
//       setListening(true);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;
//     stopAudioRecording();

//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const text = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);

//     if (!sendData || !text) {
//       // Not sending -> restart wake engine immediately if enabled
//       if (wakeActive) {
//         setTimeout(() => startWakeEngine(), 300);
//       } else {
//         setStatus("Ready");
//       }
//     }
//     // If sending data, WebSocket will handle the response and restart wake engine
//   };

//   /* --------------------------
//      Wake engine
//      -------------------------- */
//   const detectWakeIntent = (textRaw: string): "wake" | GameType | null => {
//     if (!textRaw) return null;
//     const text = textRaw.toLowerCase().trim();

//     for (const w of WAKE_PHRASES) {
//       if (similarity(text, w) >= WAKE_SIMILARITY_THRESHOLD) return "wake";
//     }
//     for (const f of FIFA_PHRASES) {
//       if (similarity(text, f) >= WAKE_SIMILARITY_THRESHOLD) return "fifa";
//     }
//     for (const l of LOL_PHRASES) {
//       if (similarity(text, l) >= WAKE_SIMILARITY_THRESHOLD) return "lol";
//     }
//     if (text.includes("neuraplay") || text.includes("neura") || text.includes("neural")) return "wake";
//     if (text.includes("fifa")) return "fifa";
//     if (text.includes("lol") || text.includes("league")) return "lol";
//     return null;
//   };

//   const startWakeEngine = () => {
//     if (wakeRec.current || listening || !isConnected) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//       setStatus("Wake not supported");
//       return;
//     }
//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied - wake disabled");
//       return;
//     }

//     try {
//       const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       wakeRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = false;
//       rec.lang = "en-US";
//       rec.maxAlternatives = 1;

//       rec.onresult = (ev: any) => {
//         if (processingWake.current || listening) return;
//         const last = ev.results[ev.results.length - 1];
//         const text = last && last[0] && last[0].transcript ? String(last[0].transcript).toLowerCase() : "";
//         if (!text) return;
//         const intent = detectWakeIntent(text);
//         if (!intent) return;

//         processingWake.current = true;
//         safeStop(rec);
//         wakeRec.current = null;

//         if (intent === "fifa" || intent === "lol") {
//           setGame(intent);
//           setStatus(`Switched to ${intent.toUpperCase()} (voice)`);
//         } else {
//           setStatus("Wake detected");
//         }

//         setTimeout(() => {
//           processingWake.current = false;
//           startMainRecognition();
//         }, 300);
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Wake engine error:", ev?.error);
//         safeStop(rec);
//         wakeRec.current = null;

//         if (ev?.error === "not-allowed") {
//           setMicPermission("denied");
//           setWakeActive(false);
//           setStatus("Mic permission denied - wake disabled");
//           return;
//         }

//         const backoff = Math.min(wakeBackoff.current, 5000);
//         restartWakeTimer.current = setTimeout(() => {
//           wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//           if (wakeActive && !listening) startWakeEngine();
//         }, backoff);
//         wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//       };

//       rec.onend = () => {
//         wakeRec.current = null;
//         if (wakeActive && !listening) {
//           const backoff = Math.min(wakeBackoff.current, 5000);
//           restartWakeTimer.current = setTimeout(() => {
//             if (wakeActive && !listening) startWakeEngine();
//           }, backoff);
//           wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.25);
//         }
//       };

//       rec.start();
//       setStatus("Wake listening - say 'Hey NeuraPlay'");
//       wakeBackoff.current = 500;
//     } catch (err) {
//       console.error("Failed to start wake engine:", err);
//       setStatus("Wake failed");
//       wakeRec.current = null;
//       if (wakeActive && !listening) {
//         restartWakeTimer.current = setTimeout(() => startWakeEngine(), 1200);
//       }
//     }
//   };

//   const stopWakeEngine = () => {
//     safeStop(wakeRec.current);
//     wakeRec.current = null;
//     setStatus("Wake disabled");
//   };

//   const toggleWake = () => {
//     if (wakeActive) {
//       setWakeActive(false);
//       stopWakeEngine();
//       setStatus("Wake disabled");
//     } else {
//       setWakeActive(true);
//       startWakeEngine();
//       setStatus("Wake enabled - listening for commands");
//     }
//   };

//   // Mic button handler (manual start/stop)
//   const handleMicClick = () => {
//     if (listening) {
//       stopMainRecognition(true);
//     } else {
//       startMainRecognition();
//     }
//   };

//   const clearTranscript = () => {
//     setTranscript("");
//     finalBuffer.current = "";
//   };

//   // Initialize on mount
//   useEffect(() => {
//     const initialize = async () => {
//       if (isInitialized.current) return;
//       isInitialized.current = true;

//       setStatus("Checking microphone access...");
//       const hasPermission = await checkMicrophonePermission();
//       if (hasPermission && isConnected) {
//         setStatus("Starting wake engine...");
//         setTimeout(() => {
//           if (wakeActive) startWakeEngine();
//         }, 400);
//       } else if (!hasPermission) {
//         setStatus("Microphone access required for voice commands");
//         setWakeActive(false);
//       }
//     };

//     if (isConnected) {
//       initialize();
//     }

//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//         mediaRecorder.current.stop();
//       }
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//     };
//   }, [isConnected]);

//   // If wakeActive toggled or connection changes
//   useEffect(() => {
//     if (wakeActive && !listening && !wakeRec.current && micPermission !== "denied" && isConnected) {
//       startWakeEngine();
//     } else if (!wakeActive && wakeRec.current) {
//       stopWakeEngine();
//     }
//   }, [wakeActive, listening, micPermission, isConnected]);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between mb-3">
//         <div>
//           <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
//           <div className="text-xs text-gray-400 mt-1">
//             {status} {isConnected ? "🟢" : "🔴"}
//           </div>
//           {micPermission === "denied" && (
//             <div className="text-xs text-red-400 mt-1">
//               Microphone access denied. Please allow microphone permissions.
//             </div>
//           )}
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             disabled={micPermission === "denied" || !isConnected}
//             className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
//             title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
//           >
//             {wakeActive ? <Ear size={14} /> : <EarOff size={14} />}
//             {wakeActive ? "Wake On" : "Wake Off"}
//           </button>

//           <button
//             onClick={() => setGame((g) => (g === "fifa" ? "lol" : "fifa"))}
//             className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
//             title="Switch game manually"
//           >
//             Switch Game
//           </button>
//         </div>
//       </div>

//       <div className="flex items-start gap-4">
//         <button
//           onClick={handleMicClick}
//           disabled={micPermission === "denied" || !isConnected}
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
//           } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
//           title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : listening ? "Stop listening" : "Start listening"}
//         >
//           {listening ? <Square size={20} /> : <Mic size={20} />}
//         </button>

//         <div className="flex-1 min-w-0">
//           <div className="p-3 bg-gray-800 rounded-lg min-h-[60px]">
//             {transcript ? (
//               <div className="break-words">
//                 <div className="text-sm text-gray-300 mb-1">You said:</div>
//                 <div className="text-white">{transcript}</div>
//               </div>
//             ) : (
//               <div className="text-gray-400 text-sm h-[60px] flex items-center">
//                 {listening ? "🎤 Speak now..." : "Transcript will appear here"}
//               </div>
//             )}
//           </div>

//           {transcript && (
//             <div className="flex gap-2 mt-2">
//               <button
//                 onClick={() => stopMainRecognition(true)}
//                 className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm"
//               >
//                 Send for Analysis
//               </button>
//               <button
//                 onClick={clearTranscript}
//                 className="px-3 bg-gray-600 hover:bg-gray-700 py-2 rounded text-sm"
//               >
//                 Clear
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="mt-4 p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
//         <div>Voice Commands:</div>
//         <ul className="list-disc ml-4 mt-2">
//           <li><span className="font-mono">"Hey NeuraPlay"</span> — start recording</li>
//           <li><span className="font-mono">"Hey FIFA"</span> — switch to FIFA & start recording</li>
//           <li><span className="font-mono">"Hey LOL"</span> — switch to LoL & start recording</li>
//         </ul>
//       </div>
//     </div>
//   );
// };

// export default VoiceInput;
