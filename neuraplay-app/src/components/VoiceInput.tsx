// VoiceInput.tsx
import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Ear, EarOff } from "lucide-react";

type GameType = "fifa" | "lol";

interface Props {
  userToken: string;
  initialGame?: GameType;
  onAnalysis?: (data: any) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// tweakable similarity threshold (higher = stricter)
const WAKE_SIMILARITY_THRESHOLD = 0.65;

const WAKE_PHRASES = [
  "hey neuraplay",
  "hey neural play",
  "neuraplay",
  "neura play",
  "hey neura play",
];

const FIFA_PHRASES = ["hey fifa", "fifa", "fee fa", "vyfa", "vifa"];
const LOL_PHRASES = ["hey lol", "lol", "league", "league of legends", "lowl"];

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
  const audioContext = useRef<AudioContext | null>(null);

  // WebSocket connection
  useEffect(() => {
    if (!userToken) return;

    const wsUrl = API_BASE.replace('http', 'ws') + '/ws/voice-analysis/';
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      // Authenticate
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
          // Restart wake engine after playback
          if (wakeActive && !listening) {
            setTimeout(() => {
              setStatus("Wake listening - say 'Hey NeuraPlay'");
              startWakeEngine();
            }, 500);
          }
        }).catch(err => {
          console.warn("Audio playback failed:", err);
          setStatus("Analysis complete (audio failed)");
          if (wakeActive && !listening) {
            setTimeout(() => {
              setStatus("Wake listening - say 'Hey NeuraPlay'");
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
        // Ensure it's a data URI
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
            // Still resolve to continue flow
            resolve();
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  // Start recording audio for WebSocket
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      audioChunks.current = [];
      
      // Create MediaRecorder with 16kHz sample rate
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          
          // Send chunk via WebSocket
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
      
      mediaRecorder.current.start(100); // Send chunks every 100ms
      setStatus("Recording audio...");
      
    } catch (err) {
      console.error("Audio recording failed:", err);
      setStatus("Microphone access denied");
      setMicPermission("denied");
    }
  };

  // Stop audio recording and send for analysis
  const stopAudioRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      
      // Send speech_end message
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'speech_end',
          game: game
        }));
      }
      
      setStatus("Sending for analysis...");
    }
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
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      if (navigator.permissions && (navigator as any).permissions.query) {
        const p = await (navigator as any).permissions.query({ name: "microphone" });
        const state = p.state as "granted" | "denied" | "prompt";
        setMicPermission(state);
        return state === "granted";
      }
      return true; // Assume granted if we can't check
    } catch (err) {
      console.warn("Permission check failed:", err);
      return false;
    }
  };

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
     Main recognition (active recording)
     -------------------------- */
  const startMainRecognition = async () => {
    if (listening) return;
    if (!isConnected) {
      setStatus("Not connected to server");
      return;
    }
    if (micPermission === "denied") {
      setStatus("Microphone permission denied. Please allow access.");
      return;
    }

    // Stop wake engine while actively recording
    safeStop(wakeRec.current);
    wakeRec.current = null;

    finalBuffer.current = "";
    setTranscript("");
    setListening(true);
    setStatus("Starting recording...");

    // Start both speech recognition and audio recording
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
          setListening(false);
          safeStop(rec);
          return;
        }
        stopMainRecognition(false);
      };

      rec.onend = () => {
        stopMainRecognition(true);
      };

      try {
        rec.start();
        await startAudioRecording(); // Start WebSocket audio recording
        setStatus("Listening... Speak now");
      } catch (err) {
        console.error("Failed to start recognition:", err);
        setStatus("Failed to start microphone");
        setListening(false);
      }
    } else {
      // Fallback: only audio recording without speech recognition
      await startAudioRecording();
      setStatus("Recording... Speak now (no live transcript)");
      setListening(true);
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
      // Not sending -> restart wake engine immediately if enabled
      if (wakeActive) {
        setTimeout(() => startWakeEngine(), 300);
      } else {
        setStatus("Ready");
      }
    }
    // If sending data, WebSocket will handle the response and restart wake engine
  };

  /* --------------------------
     Wake engine
     -------------------------- */
  const detectWakeIntent = (textRaw: string): "wake" | GameType | null => {
    if (!textRaw) return null;
    const text = textRaw.toLowerCase().trim();

    for (const w of WAKE_PHRASES) {
      if (similarity(text, w) >= WAKE_SIMILARITY_THRESHOLD) return "wake";
    }
    for (const f of FIFA_PHRASES) {
      if (similarity(text, f) >= WAKE_SIMILARITY_THRESHOLD) return "fifa";
    }
    for (const l of LOL_PHRASES) {
      if (similarity(text, l) >= WAKE_SIMILARITY_THRESHOLD) return "lol";
    }
    if (text.includes("neuraplay") || text.includes("neura") || text.includes("neural")) return "wake";
    if (text.includes("fifa")) return "fifa";
    if (text.includes("lol") || text.includes("league")) return "lol";
    return null;
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
        const intent = detectWakeIntent(text);
        if (!intent) return;

        processingWake.current = true;
        safeStop(rec);
        wakeRec.current = null;

        if (intent === "fifa" || intent === "lol") {
          setGame(intent);
          setStatus(`Switched to ${intent.toUpperCase()} (voice)`);
        } else {
          setStatus("Wake detected");
        }

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
        wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
      };

      rec.onend = () => {
        wakeRec.current = null;
        if (wakeActive && !listening) {
          const backoff = Math.min(wakeBackoff.current, 5000);
          restartWakeTimer.current = setTimeout(() => {
            if (wakeActive && !listening) startWakeEngine();
          }, backoff);
          wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.25);
        }
      };

      rec.start();
      setStatus("Wake listening - say 'Hey NeuraPlay'");
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
      setStatus("Wake enabled - listening for commands");
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

  const clearTranscript = () => {
    setTranscript("");
    finalBuffer.current = "";
  };

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      setStatus("Checking microphone access...");
      const hasPermission = await checkMicrophonePermission();
      if (hasPermission && isConnected) {
        setStatus("Starting wake engine...");
        setTimeout(() => {
          if (wakeActive) startWakeEngine();
        }, 400);
      } else if (!hasPermission) {
        setStatus("Microphone access required for voice commands");
        setWakeActive(false);
      }
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
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
    };
  }, [isConnected]);

  // If wakeActive toggled or connection changes
  useEffect(() => {
    if (wakeActive && !listening && !wakeRec.current && micPermission !== "denied" && isConnected) {
      startWakeEngine();
    } else if (!wakeActive && wakeRec.current) {
      stopWakeEngine();
    }
  }, [wakeActive, listening, micPermission, isConnected]);

  return (
    <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
          <div className="text-xs text-gray-400 mt-1">
            {status} {isConnected ? "🟢" : "🔴"}
          </div>
          {micPermission === "denied" && (
            <div className="text-xs text-red-400 mt-1">
              Microphone access denied. Please allow microphone permissions.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleWake}
            disabled={micPermission === "denied" || !isConnected}
            className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
              wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
            title={!isConnected ? "Not connected to server" : micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
          >
            {wakeActive ? <Ear size={14} /> : <EarOff size={14} />}
            {wakeActive ? "Wake On" : "Wake Off"}
          </button>

          <button
            onClick={() => setGame((g) => (g === "fifa" ? "lol" : "fifa"))}
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
          disabled={micPermission === "denied" || !isConnected}
          className={`flex-shrink-0 p-4 rounded-full transition-all ${
            listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
          } ${(micPermission === "denied" || !isConnected) ? "opacity-50 cursor-not-allowed" : ""}`}
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
        <div>Voice Commands:</div>
        <ul className="list-disc ml-4 mt-2">
          <li><span className="font-mono">"Hey NeuraPlay"</span> — start recording</li>
          <li><span className="font-mono">"Hey FIFA"</span> — switch to FIFA & start recording</li>
          <li><span className="font-mono">"Hey LOL"</span> — switch to LoL & start recording</li>
        </ul>
      </div>
    </div>
  );
};

export default VoiceInput;













// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import axios from "axios";
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
//   const [wakeActive, setWakeActive] = useState(true); // auto-start wake engine on load
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");

//   // refs
//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const processingWake = useRef(false);
//   const wakeBackoff = useRef<number>(500);
//   const isInitialized = useRef(false);

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

//   // Permission probe using navigator.permissions if available
//   const checkMicrophonePermission = async (): Promise<boolean> => {
//     try {
//       if (navigator.permissions && (navigator as any).permissions.query) {
//         const p = await (navigator as any).permissions.query({ name: "microphone" });
//         const state = p.state as "granted" | "denied" | "prompt";
//         setMicPermission(state);
//         return state === "granted";
//       }
//       // Fallback: attempt a short recognition start to infer permission
//       if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
//         const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//         return await new Promise<boolean>((resolve) => {
//           try {
//             const tester = new SpeechRecognition();
//             tester.continuous = false;
//             tester.interimResults = false;
//             tester.onstart = () => {
//               try { tester.stop(); } catch {}
//               setMicPermission("granted");
//               resolve(true);
//             };
//             tester.onerror = (ev: any) => {
//               if (ev?.error === "not-allowed") {
//                 setMicPermission("denied");
//                 resolve(false);
//               } else {
//                 setMicPermission("granted");
//                 resolve(true);
//               }
//             };
//             // start and give a short timeout
//             tester.start();
//             setTimeout(() => {
//               try { tester.stop(); } catch {}
//               // if no error observed, assume prompt/granted
//               if (micPermission !== "denied") {
//                 setMicPermission("prompt");
//               }
//               resolve(true);
//             }, 700);
//           } catch {
//             resolve(false);
//           }
//         });
//       }
//       return false;
//     } catch (err) {
//       console.warn("Permission check failed:", err);
//       return false;
//     }
//   };

//   /* --------------------------
//      Backend: send transcript, handle base64 audio playback
//      Expect backend response JSON to include:
//        - analysis fields (passed to onAnalysis)
//        - audio: base64 string (either a data:... prefix or raw base64)
//      After audio finishes playing -> restart wake engine (if enabled)
//      -------------------------- */
//   const sendToBackend = async (text: string) => {
//     if (!text || !text.trim()) return;
//     setStatus("Analyzing...");
//     try {
//       const resp = await axios.post(
//         `${API_BASE}/api/analyze/${game}/`,
//         { stats: text },
//         {
//           headers: {
//             Authorization: userToken ? `Bearer ${userToken}` : "",
//             "Content-Type": "application/json",
//           },
//           // You might want to set a longer timeout for slow TTS/generation
//           timeout: 60000,
//         }
//       );

//       // call optional callback with full JSON
//       onAnalysis?.(resp.data);

//       // If backend returns base64 audio in resp.data.audio, play it
//       if (resp.data?.audio) {
//         try {
//           setStatus("Playing response...");
//           await playBase64Audio(resp.data.audio);
//           setStatus("Playback finished");
//         } catch (err) {
//           console.warn("Audio playback failed:", err);
//           setStatus("Analysis complete (no audio)");
//         }
//       } else {
//         setStatus("Analysis complete");
//       }

//       // small delay then restart wake engine if enabled
//       setTimeout(() => {
//         if (wakeActive && !listening) {
//           setStatus("Wake listening - say 'Hey NeuraPlay'");
//           startWakeEngine();
//         } else {
//           setStatus("Ready");
//         }
//       }, 250);
//     } catch (err) {
//       console.error("Analysis request failed:", err);
//       setStatus("Analysis failed");
//       // restart wake engine even on failure (best-effort)
//       setTimeout(() => {
//         if (wakeActive && !listening) {
//           setStatus("Wake listening - say 'Hey NeuraPlay'");
//           startWakeEngine();
//         } else {
//           setStatus("Ready");
//         }
//       }, 300);
//     }
//   };

//   // Convert base64 (or data URI) to Audio and play; resolves when playback ends
//   const playBase64Audio = (base64OrDataUri: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       try {
//         let dataUri = base64OrDataUri;
//         // If raw base64 (no data: prefix), assume MP3
//         if (!dataUri.startsWith("data:")) {
//           dataUri = "data:audio/mpeg;base64," + dataUri;
//         }
//         const audio = new Audio(dataUri);
//         audio.onended = () => {
//           resolve();
//         };
//         audio.onerror = (e) => {
//           reject(new Error("Audio playback error"));
//         };
//         // Try play (some browsers require user interaction; but we normally invoked via user speech)
//         const playPromise = audio.play();
//         if (playPromise && typeof playPromise.then === "function") {
//           playPromise.catch((err) => {
//             // autoplay might be blocked — still resolve so app flow continues
//             console.warn("Audio play blocked or failed:", err);
//             resolve();
//           });
//         }
//       } catch (err) {
//         reject(err);
//       }
//     });
//   };

//   /* --------------------------
//      Silence timer behavior (B1)
//      - resetSilenceTimer called whenever interim or final results arrive
//      - if 4s silence -> stopMainRecognition(send=true) and send
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
//   const startMainRecognition = () => {
//     if (listening) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//       setStatus("SpeechRecognition not supported");
//       return;
//     }
//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied. Please allow access.");
//       return;
//     }

//     // stop wake engine while actively recording
//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Listening...");

//     const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//     const rec = new SpeechRecognition();
//     mainRec.current = rec;

//     rec.continuous = true;
//     rec.interimResults = true;
//     rec.lang = "en-US";

//     rec.onresult = (ev: any) => {
//       let interim = "";
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const r = ev.results[i];
//         const t = r[0]?.transcript || "";
//         if (r.isFinal) {
//           finalBuffer.current += (finalBuffer.current ? " " : "") + t;
//         } else {
//           interim += t;
//         }
//       }
//       const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//       setTranscript(display);
//       resetSilenceTimer();
//     };

//     rec.onerror = (ev: any) => {
//       console.warn("Main rec error:", ev?.error);
//       if (ev?.error === "not-allowed") {
//         setMicPermission("denied");
//         setStatus("Microphone permission denied");
//         setListening(false);
//         safeStop(rec);
//         return;
//       }
//       // stop without sending if generic error
//       stopMainRecognition(false);
//     };

//     rec.onend = () => {
//       // ended - attempt to send if we had speech
//       stopMainRecognition(true);
//     };

//     try {
//       rec.start();
//       setStatus("Listening...");
//     } catch (err) {
//       console.error("Failed to start main recognition:", err);
//       setStatus("Failed to start microphone");
//       setListening(false);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;

//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const text = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);
//     setTranscript("");

//     if (sendData && text) {
//       // send and wait for audio; wake engine restarted after playback in sendToBackend
//       sendToBackend(text);
//     } else {
//       // not sending -> restart wake engine immediately if enabled
//       if (wakeActive) {
//         setTimeout(() => startWakeEngine(), 300);
//       } else {
//         setStatus("Ready");
//       }
//     }
//   };

//   /* --------------------------
//      Wake engine: listens continuously for short phrases (final results)
//      - uses similarity threshold to tolerate accent/variation
//      - if detected: switch game (if phrase indicates) and startMainRecognition()
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
//     // fallback contains check
//     if (text.includes("neuraplay") || text.includes("neura") || text.includes("neural")) return "wake";
//     if (text.includes("fifa")) return "fifa";
//     if (text.includes("lol") || text.includes("league")) return "lol";
//     return null;
//   };

//   const startWakeEngine = () => {
//     if (wakeRec.current || listening) return;
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
//       rec.interimResults = false; // prefer final results for wake detection
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
//         // stop wake engine and act
//         safeStop(rec);
//         wakeRec.current = null;

//         if (intent === "fifa" || intent === "lol") {
//           setGame(intent);
//           setStatus(`Switched to ${intent.toUpperCase()} (voice)`);
//         } else {
//           setStatus("Wake detected");
//         }

//         // small delay to settle, then start active recording
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

//         // backoff restart
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

//   // Initialize on mount: check permission and start wake engine automatically
//   useEffect(() => {
//     const initialize = async () => {
//       if (isInitialized.current) return;
//       isInitialized.current = true;

//       if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//         setStatus("Speech recognition not supported in this browser");
//         setWakeActive(false);
//         return;
//       }

//       setStatus("Checking microphone access...");
//       const hasPermission = await checkMicrophonePermission();
//       if (hasPermission) {
//         setStatus("Starting wake engine...");
//         // start wake engine quickly
//         setTimeout(() => {
//           if (wakeActive) startWakeEngine();
//         }, 400);
//       } else {
//         setStatus("Microphone access required for voice commands");
//         setWakeActive(false);
//       }
//     };

//     initialize();

//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // If wakeActive toggled externally, manage engine
//   useEffect(() => {
//     if (wakeActive && !listening && !wakeRec.current && micPermission !== "denied") {
//       startWakeEngine();
//     } else if (!wakeActive && wakeRec.current) {
//       stopWakeEngine();
//     }
//   }, [wakeActive, listening, micPermission]);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between mb-3">
//         <div>
//           <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
//           <div className="text-xs text-gray-400 mt-1">{status}</div>
//           {micPermission === "denied" && (
//             <div className="text-xs text-red-400 mt-1">
//               Microphone access denied. Please allow microphone permissions in your browser.
//             </div>
//           )}
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             disabled={micPermission === "denied"}
//             className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             } ${micPermission === "denied" ? "opacity-50 cursor-not-allowed" : ""}`}
//             title={micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
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
//           disabled={micPermission === "denied"}
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
//           } ${micPermission === "denied" ? "opacity-50 cursor-not-allowed" : ""}`}
//           title={micPermission === "denied" ? "Microphone access denied" : listening ? "Stop listening" : "Start listening"}
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














// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import axios from "axios";
// import { Mic, Square, Ear, EarOff } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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
//   const dist = levenshteinDistance(a, b);
//   const maxLen = Math.max(a.length, b.length);
//   if (maxLen === 0) return 1;
//   return 1 - dist / maxLen;
// }

// const VoiceInput: React.FC<Props> = ({
//   userToken,
//   initialGame = "fifa",
//   onAnalysis,
// }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(true);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Requesting microphone access...");
//   const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");

//   // refs
//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const processingWake = useRef(false);
//   const wakeBackoff = useRef<number>(500);
//   const isInitialized = useRef(false);

//   // Check microphone permission
//   const checkMicrophonePermission = async (): Promise<boolean> => {
//     try {
//       // Modern permission API
//       if (navigator.permissions && navigator.permissions.query) {
//         const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
//         setMicPermission(permission.state as "granted" | "denied" | "prompt");
//         return permission.state === "granted";
//       }
      
//       // Fallback: try to create a temporary recognition to test
//       if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
//         const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//         const testRec = new SpeechRecognition();
//         testRec.continuous = false;
//         testRec.interimResults = false;
        
//         return new Promise((resolve) => {
//           testRec.onstart = () => {
//             testRec.stop();
//             setMicPermission("granted");
//             resolve(true);
//           };
          
//           testRec.onerror = (ev: any) => {
//             if (ev.error === "not-allowed") {
//               setMicPermission("denied");
//               resolve(false);
//             } else {
//               setMicPermission("granted");
//               resolve(true);
//             }
//           };
          
//           testRec.start();
          
//           // Timeout fallback
//           setTimeout(() => {
//             testRec.stop();
//             setMicPermission("prompt");
//             resolve(true); // Assume granted if no error
//           }, 1000);
//         });
//       }
      
//       return true; // Assume supported if we can't check
//     } catch (error) {
//       console.warn("Permission check failed:", error);
//       return true; // Assume granted
//     }
//   };

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

//   const sendToBackend = async (text: string) => {
//     if (!text || !text.trim()) return;
//     setStatus("Analyzing...");
//     try {
//       const resp = await axios.post(
//         `${API_BASE}/api/analyze/${game}/`,
//         { stats: text },
//         {
//           headers: {
//             Authorization: userToken ? `Bearer ${userToken}` : "",
//             "Content-Type": "application/json",
//           },
//         }
//       );
//       onAnalysis?.(resp.data);
//       setStatus("Analysis complete");
      
//       // Restart wake engine after analysis is complete
//       setTimeout(() => {
//         if (wakeActive && !listening) {
//           setStatus("Wake listening - say 'Hey NeuraPlay'");
//           startWakeEngine();
//         } else {
//           setStatus("Ready");
//         }
//       }, 1000);
//     } catch (err) {
//       console.error("Analysis request failed:", err);
//       setStatus("Analysis failed");
      
//       // Restart wake engine even on failure
//       setTimeout(() => {
//         if (wakeActive && !listening) {
//           setStatus("Wake listening - say 'Hey NeuraPlay'");
//           startWakeEngine();
//         } else {
//           setStatus("Ready");
//         }
//       }, 1000);
//     }
//   };

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

//   const startMainRecognition = () => {
//     if (listening) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition))
//       return setStatus("SpeechRecognition not supported");

//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied. Please allow microphone access.");
//       return;
//     }

//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Listening...");

//     const SpeechRecognition =
//       (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//     const rec = new SpeechRecognition();
//     mainRec.current = rec;

//     rec.continuous = true;
//     rec.interimResults = true;
//     rec.lang = "en-US";

//     rec.onresult = (ev: any) => {
//       let interim = "";
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const r = ev.results[i];
//         const t = r[0]?.transcript || "";
//         if (r.isFinal) {
//           finalBuffer.current += (finalBuffer.current ? " " : "") + t;
//         } else {
//           interim += t;
//         }
//       }
//       const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//       setTranscript(display);
//       resetSilenceTimer();
//     };

//     rec.onerror = (ev: any) => {
//       console.warn("Main rec error:", ev?.error);
//       if (ev?.error === "not-allowed") {
//         setMicPermission("denied");
//         setStatus("Microphone permission denied");
//         setListening(false);
//         safeStop(rec);
//         return;
//       }
//       stopMainRecognition(false);
//     };

//     rec.onend = () => {
//       stopMainRecognition(true);
//     };

//     try {
//       rec.start();
//       setStatus("Listening...");
//     } catch (err) {
//       console.error("Failed to start main recognition:", err);
//       setStatus("Failed to start microphone");
//       setListening(false);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;

//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const text = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);
//     setTranscript("");

//     if (sendData && text) {
//       sendToBackend(text);
//     } else {
//       // Immediately restart wake engine if not sending data
//       if (wakeActive) {
//         setStatus("Wake listening - say 'Hey NeuraPlay'");
//         startWakeEngine();
//       } else {
//         setStatus("Ready");
//       }
//     }
//   };

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
//     if (text.includes("neuraplay") || text.includes("neura") || text.includes("neural")) {
//       return "wake";
//     }
//     if (text.includes("fifa")) return "fifa";
//     if (text.includes("lol") || text.includes("league")) return "lol";
//     return null;
//   };

//   const startWakeEngine = () => {
//     if (wakeRec.current || listening) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//       setStatus("Wake not supported");
//       return;
//     }

//     if (micPermission === "denied") {
//       setStatus("Microphone permission denied - wake disabled");
//       return;
//     }

//     try {
//       const SpeechRecognition =
//         (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       wakeRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = false;
//       rec.lang = "en-US";
//       rec.maxAlternatives = 1;

//       rec.onresult = (ev: any) => {
//         if (processingWake.current || listening) return;
//         const last = ev.results[ev.results.length - 1];
//         const text = (last && last[0] && last[0].transcript) ? String(last[0].transcript).toLowerCase() : "";
//         if (!text) return;
//         const intent = detectWakeIntent(text);
//         if (!intent) return;

//         processingWake.current = true;
//         safeStop(rec);
//         wakeRec.current = null;

//         if (intent === "fifa" || intent === "lol") {
//           setGame(intent);
//           setStatus(`Switched to ${intent.toUpperCase()} (wake)`);
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

//   // Initialize on component mount
//   useEffect(() => {
//     const initialize = async () => {
//       if (isInitialized.current) return;
//       isInitialized.current = true;

//       // Check if speech recognition is supported
//       if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//         setStatus("Speech recognition not supported in this browser");
//         setWakeActive(false);
//         return;
//       }

//       // Check microphone permission
//       setStatus("Checking microphone access...");
//       const hasPermission = await checkMicrophonePermission();
      
//       if (hasPermission) {
//         setStatus("Starting wake engine...");
//         // Start wake engine with a small delay
//         setTimeout(() => {
//           if (wakeActive) {
//             startWakeEngine();
//           }
//         }, 800);
//       } else {
//         setStatus("Microphone access required for voice commands");
//         setWakeActive(false);
//       }
//     };

//     initialize();

//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//     };
//   }, []);

//   // Handle wakeActive changes
//   useEffect(() => {
//     if (wakeActive && !listening && !wakeRec.current && micPermission !== "denied") {
//       startWakeEngine();
//     } else if (!wakeActive && wakeRec.current) {
//       stopWakeEngine();
//     }
//   }, [wakeActive, listening, micPermission]);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between mb-3">
//         <div>
//           <div className="text-sm font-medium">
//             Game: <span className="text-purple-400 uppercase">{game}</span>
//           </div>
//           <div className="text-xs text-gray-400 mt-1">{status}</div>
//           {micPermission === "denied" && (
//             <div className="text-xs text-red-400 mt-1">
//               Microphone access denied. Please allow microphone permissions in your browser.
//             </div>
//           )}
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             disabled={micPermission === "denied"}
//             className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive 
//                 ? "bg-green-600 hover:bg-green-700" 
//                 : "bg-gray-700 hover:bg-gray-600"
//             } ${micPermission === "denied" ? "opacity-50 cursor-not-allowed" : ""}`}
//             title={micPermission === "denied" ? "Microphone access denied" : "Toggle wake words"}
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
//           disabled={micPermission === "denied"}
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening 
//               ? "bg-red-600 hover:bg-red-700 animate-pulse" 
//               : "bg-purple-600 hover:bg-purple-700"
//           } ${micPermission === "denied" ? "opacity-50 cursor-not-allowed" : ""}`}
//           title={micPermission === "denied" ? "Microphone access denied" : listening ? "Stop listening" : "Start listening"}
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















// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import axios from "axios";
// import { Mic, Square, Ear, EarOff } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// // Balanced threshold (user chose B)
// const WAKE_SIMILARITY_THRESHOLD = 0.65;

// // Candidate wake phrases (common variations + fallback tokens)
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
//    Utility: Levenshtein distance -> similarity (0..1)
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
//   const dist = levenshteinDistance(a, b);
//   const maxLen = Math.max(a.length, b.length);
//   if (maxLen === 0) return 1;
//   return 1 - dist / maxLen;
// }

// /* --------------------------
//    Component
//    -------------------------- */
// const VoiceInput: React.FC<Props> = ({
//   userToken,
//   initialGame = "fifa",
//   onAnalysis,
// }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(true);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");

//   // refs for recognition objects & timers
//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const restartWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const processingWake = useRef(false);
//   const wakeBackoff = useRef<number>(500); // backoff for restarts (ms)

//   // safe stop (guards and clears handlers)
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

//   // Send transcript to backend
//   const sendToBackend = async (text: string) => {
//     if (!text || !text.trim()) return;
//     setStatus("Analyzing...");
//     try {
//       const resp = await axios.post(
//         `${API_BASE}/api/analyze/${game}/`,
//         { stats: text },
//         {
//           headers: {
//             Authorization: userToken ? `Bearer ${userToken}` : "",
//             "Content-Type": "application/json",
//           },
//         }
//       );
//       onAnalysis?.(resp.data);
//       setStatus("Analysis complete");
//       // Display a short message for UX
//       setTimeout(() => setStatus("Ready"), 2000);
//     } catch (err) {
//       console.error("Analysis request failed:", err);
//       setStatus("Analysis failed");
//       setTimeout(() => setStatus("Ready"), 2000);
//     }
//   };

//   // Reset / start silence timer (auto-send after user stops speaking)
//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }
//     // Auto-send after 4s silence
//     silenceTimer.current = setTimeout(() => {
//       const finalText = finalBuffer.current.trim();
//       stopMainRecognition(Boolean(finalText));
//     }, 4000);
//   };

//   /* --------------------------
//      Main recognition (manual or wake-triggered)
//      -------------------------- */
//   const startMainRecognition = () => {
//     if (listening) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition))
//       return setStatus("SpeechRecognition not supported");

//     // stop wake listener before starting main recognition
//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Listening...");

//     const SpeechRecognition =
//       (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//     const rec = new SpeechRecognition();
//     mainRec.current = rec;

//     rec.continuous = true;
//     rec.interimResults = true;
//     rec.lang = "en-US";

//     rec.onresult = (ev: any) => {
//       let interim = "";
//       // aggregate results
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const r = ev.results[i];
//         const t = r[0]?.transcript || "";
//         if (r.isFinal) {
//           finalBuffer.current += (finalBuffer.current ? " " : "") + t;
//         } else {
//           interim += t;
//         }
//       }
//       const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//       setTranscript(display);
//       // reset silence timer
//       resetSilenceTimer();
//     };

//     rec.onerror = (ev: any) => {
//       console.warn("Main rec error:", ev?.error);
//       // If permission denied, show message and stop
//       if (ev?.error === "not-allowed") {
//         setStatus("Microphone permission denied");
//         setListening(false);
//         safeStop(rec);
//         // do not restart wake engine here
//         return;
//       }
//       // try to stop gracefully and restart wake engine later
//       stopMainRecognition(false);
//     };

//     rec.onend = () => {
//       // ended (either user stopped or error)
//       // If user was speaking and finalBuffer is present, we'll send in stopMainRecognition
//       stopMainRecognition(true);
//     };

//     try {
//       rec.start();
//       setStatus("Listening...");
//     } catch (err) {
//       console.error("Failed to start main recognition:", err);
//       setStatus("Failed to start microphone");
//       setListening(false);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;

//     // clear silence timer
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const text = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);
//     setTranscript("");

