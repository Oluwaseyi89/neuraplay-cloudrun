import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Ear, EarOff, RefreshCw, Volume2, VolumeX } from "lucide-react";

type GameType = "fifa" | "lol";

interface Props {
  userToken: string;
  initialGame?: GameType;
  onAnalysis?: (data: any) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// Game-specific wake phrases
const FIFA_WAKE_PHRASES = [
  "hey fifa", "fifa", "fee fa", "vyfa", "vifa", "ea fc", "ea football", "hey ea"
];

const LOL_WAKE_PHRASES = [
  "hey lol", "lol", "league", "league of legends", "lowl", "hey league", "hey legends"
];

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
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [enableTTS, setEnableTTS] = useState(true);

  // Refs
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
  const streamRef = useRef<MediaStream | null>(null);

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
    
    shouldUseContinuousRecording: () => {
      return platformType === 'desktop';
    },

    // TTS fallback strategy
    shouldUseClientTTS: () => {
      return platformType === 'mobile' || !enableTTS;
    }
  };

  const getCurrentWakePhrases = (): string[] => {
    return game === "fifa" ? FIFA_WAKE_PHRASES : LOL_WAKE_PHRASES;
  };

  const getWakeStatusMessage = (): string => {
    const phrases = getCurrentWakePhrases();
    const mainPhrase = phrases[0];
    return `Say '${mainPhrase}'`;
  };

  const getPlatformInfo = (): string => {
    return `${platformType}-${browserType}`;
  };

  // HTTP Processing for Mobile/Tablet
  const processVoiceViaHTTP = async (audioBlob: Blob): Promise<void> => {
    setStatus("Processing...");
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('game', game);

      console.log(`📤 Sending audio via HTTP: ${audioBlob.size} bytes`);

      const response = await fetch(`${API_BASE}/api/process-voice-input/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      
      if (data.transcript) {
        console.log(`✅ Transcript received: "${data.transcript}"`);
        setTranscript(data.transcript);
      }

      if (data.analysis) {
        console.log("✅ Analysis received:", data.analysis);
        onAnalysis?.(data.analysis);
        setStatus("Analysis received");
        
        // Handle TTS
        if (data.tts_audio && enableTTS) {
          setStatus("Playing response...");
          try {
            await playBase64Audio(data.tts_audio);
            setStatus("Response complete");
          } catch (ttsError) {
            console.warn("TTS playback failed:", ttsError);
            setStatus("Analysis complete");
          }
        } else {
          setStatus("Analysis complete");
        }
      }

    } catch (error) {
      console.error("❌ HTTP processing failed:", error);
      setStatus("Processing failed - try again");
    }
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
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;

      const ttsTimeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        reject(new Error('TTS timeout'));
      }, 10000);

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

  // WebSocket connection - ONLY for Desktop
  useEffect(() => {
    // Skip WebSocket setup if using HTTP (mobile/tablet)
    if (shouldUseHTTP) {
      console.log("🔄 HTTP Mode: WebSocket disabled");
      setIsConnected(false);
      return;
    }

    if (!userToken) return;

    const setupWebSocket = () => {
      const wsUrl = API_BASE.replace('https', 'wss') + '/ws/voice-analysis/';
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log(`WebSocket connected on ${getPlatformInfo()}`);
        setIsConnected(true);
        ws.current?.send(JSON.stringify({ type: 'auth', token: userToken }));
        setStatus("Ready");
      };

      ws.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        if (data.status === 'authenticated') {
          setStatus("Ready");
        }

        if (data.transcript) {
          setTranscript(data.transcript);
          setStatus("Analyzing...");
        }

        if (data.analysis) {
          console.log("Analysis received:", data.analysis);
          onAnalysis?.(data.analysis);
          setStatus("Analysis received");

          // Handle TTS with fallback strategy
          await handleTTSResponse(data);
        }

        if (data.error && !data.error.includes('TTS failed')) {
          setStatus("Error: " + data.error);
        }
      };

      ws.current.onclose = (event) => {
        console.log(`WebSocket disconnected on ${getPlatformInfo()}:`, event.code, event.reason);
        setIsConnected(false);
        setStatus("Disconnected");
        
        if (!event.wasClean && userToken) {
          setTimeout(() => {
            setupWebSocket();
          }, 2000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus("Connection error");
      };
    };

    const handleTTSResponse = async (data: any) => {
      const analysisText = data.analysis?.summary || "Analysis complete.";
      
      if (data.tts_audio && enableTTS) {
        setStatus("Playing response...");
        try {
          await playBase64Audio(data.tts_audio);
          setStatus("Response complete");
          restartWakeEngine();
          return;
        } catch (serverTtsError) {
          console.warn("Server TTS failed, trying fallback:", serverTtsError);
        }
      }

      if (platformConfig.supportsTTS && platformConfig.shouldUseClientTTS()) {
        setStatus("Generating voice response...");
        try {
          await speakText(analysisText);
          setStatus("Response complete");
          restartWakeEngine();
          return;
        } catch (clientTtsError) {
          console.warn("Client TTS also failed:", clientTtsError);
        }
      }

      setStatus("Analysis complete");
      restartWakeEngine();
    };

    const restartWakeEngine = () => {
      if (wakeActive && !listening) {
        setTimeout(() => {
          setStatus(getWakeStatusMessage());
          startWakeEngine();
        }, platformConfig.isMobile ? 800 : 500);
      }
    };

    setupWebSocket();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (platformConfig.supportsTTS) {
        window.speechSynthesis.cancel();
      }
    };
  }, [userToken, onAnalysis, enableTTS, shouldUseHTTP]);

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

  const initializeMicrophone = async (): Promise<boolean> => {
    try {
      setStatus("Requesting microphone...");
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const constraints = platformConfig.getAudioConstraints();
      
      console.log(`Initializing microphone for ${getPlatformInfo()} with constraints:`, constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
        .catch(async (err) => {
          console.warn("Primary constraints failed, trying fallback:", err);
          return await navigator.mediaDevices.getUserMedia({ audio: true });
        });
      
      streamRef.current = stream;
      setMicPermission("granted");
      setStatus("Microphone ready");
      
      const mimeType = platformConfig.getMimeType();
      const testRecorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      
      return new Promise((resolve) => {
        testRecorder.onstart = () => {
          testRecorder.stop();
          resolve(true);
        };
        testRecorder.onerror = () => {
          console.warn("Test recorder failed, but continuing anyway");
          resolve(true);
        };
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
      
      const mimeType = platformConfig.getMimeType();
      
      mediaRecorder.current = mimeType 
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          
          // Only send to WebSocket if in WebSocket mode (desktop)
          if (!shouldUseHTTP && ws.current?.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              (ws.current as any).send(JSON.stringify({
                type: 'audio_chunk',
                audio_base64: base64
              }));
            };
            reader.readAsDataURL(event.data);
          }
        }
      };

      // Handle HTTP processing when recording stops (mobile/tablet)
      mediaRecorder.current.onstop = async () => {
        if (shouldUseHTTP && audioChunks.current.length > 0) {
          const audioBlob = new Blob(audioChunks.current, { 
            type: mediaRecorder.current?.mimeType || 'audio/webm' 
          });
          await processVoiceViaHTTP(audioBlob);
        }
      };
      
      const interval = platformConfig.getRecordingInterval();
      mediaRecorder.current.start(interval);
      
      console.log(`Started recording with ${interval}ms interval on ${getPlatformInfo()}`);
      return true;
      
    } catch (err) {
      console.error("Audio recording failed:", err);
      setStatus("Recording failed");
      return false;
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      
      // Only send speech_end to WebSocket if in WebSocket mode (desktop)
      if (!shouldUseHTTP && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'speech_end',
          game: game
        }));
      }
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
      const finalText = finalBuffer.current.trim();
      stopMainRecognition(Boolean(finalText));
    }, timeout);
  };

  const startMainRecognition = async () => {
    if (listening) return;
    
    // HTTP Mode (mobile/tablet): Simple recording
    if (shouldUseHTTP) {
      const recordingStarted = await startAudioRecording();
      if (!recordingStarted) {
        setStatus("Failed to start recording");
        return;
      }
      setListening(true);
      setStatus("Recording... Speak now");
      return;
    }

    // WebSocket Mode (desktop): Original flow with wake word
    if (!isConnected) {
      setStatus("Not connected");
      return;
    }

    safeStop(wakeRec.current);
    wakeRec.current = null;

    finalBuffer.current = "";
    setTranscript("");
    setStatus("Starting...");

    const recordingStarted = await startAudioRecording();
    if (!recordingStarted) {
      setStatus("Failed to start");
      return;
    }

    setListening(true);

    if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const rec = new SpeechRecognition();
      mainRec.current = rec;

      rec.continuous = platformConfig.shouldUseContinuousRecording();
      rec.interimResults = true;
      rec.lang = "en-US";

      if (platformConfig.isMobile) {
        rec.continuous = true;
      }

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
        if (!platformConfig.isMobile || !listening) {
          stopMainRecognition(true);
        }
      };

      try {
        rec.start();
        setStatus("Listening...");
      } catch (err) {
        console.error("Failed to start recognition:", err);
        setStatus("Recording...");
      }
    } else {
      setStatus("Recording...");
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
      if (wakeActive && !shouldUseHTTP) {
        const restartDelay = platformConfig.isMobile ? 500 : 300;
        setTimeout(() => startWakeEngine(), restartDelay);
      } else {
        setStatus("Ready");
      }
    }
  };

  const detectWakeIntent = (textRaw: string): boolean => {
    if (!textRaw) return false;
    const text = textRaw.toLowerCase().trim();

    const currentPhrases = getCurrentWakePhrases();
    
    const similarityThreshold = platformConfig.getWakeSimilarityThreshold();
    
    for (const phrase of currentPhrases) {
      if (similarity(text, phrase) >= similarityThreshold) return true;
      
      if (platformConfig.isMobile) {
        const words = text.split(' ');
        const phraseWords = phrase.split(' ');
        
        if (phraseWords.some(word => words.includes(word))) {
          return true;
        }
        
        if (game === "fifa") {
          if (text.includes("fifa") || text.includes("fee fa") || text.includes("vyfa") || text.includes("vifa") || text.includes("fiver")) {
            return true;
          }
        }
        if (game === "lol") {
          if (text.includes("lol") || text.includes("lowl") || text.includes("lole") || text.includes("lawl")) {
            return true;
          }
        }
      }
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
    // No wake word for HTTP mode (mobile/tablet)
    if (shouldUseHTTP) return;
    
    if (wakeRec.current || listening || !isConnected) return;
    if (!("webkitSpeechRecognition" in window || (window as any).SpeechRecognition)) {
      setStatus("Wake not supported");
      return;
    }
    if (micPermission === "denied") {
      setStatus("Microphone denied");
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

      if (platformConfig.isMobile) {
        rec.continuous = true;
      }

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

        setStatus("Wake detected");

        const processingDelay = platformConfig.isMobile ? 400 : 300;
        setTimeout(() => {
          processingWake.current = false;
          startMainRecognition();
        }, processingDelay);
      };

      rec.onerror = (ev: any) => {
        console.warn("Wake engine error:", ev?.error);
        safeStop(rec);
        wakeRec.current = null;

        if (ev?.error === "not-allowed") {
          setMicPermission("denied");
          setWakeActive(false);
          setStatus("Mic denied");
          return;
        }

        const baseBackoff = platformConfig.isMobile ? 800 : 500;
        const backoff = Math.min(wakeBackoff.current, baseBackoff * 2);
        restartWakeTimer.current = setTimeout(() => {
          wakeBackoff.current = Math.min(baseBackoff * 2, wakeBackoff.current * 1.5);
          if (wakeActive && !listening) startWakeEngine();
        }, backoff);
      };

      rec.onend = () => {
        wakeRec.current = null;
        if (wakeActive && !listening) {
          const backoff = Math.min(wakeBackoff.current, platformConfig.isMobile ? 1000 : 500);
          restartWakeTimer.current = setTimeout(() => {
            if (wakeActive && !listening) startWakeEngine();
          }, backoff);
        }
      };

      rec.start();
      setStatus(getWakeStatusMessage());
      wakeBackoff.current = platformConfig.isMobile ? 800 : 500;
    } catch (err) {
      console.error("Failed to start wake engine:", err);
      setStatus("Wake failed");
      wakeRec.current = null;
      if (wakeActive && !listening) {
        const retryDelay = platformConfig.isMobile ? 1500 : 1200;
        restartWakeTimer.current = setTimeout(() => startWakeEngine(), retryDelay);
      }
    }
  };

  const stopWakeEngine = () => {
    safeStop(wakeRec.current);
    wakeRec.current = null;
    setStatus("Wake disabled");
  };

  const toggleWake = () => {
    // No wake word for HTTP mode (mobile/tablet)
    if (shouldUseHTTP) {
      setStatus("Wake word not available on mobile");
      return;
    }
    
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

  const toggleTTS = () => {
    setEnableTTS(!enableTTS);
    setStatus(enableTTS ? "Voice responses disabled" : "Voice responses enabled");
  };

  const handleGameSwitch = (newGame: GameType) => {
    setGame(newGame);
    if (wakeActive && !listening && !shouldUseHTTP) {
      safeStop(wakeRec.current);
      const switchDelay = platformConfig.isMobile ? 400 : 300;
      setTimeout(() => {
        setStatus(getWakeStatusMessage());
        startWakeEngine();
      }, switchDelay);
    }
  };

  const handleMicClick = () => {
    if (listening) {
      stopMainRecognition(true);
    } else {
      startMainRecognition();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!listening) {
      startMainRecognition();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (listening) {
      stopMainRecognition(true);
    }
  };

  const handleResetMicrophone = async () => {
    setStatus("Resetting...");
    
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
    
    await initializeMicrophone();
    
    if (wakeActive && !listening && !shouldUseHTTP) {
      const resetDelay = platformConfig.isMobile ? 800 : 500;
      setTimeout(() => {
        setStatus(getWakeStatusMessage());
        startWakeEngine();
      }, resetDelay);
    } else {
      setStatus("Ready");
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    finalBuffer.current = "";
  };

  useEffect(() => {
    const initialize = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;
      setIsInitializing(true);

      setStatus("Initializing...");
      
      await initializeMicrophone();
      
      // HTTP Mode (mobile/tablet): Simple ready status
      if (shouldUseHTTP) {
        setStatus("Ready - Press mic to speak");
        setIsInitializing(false);
        return;
      }
      
      // WebSocket Mode (desktop): Use wake engine
      if (isConnected && wakeActive && micPermission === "granted") {
        setStatus("Starting wake...");
        const initDelay = platformConfig.isMobile ? 600 : 400;
        setTimeout(() => {
          startWakeEngine();
        }, initDelay);
      } else if (micPermission === "denied") {
        setStatus("Microphone required");
        setWakeActive(false);
      }
      
      setIsInitializing(false);
    };

    if (isConnected || shouldUseHTTP) {
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
      if (platformConfig.supportsTTS) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isConnected, shouldUseHTTP]);

  useEffect(() => {
    if (wakeActive && !listening && !shouldUseHTTP) {
      setStatus(getWakeStatusMessage());
    }
  }, [game, shouldUseHTTP]);

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
            disabled={!platformConfig.supportsTTS}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              enableTTS ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            } ${!platformConfig.supportsTTS ? "opacity-50 cursor-not-allowed" : ""}`}
            title={enableTTS ? "Disable voice responses" : "Enable voice responses"}
          >
            {enableTTS ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {enableTTS ? "Voice On" : "Voice Off"}
          </button>

          <button
            onClick={toggleWake}
            disabled={micPermission === "denied" || !isConnected || isInitializing || shouldUseHTTP}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
            } ${(micPermission === "denied" || !isConnected || isInitializing || shouldUseHTTP) ? "opacity-50 cursor-not-allowed" : ""}`}
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
          {transcript && !shouldUseHTTP && (
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
            ⓘ Voice responses not supported on this browser
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInput;




















// import React, { useEffect, useRef, useState } from "react";
// import { Mic, Square, Ear, EarOff, RefreshCw, Volume2, VolumeX } from "lucide-react";

// type GameType = "fifa" | "lol";

// interface Props {
//   userToken: string;
//   initialGame?: GameType;
//   onAnalysis?: (data: any) => void;
// }

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// // Game-specific wake phrases
// const FIFA_WAKE_PHRASES = [
//   "hey fifa", "fifa", "fee fa", "vyfa", "vifa", "ea fc", "ea football", "hey ea"
// ];

// const LOL_WAKE_PHRASES = [
//   "hey lol", "lol", "league", "league of legends", "lowl", "hey league", "hey legends"
// ];

// // Platform detection utilities
// const getPlatformType = (): 'mobile' | 'desktop' | 'tablet' => {
//   const userAgent = navigator.userAgent.toLowerCase();
//   const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
//   const isTablet = /ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP)))/i.test(userAgent);
  
//   if (isMobile) return 'mobile';
//   if (isTablet) return 'tablet';
//   return 'desktop';
// };

// const isAndroidChrome = (): boolean => {
//   return /android.*chrome\/[.0-9]*/i.test(navigator.userAgent);
// };

// const isIOS = (): boolean => {
//   return /iphone|ipad|ipod/i.test(navigator.userAgent);
// };

// const getBrowserType = (): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' => {
//   const userAgent = navigator.userAgent;
//   if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'chrome';
//   if (userAgent.includes('Firefox')) return 'firefox';
//   if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'safari';
//   if (userAgent.includes('Edg')) return 'edge';
//   return 'other';
// };

// // Check if browser supports SpeechSynthesis API
// const supportsSpeechSynthesis = (): boolean => {
//   return 'speechSynthesis' in window;
// };

// // Levenshtein distance utility
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

// const VoiceInput: React.FC<Props> = ({ userToken, initialGame = "fifa", onAnalysis }) => {
//   const [game, setGame] = useState<GameType>(initialGame);
//   const [listening, setListening] = useState(false);
//   const [wakeActive, setWakeActive] = useState(true);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
//   const [isConnected, setIsConnected] = useState(false);
//   const [isInitializing, setIsInitializing] = useState(true);
//   const [enableTTS, setEnableTTS] = useState(true);

//   // Refs
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
//   const streamRef = useRef<MediaStream | null>(null);

//   // Platform-specific configuration
//   const platformType = getPlatformType();
//   const browserType = getBrowserType();
//   const isAndroid = isAndroidChrome();
//   const isApple = isIOS();
//   const supportsTTS = supportsSpeechSynthesis();

//   const platformConfig = {
//     isMobile: platformType === 'mobile',
//     isDesktop: platformType === 'desktop',
//     isTablet: platformType === 'tablet',
//     isAndroidChrome: isAndroid,
//     isIOS: isApple,
//     browser: browserType,
//     supportsTTS: supportsTTS,
    
//     // Platform-specific settings
//     getAudioConstraints: () => {
//       if (platformType === 'mobile') {
//         if (isAndroid) {
//           return {
//             audio: {
//               echoCancellation: true,
//               noiseSuppression: false,
//               autoGainControl: false,
//             }
//           };
//         } else if (isApple) {
//           return {
//             audio: {
//               echoCancellation: true,
//               noiseSuppression: true,
//             }
//           };
//         }
//       }
      
//       return {
//         audio: {
//           sampleRate: 16000,
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true,
//           autoGainControl: true
//         }
//       };
//     },
    
//     getRecordingInterval: () => {
//       return platformType === 'mobile' ? 250 : 100;
//     },
    
//     getSilenceTimeout: () => {
//       return platformType === 'mobile' ? 6000 : 4000;
//     },
    
//     getWakeSimilarityThreshold: () => {
//       return platformType === 'mobile' ? 0.55 : 0.65;
//     },
    
//     getMimeType: (): string => {
//       if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
//         return 'audio/webm;codecs=opus';
//       } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
//         return 'audio/mp4';
//       } else if (MediaRecorder.isTypeSupported('audio/webm')) {
//         return 'audio/webm';
//       }
//       return '';
//     },
    
//     shouldUseContinuousRecording: () => {
//       return platformType === 'desktop';
//     },

//     // TTS fallback strategy
//     shouldUseClientTTS: () => {
//       // Use client-side TTS as fallback on mobile or when server TTS fails
//       return platformType === 'mobile' || !enableTTS;
//     }
//   };

//   const getCurrentWakePhrases = (): string[] => {
//     return game === "fifa" ? FIFA_WAKE_PHRASES : LOL_WAKE_PHRASES;
//   };

//   const getWakeStatusMessage = (): string => {
//     const phrases = getCurrentWakePhrases();
//     const mainPhrase = phrases[0];
//     return `Say '${mainPhrase}'`;
//   };

//   const getPlatformInfo = (): string => {
//     return `${platformType}-${browserType}`;
//   };

//   // Client-side TTS as fallback
//   const speakText = (text: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       if (!platformConfig.supportsTTS) {
//         reject(new Error('Speech synthesis not supported'));
//         return;
//       }

//       // Cancel any ongoing speech
//       window.speechSynthesis.cancel();

//       const utterance = new SpeechSynthesisUtterance(text);
//       utterance.rate = 0.8;
//       utterance.pitch = 1;
//       utterance.volume = 1;

//       utterance.onend = () => {
//         console.log("Client TTS finished");
//         resolve();
//       };

//       utterance.onerror = (event) => {
//         console.error("Client TTS error:", event);
//         reject(new Error('Client TTS failed'));
//       };

//       // Add a timeout for TTS
//       const ttsTimeout = setTimeout(() => {
//         window.speechSynthesis.cancel();
//         reject(new Error('TTS timeout'));
//       }, 10000);

//       utterance.onend = () => {
//         clearTimeout(ttsTimeout);
//         resolve();
//       };

//       utterance.onerror = () => {
//         clearTimeout(ttsTimeout);
//         reject(new Error('TTS failed'));
//       };

//       window.speechSynthesis.speak(utterance);
//     });
//   };

//   // Enhanced WebSocket connection with TTS fallback
//   useEffect(() => {
//     if (!userToken) return;

//     const setupWebSocket = () => {
//       const wsUrl = API_BASE.replace('https', 'wss') + '/ws/voice-analysis/';
//       ws.current = new WebSocket(wsUrl);

//       ws.current.onopen = () => {
//         console.log(`WebSocket connected on ${getPlatformInfo()}`);
//         setIsConnected(true);
//         ws.current?.send(JSON.stringify({ type: 'auth', token: userToken }));
//         setStatus("Ready");
//       };

//       ws.current.onmessage = async (event) => {
//         const data = JSON.parse(event.data);
//         console.log('WebSocket message:', data);

//         if (data.status === 'authenticated') {
//           setStatus("Ready");
//         }

//         if (data.transcript) {
//           setTranscript(data.transcript);
//           setStatus("Analyzing...");
//         }

//         if (data.analysis) {
//           console.log("Analysis received:", data.analysis);
//           onAnalysis?.(data.analysis);
//           setStatus("Analysis received");

//           // Handle TTS with robust fallback strategy
//           await handleTTSResponse(data);
//         }

//         if (data.error) {
//           console.error("WebSocket error:", data.error);
//           // Don't show TTS errors to user - they're non-critical
//           if (!data.error.includes('TTS failed')) {
//             setStatus("Error: " + data.error);
//           }
//         }
//       };

//       ws.current.onclose = (event) => {
//         console.log(`WebSocket disconnected on ${getPlatformInfo()}:`, event.code, event.reason);
//         setIsConnected(false);
//         setStatus("Disconnected");
        
//         if (!event.wasClean && userToken) {
//           const reconnectDelay = platformConfig.isMobile ? 3000 : 2000;
//           setTimeout(() => {
//             setupWebSocket();
//           }, reconnectDelay);
//         }
//       };

//       ws.current.onerror = (error) => {
//         console.error('WebSocket error:', error);
//         setStatus("Connection error");
//       };
//     };

//     const handleTTSResponse = async (data: any) => {
//       const analysisText = data.analysis?.summary || "Analysis complete.";
      
//       // Strategy 1: Try server TTS if available and enabled
//       if (data.tts_audio && enableTTS) {
//         setStatus("Playing response...");
//         try {
//           await playBase64Audio(data.tts_audio);
//           setStatus("Response complete");
//           restartWakeEngine();
//           return;
//         } catch (serverTtsError) {
//           console.warn("Server TTS failed, trying fallback:", serverTtsError);
//           // Continue to fallback
//         }
//       }

//       // Strategy 2: Try client TTS as fallback
//       if (platformConfig.supportsTTS && platformConfig.shouldUseClientTTS()) {
//         setStatus("Generating voice response...");
//         try {
//           await speakText(analysisText);
//           setStatus("Response complete");
//           restartWakeEngine();
//           return;
//         } catch (clientTtsError) {
//           console.warn("Client TTS also failed:", clientTtsError);
//           // Continue to silent mode
//         }
//       }

//       // Strategy 3: Silent mode - just show analysis
//       setStatus("Analysis complete");
//       restartWakeEngine();
//     };

//     const restartWakeEngine = () => {
//       if (wakeActive && !listening) {
//         setTimeout(() => {
//           setStatus(getWakeStatusMessage());
//           startWakeEngine();
//         }, platformConfig.isMobile ? 800 : 500);
//       }
//     };

//     setupWebSocket();

//     return () => {
//       if (ws.current) {
//         ws.current.close();
//       }
//       // Clean up any ongoing TTS
//       if (platformConfig.supportsTTS) {
//         window.speechSynthesis.cancel();
//       }
//     };
//   }, [userToken, onAnalysis, enableTTS]);

//   const playBase64Audio = (base64Data: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       try {
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
//             if (platformConfig.isMobile) {
//               resolve(); // Silent fail on mobile
//             } else {
//               reject(err);
//             }
//           });
//         }
//       } catch (err) {
//         reject(err);
//       }
//     });
//   };

//   const initializeMicrophone = async (): Promise<boolean> => {
//     try {
//       setStatus("Requesting microphone...");
      
//       if (streamRef.current) {
//         streamRef.current.getTracks().forEach(track => track.stop());
//         streamRef.current = null;
//       }

//       const constraints = platformConfig.getAudioConstraints();
      
//       console.log(`Initializing microphone for ${getPlatformInfo()} with constraints:`, constraints);

//       const stream = await navigator.mediaDevices.getUserMedia(constraints)
//         .catch(async (err) => {
//           console.warn("Primary constraints failed, trying fallback:", err);
//           return await navigator.mediaDevices.getUserMedia({ audio: true });
//         });
      
//       streamRef.current = stream;
//       setMicPermission("granted");
//       setStatus("Microphone ready");
      
//       const mimeType = platformConfig.getMimeType();
//       const testRecorder = mimeType 
//         ? new MediaRecorder(stream, { mimeType })
//         : new MediaRecorder(stream);
      
//       return new Promise((resolve) => {
//         testRecorder.onstart = () => {
//           testRecorder.stop();
//           resolve(true);
//         };
//         testRecorder.onerror = () => {
//           console.warn("Test recorder failed, but continuing anyway");
//           resolve(true);
//         };
//         testRecorder.start();
//         setTimeout(() => {
//           try { testRecorder.stop(); } catch {}
//           resolve(true);
//         }, 100);
//       });
      
//     } catch (err) {
//       console.error("Microphone initialization failed:", err);
//       setMicPermission("denied");
//       setStatus("Microphone access denied");
//       return false;
//     }
//   };

//   const startAudioRecording = async (): Promise<boolean> => {
//     try {
//       if (!streamRef.current) {
//         const initialized = await initializeMicrophone();
//         if (!initialized) return false;
//       }

//       if (!streamRef.current) {
//         setStatus("Microphone not available");
//         return false;
//       }

//       audioChunks.current = [];
      
//       const mimeType = platformConfig.getMimeType();
      
//       mediaRecorder.current = mimeType 
//         ? new MediaRecorder(streamRef.current, { mimeType })
//         : new MediaRecorder(streamRef.current);
      
//       mediaRecorder.current.ondataavailable = (event) => {
//         if (event.data.size > 0) {
//           audioChunks.current.push(event.data);
          
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
      
//       const interval = platformConfig.getRecordingInterval();
//       mediaRecorder.current.start(interval);
      
//       console.log(`Started recording with ${interval}ms interval on ${getPlatformInfo()}`);
//       return true;
      
//     } catch (err) {
//       console.error("Audio recording failed:", err);
//       setStatus("Recording failed");
//       return false;
//     }
//   };

//   const stopAudioRecording = () => {
//     if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//       mediaRecorder.current.stop();
      
//       if (ws.current?.readyState === WebSocket.OPEN) {
//         ws.current.send(JSON.stringify({
//           type: 'speech_end',
//           game: game
//         }));
//       }
//     }
//   };

//   const safeStop = (rec: any | null) => {
//     if (!rec) return;
//     try {
//       rec.onresult = null;
//       rec.onend = null;
//       rec.onerror = null;
//       rec.stop();
//     } catch {}
//   };

//   const resetSilenceTimer = () => {
//     if (silenceTimer.current) {
//       clearTimeout(silenceTimer.current);
//       silenceTimer.current = null;
//     }
    
//     const timeout = platformConfig.getSilenceTimeout();
//     silenceTimer.current = setTimeout(() => {
//       const finalText = finalBuffer.current.trim();
//       stopMainRecognition(Boolean(finalText));
//     }, timeout);
//   };

//   const startMainRecognition = async () => {
//     if (listening) return;
//     if (!isConnected) {
//       setStatus("Not connected");
//       return;
//     }

//     safeStop(wakeRec.current);
//     wakeRec.current = null;

//     finalBuffer.current = "";
//     setTranscript("");
//     setStatus("Starting...");

//     const recordingStarted = await startAudioRecording();
//     if (!recordingStarted) {
//       setStatus("Failed to start");
//       return;
//     }

//     setListening(true);

//     if ("webkitSpeechRecognition" in window || (window as any).SpeechRecognition) {
//       const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
//       const rec = new SpeechRecognition();
//       mainRec.current = rec;

//       rec.continuous = platformConfig.shouldUseContinuousRecording();
//       rec.interimResults = true;
//       rec.lang = "en-US";

//       if (platformConfig.isMobile) {
//         rec.continuous = true;
//       }

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
//           setStatus("Microphone denied");
//         }
//         stopMainRecognition(false);
//       };

//       rec.onend = () => {
//         if (!platformConfig.isMobile || !listening) {
//           stopMainRecognition(true);
//         }
//       };

//       try {
//         rec.start();
//         setStatus("Listening...");
//       } catch (err) {
//         console.error("Failed to start recognition:", err);
//         setStatus("Recording...");
//       }
//     } else {
//       setStatus("Recording...");
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
//       if (wakeActive) {
//         const restartDelay = platformConfig.isMobile ? 500 : 300;
//         setTimeout(() => startWakeEngine(), restartDelay);
//       } else {
//         setStatus("Ready");
//       }
//     }
//   };

//   const detectWakeIntent = (textRaw: string): boolean => {
//     if (!textRaw) return false;
//     const text = textRaw.toLowerCase().trim();

//     const currentPhrases = getCurrentWakePhrases();
    
//     const similarityThreshold = platformConfig.getWakeSimilarityThreshold();
    
//     for (const phrase of currentPhrases) {
//       if (similarity(text, phrase) >= similarityThreshold) return true;
      
//       if (platformConfig.isMobile) {
//         const words = text.split(' ');
//         const phraseWords = phrase.split(' ');
        
//         if (phraseWords.some(word => words.includes(word))) {
//           return true;
//         }
        
//         if (game === "fifa") {
//           if (text.includes("fifa") || text.includes("fee fa") || text.includes("vyfa") || text.includes("vifa") || text.includes("fiver")) {
//             return true;
//           }
//         }
//         if (game === "lol") {
//           if (text.includes("lol") || text.includes("lowl") || text.includes("lole") || text.includes("lawl")) {
//             return true;
//           }
//         }
//       }
//     }
    
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
//       setStatus("Microphone denied");
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

//       if (platformConfig.isMobile) {
//         rec.continuous = true;
//       }

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

//         setStatus("Wake detected");

//         const processingDelay = platformConfig.isMobile ? 400 : 300;
//         setTimeout(() => {
//           processingWake.current = false;
//           startMainRecognition();
//         }, processingDelay);
//       };

//       rec.onerror = (ev: any) => {
//         console.warn("Wake engine error:", ev?.error);
//         safeStop(rec);
//         wakeRec.current = null;

//         if (ev?.error === "not-allowed") {
//           setMicPermission("denied");
//           setWakeActive(false);
//           setStatus("Mic denied");
//           return;
//         }

//         const baseBackoff = platformConfig.isMobile ? 800 : 500;
//         const backoff = Math.min(wakeBackoff.current, baseBackoff * 2);
//         restartWakeTimer.current = setTimeout(() => {
//           wakeBackoff.current = Math.min(baseBackoff * 2, wakeBackoff.current * 1.5);
//           if (wakeActive && !listening) startWakeEngine();
//         }, backoff);
//       };

//       rec.onend = () => {
//         wakeRec.current = null;
//         if (wakeActive && !listening) {
//           const backoff = Math.min(wakeBackoff.current, platformConfig.isMobile ? 1000 : 500);
//           restartWakeTimer.current = setTimeout(() => {
//             if (wakeActive && !listening) startWakeEngine();
//           }, backoff);
//         }
//       };

//       rec.start();
//       setStatus(getWakeStatusMessage());
//       wakeBackoff.current = platformConfig.isMobile ? 800 : 500;
//     } catch (err) {
//       console.error("Failed to start wake engine:", err);
//       setStatus("Wake failed");
//       wakeRec.current = null;
//       if (wakeActive && !listening) {
//         const retryDelay = platformConfig.isMobile ? 1500 : 1200;
//         restartWakeTimer.current = setTimeout(() => startWakeEngine(), retryDelay);
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

//   const toggleTTS = () => {
//     setEnableTTS(!enableTTS);
//     setStatus(enableTTS ? "Voice responses disabled" : "Voice responses enabled");
//   };

//   const handleGameSwitch = (newGame: GameType) => {
//     setGame(newGame);
//     if (wakeActive && !listening) {
//       safeStop(wakeRec.current);
//       const switchDelay = platformConfig.isMobile ? 400 : 300;
//       setTimeout(() => {
//         setStatus(getWakeStatusMessage());
//         startWakeEngine();
//       }, switchDelay);
//     }
//   };

//   const handleMicClick = () => {
//     if (listening) {
//       stopMainRecognition(true);
//     } else {
//       startMainRecognition();
//     }
//   };

//   const handleTouchStart = (e: React.TouchEvent) => {
//     e.preventDefault();
//     if (!listening) {
//       startMainRecognition();
//     }
//   };

//   const handleTouchEnd = (e: React.TouchEvent) => {
//     e.preventDefault();
//     if (listening) {
//       stopMainRecognition(true);
//     }
//   };

//   const handleResetMicrophone = async () => {
//     setStatus("Resetting...");
    
//     safeStop(mainRec.current);
//     safeStop(wakeRec.current);
//     if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
//       mediaRecorder.current.stop();
//     }
//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach(track => track.stop());
//       streamRef.current = null;
//     }
    
//     setListening(false);
//     setTranscript("");
//     finalBuffer.current = "";
    
//     await initializeMicrophone();
    
//     if (wakeActive && !listening) {
//       const resetDelay = platformConfig.isMobile ? 800 : 500;
//       setTimeout(() => {
//         setStatus(getWakeStatusMessage());
//         startWakeEngine();
//       }, resetDelay);
//     } else {
//       setStatus("Ready");
//     }
//   };

//   const clearTranscript = () => {
//     setTranscript("");
//     finalBuffer.current = "";
//   };

//   useEffect(() => {
//     const initialize = async () => {
//       if (isInitialized.current) return;
//       isInitialized.current = true;
//       setIsInitializing(true);

//       setStatus("Initializing...");
      
//       await initializeMicrophone();
      
//       if (isConnected && wakeActive && micPermission === "granted") {
//         setStatus("Starting wake...");
//         const initDelay = platformConfig.isMobile ? 600 : 400;
//         setTimeout(() => {
//           startWakeEngine();
//         }, initDelay);
//       } else if (micPermission === "denied") {
//         setStatus("Microphone required");
//         setWakeActive(false);
//       }
      
//       setIsInitializing(false);
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
//       if (streamRef.current) {
//         streamRef.current.getTracks().forEach(track => track.stop());
//       }
//       if (silenceTimer.current) clearTimeout(silenceTimer.current);
//       if (restartWakeTimer.current) clearTimeout(restartWakeTimer.current);
//       if (platformConfig.supportsTTS) {
//         window.speechSynthesis.cancel();
//       }
//     };
//   }, [isConnected]);

//   useEffect(() => {
//     if (wakeActive && !listening) {
//       setStatus(getWakeStatusMessage());
//     }
//   }, [game]);

//   return (
//     <div className="p-3 sm:p-4 bg-gray-900 rounded-xl text-white max-w-xl">
//       {/* Header Row */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3">
//         <div className="flex items-center gap-2">
//           <div className="text-sm font-medium">Game: <span className="text-purple-400 uppercase">{game}</span></div>
//           <div className="text-xs text-gray-400">
//             {status} {isConnected ? "🟢" : "🔴"} 
//             <span className="ml-1 text-gray-500">({getPlatformInfo()})</span>
//           </div>
//         </div>

//         {/* Action Buttons */}
//         <div className="flex flex-wrap gap-1 sm:gap-2">
//           <button
//             onClick={handleResetMicrophone}
//             disabled={isInitializing}
//             className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
//             title="Reset microphone"
//           >
//             <RefreshCw size={12} />
//             Reset
//           </button>

//           <button
//             onClick={toggleTTS}
//             disabled={!platformConfig.supportsTTS}
//             className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
//               enableTTS ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             } ${!platformConfig.supportsTTS ? "opacity-50 cursor-not-allowed" : ""}`}
//             title={enableTTS ? "Disable voice responses" : "Enable voice responses"}
//           >
//             {enableTTS ? <Volume2 size={12} /> : <VolumeX size={12} />}
//             {enableTTS ? "Voice On" : "Voice Off"}
//           </button>

