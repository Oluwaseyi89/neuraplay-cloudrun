// App.tsx
import React, { useState } from "react";
import LoginButton from "./components/LoginButton";
import VoiceInput from "./components/VoiceInput";


const App: React.FC = () => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const handleLogin = (token: string, displayName: string | null) => {
    setUserToken(token);
    setUserName(displayName);
  };

  if (!userToken) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
        <LoginButton onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Welcome, {userName}</h1>
      <p className="mb-4">Speak your game stats to get real-time analysis.</p>

      <div className="mb-6">
        <h2 className="text-lg font-semibold">FIFA Analysis</h2>
        <VoiceInput userToken={userToken} game="fifa" />
      </div>

      <div>
        <h2 className="text-lg font-semibold">LoL Analysis</h2>
        <VoiceInput userToken={userToken} game="lol" />
      </div>
    </div>
  );
};

export default App;