//     if (sendData && text) {
//       sendToBackend(text);
//     } else {
//       setStatus("Ready");
//     }

//     // restart wake engine (with small delay) if wakeActive
//     if (wakeActive) {
//       // reset backoff on success
//       wakeBackoff.current = 500;
//       setTimeout(() => startWakeEngine(), 600);
//     }
//   };

//   /* --------------------------
//      Wake-word engine (continuous listening for triggers)
//      -------------------------- */
//   const detectWakeIntent = (textRaw: string): "wake" | GameType | null => {
//     if (!textRaw) return null;
//     const text = textRaw.toLowerCase().trim();

//     // check general wake phrases
//     for (const w of WAKE_PHRASES) {
//       if (similarity(text, w) >= WAKE_SIMILARITY_THRESHOLD) return "wake";
//     }
//     // fifa
//     for (const f of FIFA_PHRASES) {
//       if (similarity(text, f) >= WAKE_SIMILARITY_THRESHOLD) return "fifa";
//     }
//     // lol
//     for (const l of LOL_PHRASES) {
//       if (similarity(text, l) >= WAKE_SIMILARITY_THRESHOLD) return "lol";
//     }
//     // fallback: if text contains tokens explicitly
//     if (text.includes("neuraplay") || text.includes("neura") || text.includes("neural")) {
//       return "wake";
//     }
//     if (text.includes("fifa")) return "fifa";
//     if (text.includes("lol") || text.includes("league")) return "lol";
//     return null;
//   };

