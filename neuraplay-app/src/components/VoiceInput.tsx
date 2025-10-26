// VoiceInput.tsx
import React, { useState } from "react";
import axios from "axios";

interface VoiceInputProps {
  userToken: string;
  game: "fifa" | "lol";
}

const apiUrl = import.meta.env.VITE_API_BASE_URL!;


const VoiceInput: React.FC<VoiceInputProps> = ({ userToken, game }) => {
  const [transcript, setTranscript] = useState<string>("");
  const [resultAudio, setResultAudio] = useState<string | null>(null);

  const startSpeechRecognition = () => {
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);

      try {
        const response = await axios.post(
          `${apiUrl}/api/analyze/${game}/`,
          { stats: text }, 
          { headers: { Authorization: `Bearer ${userToken}` } }
        );

        const audioBlob = new Blob([response.data.audio], { type: "audio/mp3" });
        const audioUrl = URL.createObjectURL(audioBlob);
        setResultAudio(audioUrl);
        new Audio(audioUrl).play();
      } catch (error) {
        console.error("Failed to get analysis:", error);
      }
    };

    recognition.start();
  };

  return (
    <div>
      <button onClick={startSpeechRecognition}>Start Speaking</button>
      <p>Transcript: {transcript}</p>
      {resultAudio && <audio src={resultAudio} controls />}
    </div>
  );
};

export default VoiceInput;












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
