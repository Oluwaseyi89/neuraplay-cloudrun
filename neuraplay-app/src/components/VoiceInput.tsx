import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

interface VoiceInputProps {
  userToken: string;
  game: "fifa" | "lol";
}

interface AnalysisResponse {
  summary: string;
  topTips: string[];
  trainingDrills: string[];
  rating: number | null;
  confidence: number | null;
}

const apiUrl = import.meta.env.VITE_API_BASE_URL!;

const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
  const [transcript, setTranscript] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAlwaysListening, setIsAlwaysListening] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!("webkitSpeechRecognition" in window)) {
      console.error("Speech recognition not supported");
      return;
    }

    // Start always-listening mode on component mount
    startAlwaysListening();

    return () => {
      isMountedRef.current = false;
      
      // Cleanup all timeouts and recognition
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors during cleanup
        }
      }
    };
  }, []);

  const startAlwaysListening = () => {
    if (!isMountedRef.current || !("webkitSpeechRecognition" in window)) return;
    
    // Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    try {
      // Clean up existing recognition if any
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
      }

      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      // Configure for always-listening (command detection)
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event: any) => {
        if (isListening || !isMountedRef.current) return;
        
        const text = event.results[event.results.length - 1][0].transcript.toLowerCase();
        console.log("Voice command detected:", text);

        // Check for voice commands
        if (text.includes("hey neuraplay") || text.includes("hey neural play")) {
          startActiveRecording();
        } else if (text.includes("hey fifa") && game === "fifa") {
          startActiveRecording();
        } else if ((text.includes("hey lol") || text.includes("hey league")) && game === "lol") {
          startActiveRecording();
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (!isMountedRef.current) return;
        
        console.error("Speech recognition error:", event.error);
        
        // Handle specific errors
        if (event.error === "aborted") {
          // This is normal when switching modes
          scheduleRestart(1000);
        } else if (event.error === "not-allowed") {
          console.error("Microphone access denied");
          setIsAlwaysListening(false);
        } else if (event.error !== "no-speech") {
          // For other errors, try to restart after a delay
          scheduleRestart(2000);
        }
      };

      recognitionRef.current.onend = () => {
        if (!isMountedRef.current) return;
        
        console.log("Always-listening ended");
        setIsAlwaysListening(false);
        
        // Only restart if we're not in active listening mode and component is still mounted
        if (!isListening && isMountedRef.current) {
          scheduleRestart(1000);
        }
      };

      recognitionRef.current.start();
      setIsAlwaysListening(true);
      console.log("Always-listening mode started");
      
    } catch (error) {
      console.error("Failed to start always-listening:", error);
      setIsAlwaysListening(false);
      
      if (isMountedRef.current) {
        scheduleRestart(2000);
      }
    }
  };

  const scheduleRestart = (delay: number) => {
    if (!isMountedRef.current) return;
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    
    restartTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && !isListening) {
        startAlwaysListening();
      }
    }, delay);
  };

  const startActiveRecording = () => {
    if (isListening || !recognitionRef.current || !isMountedRef.current) return;

    console.log("Starting active recording mode");
    
    // Stop the current recognition
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // Ignore stop errors
    }

    // Clear any pending restarts
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    // Reset states
    setTranscript("");
    setAnalysis(null);
    finalTranscriptRef.current = "";
    setIsListening(true);
    setIsAlwaysListening(false);

    // Reconfigure for active recording
    setTimeout(() => {
      if (!isMountedRef.current) return;

      try {
        const recognition = new (window as any).webkitSpeechRecognition();
        recognitionRef.current = recognition;
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          if (!isMountedRef.current) return;

          let interimTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + text;
            } else {
              interimTranscript += text;
            }
          }

          const displayTranscript = finalTranscriptRef.current + 
            (interimTranscript ? " " + interimTranscript : "");
          setTranscript(displayTranscript);

          if (displayTranscript.trim()) {
            resetSilenceTimer();
          }
        };

        recognition.onerror = (event: any) => {
          if (!isMountedRef.current) return;
          console.error("Active recording error:", event.error);
          stopActiveRecording();
        };

        recognition.onend = () => {
          if (!isMountedRef.current) return;
          console.log("Active recording ended");
          stopActiveRecording();
          
          // If we have transcript, send it
          if (finalTranscriptRef.current.trim() && !loading) {
            sendAnalysisRequest(finalTranscriptRef.current.trim());
          }
        };

        recognition.start();
        console.log("Active recording started");
      } catch (error) {
        console.error("Failed to start active recording:", error);
        stopActiveRecording();
      }
    }, 100);
  };

  const stopActiveRecording = () => {
    if (!isMountedRef.current) return;

    setIsListening(false);
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    // Clean up current recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
    }

    // Switch back to always-listening mode after a delay
    setTimeout(() => {
      if (isMountedRef.current && !isListening) {
        startAlwaysListening();
      }
    }, 500);
  };

  const sendAnalysisRequest = async (text: string) => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const response = await axios.post(
        `${apiUrl}/api/analyze/${game}/`,
        { stats: text },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setAnalysis(response.data);
    } catch (err) {
      console.error("❌ Analysis request failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    silenceTimerRef.current = setTimeout(() => {
      if (finalTranscriptRef.current.trim() && isMountedRef.current) {
        sendAnalysisRequest(finalTranscriptRef.current.trim());
        stopActiveRecording();
      }
    }, 4000);
  };

  const startSpeechRecognition = () => {
    if (!isListening) {
      startActiveRecording();
    }
  };

  const stopSpeechRecognition = () => {
    if (isListening) {
      stopActiveRecording();
    }
  };

  const handleManualSend = () => {
    if (finalTranscriptRef.current.trim()) {
      stopSpeechRecognition();
      sendAnalysisRequest(finalTranscriptRef.current.trim());
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    finalTranscriptRef.current = "";
    setAnalysis(null);
  };

  const toggleAlwaysListening = () => {
    if (isAlwaysListening) {
      // Stop current recognition and prevent restart
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      setIsAlwaysListening(false);
    } else {
      startAlwaysListening();
    }
  };

  return (
    <div className="p-4 bg-gray-900 rounded-xl text-white">
      {/* Voice Commands Info */}
      <div className="mb-4 p-3 bg-blue-900 rounded-lg border border-blue-700">
        <h3 className="font-semibold text-blue-300 mb-2">🎙️ Voice Commands</h3>
        <p className="text-sm text-blue-200">
          Say: <span className="font-mono bg-blue-800 px-2 py-1 rounded">"Hey NeuraPlay"</span> to start speaking
          {game === "fifa" && (
            <> or <span className="font-mono bg-blue-800 px-2 py-1 rounded">"Hey FIFA"</span></>
          )}
          {game === "lol" && (
            <> or <span className="font-mono bg-blue-800 px-2 py-1 rounded">"Hey LOL"</span></>
          )}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <div className={`w-2 h-2 rounded-full ${isAlwaysListening ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-xs text-gray-300">
            {isAlwaysListening ? 'Always listening for commands' : 'Voice commands disabled'}
          </span>
          <button
            onClick={toggleAlwaysListening}
            className="ml-auto text-xs bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded"
          >
            {isAlwaysListening ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
          disabled={loading}
          className={`px-4 py-2 rounded flex items-center gap-2 ${
            isListening 
              ? "bg-red-600 hover:bg-red-700" 
              : "bg-blue-600 hover:bg-blue-700"
          } disabled:bg-gray-600`}
        >
          {isListening ? (
            <>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Stop Listening
            </>
          ) : (
            "🎤 Start Speaking"
          )}
        </button>

        {transcript && !loading && (
          <button
            onClick={handleManualSend}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
          >
            Send Now
          </button>
        )}

        {transcript && (
          <button
            onClick={clearTranscript}
            className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {transcript && (
        <div className="mb-3">
          <p className="text-sm text-gray-300 mb-1">Transcript:</p>
          <div className="p-3 bg-gray-800 rounded border border-gray-700">
            <p className="whitespace-pre-wrap">{transcript}</p>
            {isListening && (
              <div className="flex items-center mt-2 text-xs text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
                Listening... (will auto-send after 4 seconds of silence)
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-yellow-400 mt-2">Analyzing your stats...</p>
      )}

      {analysis && (
        <div className="mt-4 space-y-3">
          <h3 className="text-lg font-bold text-blue-300">✅ Summary</h3>
          <p>{analysis.summary}</p>

          {analysis.topTips && analysis.topTips.length > 0 && (
            <>
              <h4 className="font-semibold text-green-400">🎯 Top Tips</h4>
              <ul className="list-disc ml-6 text-sm space-y-1">
                {analysis.topTips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </>
          )}

          {analysis.trainingDrills && analysis.trainingDrills.length > 0 && (
            <>
              <h4 className="font-semibold text-purple-400">🏋️ Training Drills</h4>
              <ul className="list-disc ml-6 text-sm space-y-1">
                {analysis.trainingDrills.map((drill, index) => (
                  <li key={index}>{drill}</li>
                ))}
              </ul>
            </>
          )}

          {(analysis.rating !== null || analysis.confidence !== null) && (
            <div className="mt-3 flex gap-4 text-sm">
              {analysis.rating !== null && (
                <span>⭐ Rating: {analysis.rating}/10</span>
              )}
              {analysis.confidence !== null && (
                <span>📊 Confidence: {(analysis.confidence * 100).toFixed(0)}%</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceInput;













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