//   const startWakeEngine = () => {
//     // don't start if already running or main listening active
//     if (wakeRec.current || listening) return;
//     if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
//       setStatus("Wake not supported");
//       return;
//     }

//     try {
//       const SpeechRecognition =
//         (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       wakeRec.current = rec;

//       rec.continuous = true;
//       rec.interimResults = false; // we only need final phrases for wake detection
//       rec.lang = "en-US";
//       rec.maxAlternatives = 1;

//       rec.onresult = (ev: any) => {
//         if (processingWake.current || listening) return;
//         const last = ev.results[ev.results.length - 1];
//         const text = (last && last[0] && last[0].transcript) ? String(last[0].transcript).toLowerCase() : "";
//         if (!text) return;
//         const intent = detectWakeIntent(text);
//         if (!intent) return;

//         processingWake.current = true;
//         // stop wake engine and switch mode accordingly
//         safeStop(rec);
//         wakeRec.current = null;

//         if (intent === "fifa" || intent === "lol") {
//           setGame(intent);
//           setStatus(`Switched to ${intent.toUpperCase()} (wake)`);
//         } else {
//           setStatus("Wake detected");
//         }

//         // small delay then start main recognizer
//         setTimeout(() => {
//           processingWake.current = false;
//           startMainRecognition();
//         }, 300);
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Wake engine error:", ev?.error);
//         safeStop(rec);
//         wakeRec.current = null;
//         // Handle permission denied specially
//         if (ev?.error === "not-allowed") {
//           setWakeActive(false);
//           setStatus("Mic permission denied - wake disabled");
//           return;
//         }
//         // Exponential backoff restart (but bounded)
//         const backoff = Math.min(wakeBackoff.current, 5000);
//         restartWakeTimer.current = setTimeout(() => {
//           wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//           if (wakeActive && !listening) startWakeEngine();
//         }, backoff);
//         wakeBackoff.current = Math.min(5000, wakeBackoff.current * 1.5);
//       };