//           <button
//             onClick={toggleWake}
//             disabled={micPermission === "denied" || !isConnected || isInitializing}
//             className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
//               wakeActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
//             } ${(micPermission === "denied" || !isConnected || isInitializing) ? "opacity-50 cursor-not-allowed" : ""}`}
//           >
//             {wakeActive ? <Ear size={12} /> : <EarOff size={12} />}
//             {wakeActive ? "Wake On" : "Wake Off"}
//           </button>

//           <button
//             onClick={() => handleGameSwitch(game === "fifa" ? "lol" : "fifa")}
//             className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
//           >
//             Switch
//           </button>
//         </div>
//       </div>

//       {/* Main Controls */}
//       <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
//         {/* Microphone Button with touch support */}
//         <button
//           onTouchStart={handleTouchStart}
//           onTouchEnd={handleTouchEnd}
//           onClick={handleMicClick}
//           disabled={micPermission === "denied" || !isConnected || isInitializing}
//           className={`flex-shrink-0 p-3 sm:p-4 rounded-full transition-all ${
//             listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-purple-600 hover:bg-purple-700"
//           } ${(micPermission === "denied" || !isConnected || isInitializing) ? "opacity-50 cursor-not-allowed" : ""}`}
//         >
//           {listening ? <Square size={18} /> : <Mic size={18} />}
//         </button>