//       rec.onend = () => {
//         // normal end (auto-restart if wakeActive)
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
//       // reset backoff on successful start
//       wakeBackoff.current = 500;
//     } catch (err) {
//       console.error("Failed to start wake engine:", err);
//       setStatus("Wake failed");
//       wakeRec.current = null;
//       // schedule a restart attempt
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
//     } else {
//       setWakeActive(true);
//       startWakeEngine();
//       setStatus("Wake enabled");
//     }
//   };

//   // Click handler for mic button
//   const handleMicClick = () => {
//     if (listening) {
//       // stop and send if any buffer
//       stopMainRecognition(true);
//     } else {
//       startMainRecognition();
//     }
//   };

//   // Clear transcript UI only (manual)
//   const clearTranscript = () => {
//     setTranscript("");
//     finalBuffer.current = "";
//   };

//   // start wake engine on mount if wakeActive
//   useEffect(() => {
//     if (wakeActive) startWakeEngine();
//     setStatus("Ready");
//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []); // run once on mount

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between mb-3">
//         <div>
//           <div className="text-sm font-medium">
//             Game: <span className="text-purple-400 uppercase">{game}</span>
//           </div>
//           <div className="text-xs text-gray-400 mt-1">{status}</div>
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             className={`flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             }`}
//             title="Toggle wake words"
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
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
//           }`}
//           title={listening ? "Stop listening" : "Start listening"}
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

















// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import axios from "axios";
// import { Mic, Square, Ear, EarOff } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(false);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Click mic or enable wake words");

//   const mainRec = useRef<any | null>(null);
//   const wakeRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalBuffer = useRef<string>("");
//   const isProcessingWakeWord = useRef(false);

//   // Simple safe stop function
//   const safeStop = (rec: any | null) => {
//     if (!rec) return;
//     try {
//       rec.onresult = null;
//       rec.onend = null;
//       rec.onerror = null;
//       rec.stop();
//     } catch (e) {
//       // Ignore
//     }
//   };

//   const sendToBackend = async (text: string) => {
//     if (!text || !text.trim()) return;
//     setStatus("Analyzing your gameplay...");
//     const payload = { stats: text };
//     try {
//       const resp = await axios.post(
//         `${API_BASE}/api/analyze/${game}/`,
//         payload,
//         { headers: { Authorization: `Bearer ${userToken}` } }
//       );
//       if (onAnalysis) onAnalysis(resp.data);
//       console.log("Backend response:", resp.data);
//       setStatus("Analysis complete!");
//       setTimeout(() => setStatus("Ready"), 3000);
//     } catch (err) {
//       console.error("Failed sending analysis:", err);
//       setStatus("Analysis failed - try again");
//       setTimeout(() => setStatus("Ready"), 3000);
//     }
//   };

//   // Main recording function
//   const startMainRecognition = () => {
//     if (listening) return;

//     if (!("webkitSpeechRecognition" in window)) {
//       alert("Speech recognition not supported in this browser");
//       return;
//     }

//     // Stop wake engine during active recording
//     if (wakeActive) {
//       safeStop(wakeRec.current);
//       wakeRec.current = null;
//     }

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);
//     setStatus("Listening... speak now");

//     const rec = new (window as any).webkitSpeechRecognition();
//     mainRec.current = rec;
    
//     rec.continuous = true;
//     rec.interimResults = true;
//     rec.lang = "en-US";

//     rec.onresult = (ev: any) => {
//       let finalText = finalBuffer.current;
//       let interimText = "";

//       // Process all results
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const result = ev.results[i];
//         const text = result[0].transcript;
        
//         if (result.isFinal) {
//           // Add space between sentences/phrases
//           finalText += (finalText ? " " : "") + text;
//         } else {
//           interimText = text;
//         }
//       }

//       finalBuffer.current = finalText;
      
//       // Display both final and interim text
//       const displayText = finalText + (interimText ? " " + interimText : "");
//       setTranscript(displayText);
      
//       // Reset silence timer on any speech activity
//       resetSilenceTimer();
//     };

//     rec.onerror = (ev: any) => {
//       console.log("Recognition error:", ev.error);
//       if (ev.error !== "aborted") {
//         setStatus("Microphone error - try again");
//         stopMainRecognition(false);
//       }
//     };

//     rec.onend = () => {
//       console.log("Main recognition ended");
//       stopMainRecognition(true);
//     };

//     try {
//       rec.start();
//       console.log("Main recognition started");
//     } catch (error) {
//       console.error("Failed to start recognition:", error);
//       setStatus("Failed to start microphone");
//       setListening(false);
//     }
//   };

//   const stopMainRecognition = (sendData: boolean) => {
//     safeStop(mainRec.current);
//     mainRec.current = null;
    
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const finalText = finalBuffer.current.trim();
    
//     setListening(false);
//     finalBuffer.current = "";
    
//     if (sendData && finalText) {
//       setTranscript("");
//       sendToBackend(finalText);
//     } else {
//       setStatus("Ready");
//     }

//     // Restart wake engine if it was active
//     if (wakeActive) {
//       setTimeout(startWakeEngine, 1000);
//     }
//   };

//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//     }
//     silenceTimer.current = setTimeout(() => {
//       if (finalBuffer.current.trim()) {
//         stopMainRecognition(true);
//       } else {
//         stopMainRecognition(false);
//       }
//     }, 4000);
//   };

//   // NEW: Simple wake word detection
//   const startWakeEngine = () => {
//     if (wakeRec.current || listening || !("webkitSpeechRecognition" in window)) {
//       return;
//     }

//     console.log("Starting wake word detection...");
    
//     const rec = new (window as any).webkitSpeechRecognition();
//     wakeRec.current = rec;
    
//     // Configure for wake word detection
//     rec.continuous = true;
//     rec.interimResults = false; // Only final results
//     rec.lang = "en-US";
//     rec.maxAlternatives = 1;

//     rec.onresult = (ev: any) => {
//       if (isProcessingWakeWord.current || listening) return;
      
//       const result = ev.results[ev.results.length - 1];
//       const text = result[0].transcript.toLowerCase().trim();
      
//       console.log("Wake word heard:", text);
      
//       // Simple wake word detection
//       if (text.includes("hey neuraplay") || 
//           text.includes("hey neural play") ||
//           text.includes("neuraplay") ||
//           text.includes("hey fifa") || 
//           text.includes("hey lol") ||
//           text.includes("hey league")) {
        
//         isProcessingWakeWord.current = true;
//         console.log("Wake word detected! Starting recording...");
        
//         // Handle game-specific wake words
//         if (text.includes("fifa")) {
//           setGame("fifa");
//         } else if (text.includes("lol") || text.includes("league")) {
//           setGame("lol");
//         }
        
//         // Stop wake engine and start recording
//         safeStop(wakeRec.current);
//         wakeRec.current = null;
        
//         setTimeout(() => {
//           startMainRecognition();
//           isProcessingWakeWord.current = false;
//         }, 500);
//       }
//     };

//     rec.onerror = (ev: any) => {
//       console.log("Wake engine error:", ev.error);
      
//       if (ev.error === "not-allowed") {
//         setWakeActive(false);
//         setStatus("Microphone permission denied");
//         return;
//       }
      
//       // Restart on other errors
//       safeStop(wakeRec.current);
//       wakeRec.current = null;
      
//       if (wakeActive && !listening) {
//         setTimeout(startWakeEngine, 2000);
//       }
//     };

//     rec.onend = () => {
//       console.log("Wake engine ended");
//       wakeRec.current = null;
      
//       // Auto-restart if still active
//       if (wakeActive && !listening) {
//         setTimeout(startWakeEngine, 1000);
//       }
//     };

//     try {
//       rec.start();
//       setWakeActive(true);
//       setStatus("Wake words active - say 'Hey NeuraPlay'");
//       console.log("Wake engine started successfully");
//     } catch (error) {
//       console.error("Failed to start wake engine:", error);
//       setWakeActive(false);
//       setStatus("Failed to start wake words");
//       wakeRec.current = null;
//     }
//   };

//   const stopWakeEngine = () => {
//     safeStop(wakeRec.current);
//     wakeRec.current = null;
//     setWakeActive(false);
//     setStatus("Wake words disabled");
//   };

//   const toggleWakeEngine = () => {
//     if (wakeActive) {
//       stopWakeEngine();
//     } else {
//       startWakeEngine();
//     }
//   };

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

//   // Initialize wake engine on mount
//   useEffect(() => {
//     startWakeEngine();
    
//     return () => {
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (silenceTimer.current) {
//         clearTimeout(silenceTimer.current);
//       }
//     };
//   }, []);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       {/* Header with controls */}
//       <div className="flex items-center justify-between mb-4">
//         <div>
//           <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
//           <div className="text-xs text-gray-400 mt-1">{status}</div>
//         </div>
        
//         <div className="flex gap-2">
//           <button
//             onClick={toggleWakeEngine}
//             className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors ${
//               wakeActive 
//                 ? "bg-green-600 hover:bg-green-700" 
//                 : "bg-gray-600 hover:bg-gray-700"
//             }`}
//           >
//             {wakeActive ? <Ear size={14} /> : <EarOff size={14} />}
//             {wakeActive ? "Wake On" : "Wake Off"}
//           </button>
          
//           <button
//             onClick={() => setGame(g => g === "fifa" ? "lol" : "fifa")}
//             className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
//           >
//             Switch Game
//           </button>
//         </div>
//       </div>

//       {/* Main microphone button and transcript */}
//       <div className="flex items-start gap-4">
//         <button
//           onClick={handleMicClick}
//           className={`flex-shrink-0 p-4 rounded-full transition-all ${
//             listening 
//               ? "bg-red-600 hover:bg-red-700 animate-pulse" 
//               : "bg-purple-600 hover:bg-purple-700"
//           }`}
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
//                 className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm transition-colors"
//               >
//                 Send for Analysis
//               </button>
//               <button
//                 onClick={clearTranscript}
//                 className="px-3 bg-gray-600 hover:bg-gray-700 py-2 rounded text-sm transition-colors"
//               >
//                 Clear
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Wake word instructions */}
//       <div className="mt-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
//         <div className="text-xs text-blue-300 font-medium mb-1">Voice Commands:</div>
//         <div className="text-xs text-blue-200 space-y-1">
//           <div>• <span className="font-mono">"Hey NeuraPlay"</span> - Start recording</div>
//           <div>• <span className="font-mono">"Hey FIFA"</span> - Switch to FIFA & record</div>
//           <div>• <span className="font-mono">"Hey LOL"</span> - Switch to League & record</div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default VoiceInput;














// // VoiceInput.tsx
// import React, { useEffect, useRef, useState } from "react";
// import axios from "axios";
// import { Mic, Square } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void; // optional hook for parent
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false); // active recording
//   const [wakeActive, setWakeActive] = useState(true); // background wake-word engine status
//   const [transcript, setTranscript] = useState<string>("");

//   // refs to recognition instances and timers
//   const wakeRec = useRef<any | null>(null);
//   const mainRec = useRef<any | null>(null);
//   const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const wakeRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const avoidRapidRestart = useRef(false); // prevents immediate restarts
//   const finalBuffer = useRef<string>(""); // accumulated final transcript parts

//   // Helper: safe stop and detach handlers to avoid abort cascades
//   const safeStop = (rec: any | null) => {
//     if (!rec) return;
//     try {
//       rec.onresult = null;
//       rec.onend = null;
//       rec.onerror = null;
//       rec.onspeechend = null;
//       rec.stop();
//     } catch {
//       /* ignore */
//     }
//   };

//   // Send text to backend
//   const sendToBackend = async (text: string) => {
//     if (!text || !text.trim()) return;
//     const payload = { stats: text };
//     try {
//       const resp = await axios.post(
//         `${API_BASE}/api/analyze/${game}/`,
//         payload,
//         { headers: { Authorization: `Bearer ${userToken}` } }
//       );
//       if (onAnalysis) onAnalysis(resp.data);
//       // optionally show or keep results here (not included)
//       console.log("Backend response:", resp.data);
//     } catch (err) {
//       console.error("Failed sending analysis:", err);
//     }
//   };

//   // --- Active recording (manual mic) ---
//   const startMainRecognition = () => {
//     if (listening) return;

//     if (!("webkitSpeechRecognition" in window)) {
//       alert("SpeechRecognition not supported — use Chrome.");
//       return;
//     }