//         {/* Transcript Area */}
//         <div className="flex-1 min-w-0 w-full">
//           <div className="p-3 bg-gray-800 rounded-lg min-h-[60px] w-full">
//             {transcript ? (
//               <div className="break-words">
//                 <div className="text-xs text-gray-300 mb-1">You said:</div>
//                 <div className="text-white text-sm">{transcript}</div>
//               </div>
//             ) : (
//               <div className="text-gray-400 text-xs h-[60px] flex items-center">
//                 {listening ? "🎤 Speak now..." : "Transcript will appear here"}
//               </div>
//             )}
//           </div>

//           {/* Action Buttons */}
//           {transcript && (
//             <div className="flex flex-col sm:flex-row gap-2 mt-2">
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

//       {/* Voice Commands Help */}
//       <div className="mt-3 p-2 sm:p-3 bg-blue-900/10 rounded-lg border border-blue-700/20 text-xs text-blue-200">
//         <div>Voice Commands for {game.toUpperCase()}:</div>
//         <ul className="list-disc ml-3 mt-1 space-y-1">
//           {game === "fifa" ? (
//             <>
//               <li><span className="font-mono">"Hey FIFA"</span> — start analysis</li>
//               <li><span className="font-mono">"FIFA"</span> — start analysis</li>
//               {platformConfig.isMobile && (
//                 <li><span className="font-mono">"Fee Fa"</span> — mobile alternative</li>
//               )}
//             </>
//           ) : (
//             <>
//               <li><span className="font-mono">"Hey LOL"</span> — start analysis</li>
//               <li><span className="font-mono">"LOL"</span> — start analysis</li>
//               {platformConfig.isMobile && (
//                 <li><span className="font-mono">"Lowl"</span> — mobile alternative</li>
//               )}
//             </>
//           )}
//         </ul>
//         {!platformConfig.supportsTTS && (
//           <div className="mt-2 text-yellow-200">
//             ⓘ Voice responses not supported on this browser
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default VoiceInput;