//     // stop wake-word temporarily
//     safeStop(wakeRec.current);
//     wakeRec.current = null;
//     setWakeActive(false);

//     finalBuffer.current = "";
//     setTranscript("");
//     setListening(true);

//     const rec = new (window as any).webkitSpeechRecognition();
//     mainRec.current = rec;
//     rec.continuous = true;
//     rec.interimResults = true;
//     rec.lang = "en-US";

//     rec.onresult = (ev: any) => {
//       let interim = "";
//       // iterate over results and build finalBuffer/interim
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const res = ev.results[i];
//         const text = res[0].transcript;
//         if (res.isFinal) {
//           finalBuffer.current = (finalBuffer.current ? finalBuffer.current + " " : "") + text.trim();
//         } else {
//           interim += text;
//         }
//       }

//       const display = (finalBuffer.current + (interim ? " " + interim : "")).trim();
//       setTranscript(display);

//       // reset silence auto-send timer anytime new speech appears
//       resetSilenceTimer();
//     };

//     rec.onspeechend = () => {
//       // browser may call this; we rely more on timer or onend
//       resetSilenceTimer();
//     };

//     rec.onerror = (err: any) => {
//       // ignore harmless aborted; else stop
//       if (err && err.error && err.error !== "aborted") {
//         console.error("Main recognition error:", err);
//         stopMainRecognition(false);
//       } else {
//         // aborted happens when we intentionally switch - don't spam restarts
//         stopMainRecognition(false);
//       }
//     };

//     rec.onend = () => {
//       // when user stops speaking and recognition ends, finalize if any text
//       setListening(false);
//       if (finalBuffer.current.trim()) {
//         const textToSend = finalBuffer.current.trim();
//         finalBuffer.current = "";
//         setTranscript("");
//         sendToBackend(textToSend);
//       }
//       // restart wake engine after short delay
//       scheduleWakeRestart(500);
//     };

//     try {
//       rec.start();
//     } catch (e) {
//       console.error("Failed to start main recognition:", e);
//       setListening(false);
//       scheduleWakeRestart(500);
//     }
//   };

//   const stopMainRecognition = (sendRemaining = true) => {
//     if (!mainRec.current && !listening) return;

//     try {
//       // stop and clear timers
//       safeStop(mainRec.current);
//     } catch {}
//     mainRec.current = null;
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }

//     const final = finalBuffer.current.trim();
//     finalBuffer.current = "";
//     setListening(false);
//     setTranscript("");

//     if (sendRemaining && final) {
//       sendToBackend(final);
//     }

//     // restart wake engine (debounced)
//     scheduleWakeRestart(500);
//   };

//   // silence auto-send implementation (4s)
//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }
//     silenceTimer.current = setTimeout(() => {
//       // on 4s silence, stop recognition and send final text
//       const final = finalBuffer.current.trim();
//       if (final) {
//         stopMainRecognition(true);
//       } else {
//         stopMainRecognition(false);
//       }
//     }, 4000);
//   };

//   // --- Wake-word engine (background) ---
//   const startWakeEngine = () => {
//     if (!("webkitSpeechRecognition" in window)) {
//       console.warn("No webkitSpeechRecognition in window");
//       setWakeActive(false);
//       return;
//     }

//     // if already running, do nothing
//     if (wakeRec.current) return;

//     avoidRapidRestart.current = true;
//     try {
//       const rec = new (window as any).webkitSpeechRecognition();
//       wakeRec.current = rec;
//       rec.continuous = true;
//       rec.interimResults = true;
//       rec.lang = "en-US";

//       rec.onresult = (ev: any) => {
//         // pick the last transcript chunk
//         const t = ev.results[ev.results.length - 1][0].transcript.toLowerCase().trim();
//         // console.debug("wake heard:", t);
//         if (t.includes("hey neuraplay") || t.includes("hey neura play")) {
//           // small cooldown to avoid immediate re-trigger
//           if (!listening) {
//             startMainRecognition();
//           }
//         }
//         if (t.includes("hey fifa")) {
//           setGame("fifa");
//           if (!listening) startMainRecognition();
//         }
//         if (t.includes("hey lol") || t.includes("hey league")) {
//           setGame("lol");
//           if (!listening) startMainRecognition();
//         }
//       };

//       rec.onerror = (err: any) => {
//         // ignore aborted noise; restart on other errors
//         if (err && err.error && err.error !== "aborted") {
//           console.warn("Wake engine error:", err);
//         }
//         // restart (debounced)
//         scheduleWakeRestart(1000);
//       };

//       rec.onend = () => {
//         // normal end — restart the wake engine (but avoid rapid flapping)
//         scheduleWakeRestart(1000);
//       };

//       // start after a short delay if we're in cooldown
//       setTimeout(() => {
//         try {
//           rec.start();
//           setWakeActive(true);
//         } catch (e) {
//           console.warn("Failed to start wake engine:", e);
//           setWakeActive(false);
//         } finally {
//           // allow future restarts
//           setTimeout(() => { avoidRapidRestart.current = false; }, 800);
//         }
//       }, 50);
//     } catch (e) {
//       console.error("startWakeEngine exception:", e);
//       setWakeActive(false);
//     }
//   };

//   const scheduleWakeRestart = (delayMs = 1000) => {
//     if (wakeRestartTimer.current) {
//       clearTimeout(wakeRestartTimer.current);
//       wakeRestartTimer.current = null;
//     }
//     // if user is actively recording we shouldn't restart background engine
//     wakeRestartTimer.current = setTimeout(() => {
//       // if main recording is running, skip wake restart for now
//       if (listening) return;
//       // avoid rapid loops
//       if (avoidRapidRestart.current) {
//         // try again shortly
//         scheduleWakeRestart(800);
//         return;
//       }
//       safeStop(wakeRec.current);
//       wakeRec.current = null;
//       startWakeEngine();
//     }, delayMs);
//   };

//   const stopWakeEngine = () => {
//     if (wakeRestartTimer.current) {
//       clearTimeout(wakeRestartTimer.current);
//       wakeRestartTimer.current = null;
//     }
//     safeStop(wakeRec.current);
//     wakeRec.current = null;
//     setWakeActive(false);
//   };

//   // Manual toggle for wake engine (UI control)
//   const toggleWake = () => {
//     if (wakeRec.current) {
//       stopWakeEngine();
//     } else {
//       startWakeEngine();
//     }
//   };

//   // UI button handlers
//   const handleMicPress = () => {
//     if (listening) {
//       stopMainRecognition(true);
//     } else {
//       startMainRecognition();
//     }
//   };

//   // keep wake engine alive on mount
//   useEffect(() => {
//     startWakeEngine();
//     return () => {
//       // cleanup everything
//       safeStop(mainRec.current);
//       safeStop(wakeRec.current);
//       if (silenceTimer.current) {
//         clearTimeout(silenceTimer.current);
//       }
//       if (wakeRestartTimer.current) {
//         clearTimeout(wakeRestartTimer.current);
//       }
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       <div className="flex items-center justify-between gap-4 mb-3">
//         <div>
//           <div className="text-sm text-gray-300">Mode: <strong className="uppercase">{game}</strong></div>
//           <div className="text-xs text-gray-500">{wakeActive ? "Wake engine: active" : "Wake engine: stopped"}</div>
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={toggleWake}
//             className="px-3 py-1 bg-blue-600 rounded text-xs"
//             title="Toggle wake-word listener"
//           >
//             {wakeActive ? "Disable Wake" : "Enable Wake"}
//           </button>

//           <button
//             onClick={() => setGame(g => g === "fifa" ? "lol" : "fifa")}
//             className="px-3 py-1 bg-gray-700 rounded text-xs"
//             title="Switch game"
//           >
//             Switch → {game === "fifa" ? "LoL" : "FIFA"}
//           </button>
//         </div>
//       </div>

//       <div className="flex items-center gap-4">
//         <button
//           onClick={handleMicPress}
//           className={`p-4 rounded-full ${listening ? "bg-red-600 animate-pulse" : "bg-purple-600"} flex items-center justify-center`}
//           title={listening ? "Stop listening" : "Start listening"}
//         >
//           {listening ? <Square size={22} /> : <Mic size={22} />}
//         </button>

//         <div className="flex-1 min-w-0">
//           <div className="p-3 bg-gray-800 rounded text-sm break-words min-h-[48px]">
//             {transcript || (listening ? "Listening..." : "Press mic or say 'Hey NeuraPlay'")}
//           </div>
//         </div>
//       </div>

//       <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
//         <div>Say "Hey NeuraPlay" • "Hey FIFA" • "Hey LOL"</div>
//         <div>{listening ? "Active recording" : "Idle"}</div>
//       </div>
//     </div>
//   );
// };

// export default VoiceInput;













// import React, { useState, useRef, useEffect } from "react";
// import axios from "axios";

// interface VoiceInputProps {
//   userToken: string;
//   game: "fifa" | "lol";
// }

// interface AnalysisResponse {
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
// }

// const apiUrl = import.meta.env.VITE_API_BASE_URL!;

// const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
//   const [transcript, setTranscript] = useState<string>("");
//   const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [isListening, setIsListening] = useState(false);
  
//   const recognitionRef = useRef<any>(null);
//   const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const finalTranscriptRef = useRef<string>(""); // Store final transcript parts

//   useEffect(() => {
//     return () => {
//       // Cleanup on unmount
//       if (silenceTimerRef.current) {
//         clearTimeout(silenceTimerRef.current);
//       }
//       if (recognitionRef.current) {
//         recognitionRef.current.stop();
//       }
//     };
//   }, []);

//   const sendAnalysisRequest = async (text: string) => {
//     if (!text.trim()) return;

//     setLoading(true);
//     try {
//       const response = await axios.post(
//         `${apiUrl}/api/analyze/${game}/`,
//         { stats: text },
//         { headers: { Authorization: `Bearer ${userToken}` } }
//       );
//       setAnalysis(response.data);
//     } catch (err) {
//       console.error("❌ Analysis request failed:", err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const resetSilenceTimer = () => {
//     // Clear existing timer
//     if (silenceTimerRef.current) {
//       clearTimeout(silenceTimerRef.current);
//     }
    
//     // Set new timer for 4 seconds
//     silenceTimerRef.current = setTimeout(() => {
//       if (finalTranscriptRef.current.trim()) {
//         sendAnalysisRequest(finalTranscriptRef.current.trim());
//         stopSpeechRecognition();
//       }
//     }, 4000);
//   };

//   const startSpeechRecognition = () => {
//     setTranscript("");
//     setAnalysis(null);
//     finalTranscriptRef.current = ""; // Reset final transcript
//     setIsListening(true);

//     const recognition = new (window as any).webkitSpeechRecognition();
//     recognitionRef.current = recognition;
    
//     recognition.continuous = true;
//     recognition.interimResults = true;
//     recognition.lang = "en-US";

//     recognition.onresult = (event: any) => {
//       let interimTranscript = "";

//       // Process all results since last event
//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         const text = event.results[i][0].transcript;
        
//         if (event.results[i].isFinal) {
//           // This is a final result - append to final transcript with proper spacing
//           finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + text;
//         } else {
//           // This is an interim result - show as temporary text
//           interimTranscript += text;
//         }
//       }

//       // Update the displayed transcript: final + current interim
//       const displayTranscript = finalTranscriptRef.current + 
//         (interimTranscript ? " " + interimTranscript : "");
//       setTranscript(displayTranscript);

//       // Reset silence timer whenever we get new speech (final OR interim)
//       if (displayTranscript.trim()) {
//         resetSilenceTimer();
//       }
//     };

//     recognition.onerror = (event: any) => {
//       console.error("Speech recognition error:", event.error);
//       setIsListening(false);
//       setLoading(false);
//     };

//     recognition.onend = () => {
//       setIsListening(false);
//       // If we have final transcript but no timer fired, send it now
//       if (finalTranscriptRef.current.trim() && !loading) {
//         sendAnalysisRequest(finalTranscriptRef.current.trim());
//       }
//     };

//     recognition.start();
//   };

//   const stopSpeechRecognition = () => {
//     if (recognitionRef.current) {
//       recognitionRef.current.stop();
//     }
//     if (silenceTimerRef.current) {
//       clearTimeout(silenceTimerRef.current);
//     }
//     setIsListening(false);
//   };

//   const handleManualSend = () => {
//     if (finalTranscriptRef.current.trim()) {
//       stopSpeechRecognition();
//       sendAnalysisRequest(finalTranscriptRef.current.trim());
//     }
//   };

//   const clearTranscript = () => {
//     setTranscript("");
//     finalTranscriptRef.current = "";
//     setAnalysis(null);
//   };

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white">
//       <div className="flex items-center gap-3 mb-3">
//         <button
//           onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
//           disabled={loading}
//           className={`px-4 py-2 rounded flex items-center gap-2 ${
//             isListening 
//               ? "bg-red-600 hover:bg-red-700" 
//               : "bg-blue-600 hover:bg-blue-700"
//           } disabled:bg-gray-600`}
//         >
//           {isListening ? (
//             <>
//               <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
//               Stop Listening
//             </>
//           ) : (
//             "🎤 Start Speaking"
//           )}
//         </button>

//         {transcript && !loading && (
//           <button
//             onClick={handleManualSend}
//             className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
//           >
//             Send Now
//           </button>
//         )}

//         {transcript && (
//           <button
//             onClick={clearTranscript}
//             className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
//           >
//             Clear
//           </button>
//         )}
//       </div>

//       {transcript && (
//         <div className="mb-3">
//           <p className="text-sm text-gray-300 mb-1">Transcript:</p>
//           <div className="p-3 bg-gray-800 rounded border border-gray-700">
//             <p className="whitespace-pre-wrap">{transcript}</p>
//             {isListening && (
//               <div className="flex items-center mt-2 text-xs text-green-400">
//                 <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
//                 Listening... (will auto-send after 4 seconds of silence)
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {loading && (
//         <p className="text-yellow-400 mt-2">Analyzing your stats...</p>
//       )}

//       {analysis && (
//         <div className="mt-4 space-y-3">
//           <h3 className="text-lg font-bold text-blue-300">✅ Summary</h3>
//           <p>{analysis.summary}</p>

//           {analysis.topTips && analysis.topTips.length > 0 && (
//             <>
//               <h4 className="font-semibold text-green-400">🎯 Top Tips</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.topTips.map((tip, index) => (
//                   <li key={index}>{tip}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {analysis.trainingDrills && analysis.trainingDrills.length > 0 && (
//             <>
//               <h4 className="font-semibold text-purple-400">🏋️ Training Drills</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.trainingDrills.map((drill, index) => (
//                   <li key={index}>{drill}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {(analysis.rating !== null || analysis.confidence !== null) && (
//             <div className="mt-3 flex gap-4 text-sm">
//               {analysis.rating !== null && (
//                 <span>⭐ Rating: {analysis.rating}/10</span>
//               )}
//               {analysis.confidence !== null && (
//                 <span>📊 Confidence: {(analysis.confidence * 100).toFixed(0)}%</span>
//               )}
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default VoiceInput;















// import React, { useState, useRef, useEffect } from "react";
// import axios from "axios";

// interface VoiceInputProps {
//   userToken: string;
//   game: "fifa" | "lol";
// }

// interface AnalysisResponse {
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
// }

// const apiUrl = import.meta.env.VITE_API_BASE_URL!;

// const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
//   const [transcript, setTranscript] = useState<string>("");
//   const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [isListening, setIsListening] = useState(false);
  
//   const recognitionRef = useRef<any>(null);
//   // const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
//   const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


//   useEffect(() => {
//     return () => {
//       // Cleanup on unmount
//       if (silenceTimerRef.current) {
//         clearTimeout(silenceTimerRef.current);
//       }
//       if (recognitionRef.current) {
//         recognitionRef.current.stop();
//       }
//     };
//   }, []);

//   const sendAnalysisRequest = async (text: string) => {
//     if (!text.trim()) return;

//     setLoading(true);
//     try {
//       const response = await axios.post(
//         `${apiUrl}/api/analyze/${game}/`,
//         { stats: text },
//         { headers: { Authorization: `Bearer ${userToken}` } }
//       );
//       setAnalysis(response.data);
//     } catch (err) {
//       console.error("❌ Analysis request failed:", err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const resetSilenceTimer = () => {
//     // Clear existing timer
//     if (silenceTimerRef.current) {
//       clearTimeout(silenceTimerRef.current);
//     }
    
//     // Set new timer for 4 seconds
//     silenceTimerRef.current = setTimeout(() => {
//       if (transcript.trim()) {
//         sendAnalysisRequest(transcript.trim());
//         stopSpeechRecognition();
//       }
//     }, 4000);
//   };

//   const startSpeechRecognition = () => {
//     setTranscript("");
//     setAnalysis(null);
//     setIsListening(true);

//     const recognition = new (window as any).webkitSpeechRecognition();
//     recognitionRef.current = recognition;
    
//     recognition.continuous = true;
//     recognition.interimResults = true;
//     recognition.lang = "en-US";

//     recognition.onresult = (event: any) => {
//       let finalTranscript = "";
//       let interimTranscript = "";

//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         const text = event.results[i][0].transcript;
//         if (event.results[i].isFinal) {
//           finalTranscript += text;
//         } else {
//           interimTranscript += text;
//         }
//       }

//       // Update transcript with both final and interim results
//       const newTranscript = finalTranscript + interimTranscript;
//       setTranscript(newTranscript);

//       // Reset silence timer whenever we get new speech
//       if (newTranscript.trim()) {
//         resetSilenceTimer();
//       }
//     };

//     recognition.onerror = (event: any) => {
//       console.error("Speech recognition error:", event.error);
//       setIsListening(false);
//       setLoading(false);
//     };

//     recognition.onend = () => {
//       setIsListening(false);
//       // If we have transcript but no timer fired, send it now
//       if (transcript.trim() && !loading) {
//         sendAnalysisRequest(transcript.trim());
//       }
//     };

//     recognition.start();
//   };

//   const stopSpeechRecognition = () => {
//     if (recognitionRef.current) {
//       recognitionRef.current.stop();
//     }
//     if (silenceTimerRef.current) {
//       clearTimeout(silenceTimerRef.current);
//     }
//     setIsListening(false);
//   };

//   const handleManualSend = () => {
//     if (transcript.trim()) {
//       stopSpeechRecognition();
//       sendAnalysisRequest(transcript.trim());
//     }
//   };

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white">
//       <div className="flex items-center gap-3 mb-3">
//         <button
//           onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
//           disabled={loading}
//           className={`px-4 py-2 rounded flex items-center gap-2 ${
//             isListening 
//               ? "bg-red-600 hover:bg-red-700" 
//               : "bg-blue-600 hover:bg-blue-700"
//           } disabled:bg-gray-600`}
//         >
//           {isListening ? (
//             <>
//               <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
//               Stop Listening
//             </>
//           ) : (
//             "🎤 Start Speaking"
//           )}
//         </button>

//         {transcript && !loading && (
//           <button
//             onClick={handleManualSend}
//             className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
//           >
//             Send Now
//           </button>
//         )}
//       </div>

//       {transcript && (
//         <div className="mb-3">
//           <p className="text-sm text-gray-300 mb-1">Transcript:</p>
//           <div className="p-3 bg-gray-800 rounded border border-gray-700">
//             <p>{transcript}</p>
//             {isListening && (
//               <div className="flex items-center mt-2 text-xs text-green-400">
//                 <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
//                 Listening... (will auto-send after 4 seconds of silence)
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {loading && (
//         <p className="text-yellow-400 mt-2">Analyzing your stats...</p>
//       )}

//       {analysis && (
//         <div className="mt-4 space-y-3">
//           <h3 className="text-lg font-bold text-blue-300">✅ Summary</h3>
//           <p>{analysis.summary}</p>

//           {analysis.topTips && analysis.topTips.length > 0 && (
//             <>
//               <h4 className="font-semibold text-green-400">🎯 Top Tips</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.topTips.map((tip, index) => (
//                   <li key={index}>{tip}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {analysis.trainingDrills && analysis.trainingDrills.length > 0 && (
//             <>
//               <h4 className="font-semibold text-purple-400">🏋️ Training Drills</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.trainingDrills.map((drill, index) => (
//                   <li key={index}>{drill}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {(analysis.rating !== null || analysis.confidence !== null) && (
//             <div className="mt-3 flex gap-4 text-sm">
//               {analysis.rating !== null && (
//                 <span>⭐ Rating: {analysis.rating}/10</span>
//               )}
//               {analysis.confidence !== null && (
//                 <span>📊 Confidence: {(analysis.confidence * 100).toFixed(0)}%</span>
//               )}
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default VoiceInput;










// import React, { useState } from "react";
// import axios from "axios";

// interface VoiceInputProps {
//   userToken: string;
//   game: "fifa" | "lol";
// }

// interface AnalysisResponse {
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
// }

// const apiUrl = import.meta.env.VITE_API_BASE_URL!;

// const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
//   const [transcript, setTranscript] = useState<string>("");
//   const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
//   const [loading, setLoading] = useState(false);

//   const startSpeechRecognition = () => {
//     setLoading(true);
//     setAnalysis(null);

//     const recognition = new (window as any).webkitSpeechRecognition();
//     recognition.lang = "en-US";
//     recognition.interimResults = false;

//     recognition.onresult = async (event: any) => {
//       const text = event.results[0][0].transcript;
//       setTranscript(text);

//       try {
//         const response = await axios.post(
//           `${apiUrl}/api/analyze/${game}/`,
//           { stats: text },
//           { headers: { Authorization: `Bearer ${userToken}` } }
//         );

//         setAnalysis(response.data);
//       } catch (err) {
//         console.error("❌ Analysis request failed:", err);
//       } finally {
//         setLoading(false);
//       }
//     };

//     recognition.onerror = () => {
//       setLoading(false);
//     };

//     recognition.start();
//   };

//   return (
//     <div className="p-4 bg-gray-900 rounded-xl text-white">
//       <button
//         onClick={startSpeechRecognition}
//         className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded mb-2"
//       >
//         🎤 Start Speaking
//       </button>

//       <p className="text-sm text-gray-300">Transcript: {transcript}</p>

//       {loading && <p className="text-yellow-400 mt-2">Analyzing your stats...</p>}

//       {analysis && (
//         <div className="mt-4 space-y-3">
//           <h3 className="text-lg font-bold text-blue-300">✅ Summary</h3>
//           <p>{analysis.summary}</p>

//           {analysis.topTips.length > 0 && (
//             <>
//               <h4 className="font-semibold text-green-400">🎯 Top Tips</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.topTips.map((tip, index) => (
//                   <li key={index}>{tip}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {analysis.trainingDrills.length > 0 && (
//             <>
//               <h4 className="font-semibold text-purple-400">🏋️ Training Drills</h4>
//               <ul className="list-disc ml-6 text-sm space-y-1">
//                 {analysis.trainingDrills.map((drill, index) => (
//                   <li key={index}>{drill}</li>
//                 ))}
//               </ul>
//             </>
//           )}

//           {(analysis.rating !== null || analysis.confidence !== null) && (
//             <div className="mt-3 flex gap-4 text-sm">
//               {analysis.rating !== null && (
//                 <span>⭐ Rating: {analysis.rating}/10</span>
//               )}
//               {analysis.confidence !== null && (
//                 <span>📊 Confidence: {(analysis.confidence * 100).toFixed(0)}%</span>
//               )}
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default VoiceInput;










// // VoiceInput.tsx
// import React, { useState } from "react";
// import axios from "axios";

// interface VoiceInputProps {
//   userToken: string;
//   game: "fifa" | "lol";
// }

// const apiUrl = import.meta.env.VITE_API_BASE_URL!;


// const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
//   const [transcript, setTranscript] = useState<string>("");
//   const [resultAudio, setResultAudio] = useState<string | null>(null);

//   const startSpeechRecognition = () => {
//     const recognition = new (window as any).webkitSpeechRecognition();
//     recognition.lang = "en-US";
//     recognition.interimResults = false;

//     recognition.onresult = async (event: any) => {
//       const text = event.results[0][0].transcript;
//       setTranscript(text);

//       try {
//         const response = await axios.post(
//           `${apiUrl}/api/analyze/${game}/`,
//           { stats: text }, 
//           { headers: { Authorization: `Bearer ${userToken}` } }
//         );



// console.log(response.data.summary);
// alert("AI says: " + response.data.summary);

//         // const audioBlob = new Blob([response.data.audio], { type: "audio/mp3" });
//         // const audioUrl = URL.createObjectURL(audioBlob);
//         // setResultAudio(audioUrl);
//         // new Audio(audioUrl).play();
//       } catch (error) {
//         console.error("Failed to get analysis:", error);
//       }
//     };

//     recognition.start();
//   };

//   return (
//     <div>
//       <button onClick={startSpeechRecognition}>Start Speaking</button>
//       <p>Transcript: {transcript}</p>
//       {resultAudio && <audio src={resultAudio} controls />}
//     </div>
//   );
// };

// export default VoiceInput;












// // VoiceInput.tsx
// import { useState } from "react";
// import { signInWithGoogle } from "../firebase/firebaseClient";
// import axios from "axios";

// interface SpeechRecognitionEvent {
//   results: {
//     0: {
//       0: {
//         transcript: string;
//       };
//     };
//   };
// }

// interface VoiceInputProps {
//   userToken: string;
//   game: "fifa" | "lol";
// }



// export default function VoiceInput() {
//   const [transcript, setTranscript] = useState<string>("");
//   const [resultAudio, setResultAudio] = useState<string | null>(null);
//   const [userToken, setUserToken] = useState<string>("");

//   const handleLogin = async () => {
//     try {
//       const { user, token } = await signInWithGoogle();
//       setUserToken(token);
//       console.log("Logged in user:", user.displayName);
//     } catch (err) {
//       console.error("Google login failed", err);
//     }
//   };

//   const startSpeechRecognition = () => {
//     const SpeechRecognition =
//       (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
//     if (!SpeechRecognition) {
//       alert("Speech Recognition not supported in this browser");
//       return;
//     }

//     const recognition: InstanceType<typeof SpeechRecognition> = new SpeechRecognition();
//     recognition.lang = "en-US";
//     recognition.interimResults = false;

//     recognition.onresult = async (event: SpeechRecognitionEvent) => {
//       const text = event.results[0][0].transcript;
//       setTranscript(text);

//       if (!userToken) {
//         alert("Please login first!");
//         return;
//       }

//       try {
//         const response = await axios.post(
//           "/api/analyze/fifa/",
//           { stats: text }, // adjust to match gemini_service format
//           { headers: { Authorization: `Bearer ${userToken}` } }
//         );

//         const audioBlob = new Blob([response.data.audio], { type: "audio/mp3" });
//         const audioUrl = URL.createObjectURL(audioBlob);
//         setResultAudio(audioUrl);
//         new Audio(audioUrl).play();
//       } catch (err) {
//         console.error("Error sending speech to backend", err);
//       }
//     };

//     recognition.start();
//   };

//   return (
//     <div>
//       <button onClick={handleLogin}>Login with Google</button>
//       <button onClick={startSpeechRecognition}>Start Speaking</button>
//       <p>Transcript: {transcript}</p>
//       {resultAudio && <audio src={resultAudio} controls />}
//     </div>
//   );
// }
