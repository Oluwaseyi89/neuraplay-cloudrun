// App.tsx
import React, { useEffect, useState } from "react";
import LoginButton from "./components/LoginButton";
import VoiceInput from "./components/VoiceInput";
import { useAuthStore } from "./store/auth-store";
import { auth } from "./firebase/firebaseClient";
import { signOut, onAuthStateChanged } from "firebase/auth";

const App: React.FC = () => {
  const { user, token, login, logout } = useAuthStore();

  const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
  const [lolAnalysis, setLolAnalysis] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        logout();
        return;
      }
      const idToken = await firebaseUser.getIdToken();
      login(firebaseUser, idToken);
    });

    return () => unsub();
  }, [login, logout]);

  const handleLogout = async () => {
    await signOut(auth);
    logout();
  };

  if (!token || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
        <LoginButton />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        <button
          onClick={handleLogout}
          className="px-3 py-1 bg-red-600 text-white rounded"
        >
          Logout
        </button>
      </div>

      <p className="mb-4">Speak your game stats to get real-time analysis with voice responses.</p>

      {/* Connection Status */}
      <div className="mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/30">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Using real-time WebSocket connection for voice analysis</span>
        </div>
      </div>

      {/* ✅ FIFA Voice Input */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
        <VoiceInput
          userToken={token}
          initialGame="fifa"
          onAnalysis={(data) => {
            console.log("📊 FIFA Analysis:", data);
            setFifaAnalysis(data);
          }}
        />

        {fifaAnalysis && (
          <div className="bg-gray-800 text-white p-4 rounded mt-3">
            <h3 className="font-bold mb-2">Latest FIFA Analysis:</h3>
            <div className="text-sm">
              <p><strong>Summary:</strong> {fifaAnalysis.summary}</p>
              {fifaAnalysis.rating && <p><strong>Rating:</strong> {fifaAnalysis.rating}/10</p>}
              {fifaAnalysis.confidence && <p><strong>Confidence:</strong> {fifaAnalysis.confidence}%</p>}
              {fifaAnalysis.topTips && fifaAnalysis.topTips.length > 0 && (
                <div className="mt-2">
                  <strong>Top Tips:</strong>
                  <ul className="list-disc ml-4">
                    {fifaAnalysis.topTips.map((tip: string, index: number) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              {fifaAnalysis.trainingDrills && fifaAnalysis.trainingDrills.length > 0 && (
                <div className="mt-2">
                  <strong>Training Drills:</strong>
                  <ul className="list-disc ml-4">
                    {fifaAnalysis.trainingDrills.map((drill: string, index: number) => (
                      <li key={index}>{drill}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-gray-400">
                Response Type: {fifaAnalysis.responseType || 'detailed'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ✅ LoL Voice Input */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
        <VoiceInput
          userToken={token}
          initialGame="lol"
          onAnalysis={(data) => {
            console.log("🔥 LoL Analysis:", data);
            setLolAnalysis(data);
          }}
        />

        {lolAnalysis && (
          <div className="bg-gray-800 text-white p-4 rounded mt-3">
            <h3 className="font-bold mb-2">Latest LoL Analysis:</h3>
            <div className="text-sm">
              <p><strong>Summary:</strong> {lolAnalysis.summary}</p>
              {lolAnalysis.rating && <p><strong>Rating:</strong> {lolAnalysis.rating}/10</p>}
              {lolAnalysis.confidence && <p><strong>Confidence:</strong> {lolAnalysis.confidence}%</p>}
              {lolAnalysis.topTips && lolAnalysis.topTips.length > 0 && (
                <div className="mt-2">
                  <strong>Top Tips:</strong>
                  <ul className="list-disc ml-4">
                    {lolAnalysis.topTips.map((tip: string, index: number) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lolAnalysis.trainingDrills && lolAnalysis.trainingDrills.length > 0 && (
                <div className="mt-2">
                  <strong>Training Drills:</strong>
                  <ul className="list-disc ml-4">
                    {lolAnalysis.trainingDrills.map((drill: string, index: number) => (
                      <li key={index}>{drill}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-gray-400">
                Response Type: {lolAnalysis.responseType || 'detailed'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;










// // App.tsx
// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();

//   const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
//   const [lolAnalysis, setLolAnalysis] = useState<any>(null);

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (!firebaseUser) {
//         logout();
//         return;
//       }
//       const idToken = await firebaseUser.getIdToken();
//       login(firebaseUser, idToken);
//     });

//     return () => unsub();
//   }, [login, logout]);

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>

//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       {/* ✅ FIFA Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => {
//             console.log("📊 FIFA:", data);
//             setFifaAnalysis(data);
//           }}
//         />

//         {fifaAnalysis && (
//           <div className="bg-gray-800 text-white p-3 rounded mt-3">
//             <h3 className="font-bold">Latest FIFA Analysis:</h3>
//             <pre className="whitespace-pre-wrap text-xs">
//               {JSON.stringify(fifaAnalysis, null, 2)}
//             </pre>
//           </div>
//         )}
//       </div>

//       {/* ✅ LoL Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => {
//             console.log("🔥 LoL:", data);
//             setLolAnalysis(data);
//           }}
//         />

//         {lolAnalysis && (
//           <div className="bg-gray-800 text-white p-3 rounded mt-3">
//             <h3 className="font-bold">Latest LoL Analysis:</h3>
//             <pre className="whitespace-pre-wrap text-xs">
//               {JSON.stringify(lolAnalysis, null, 2)}
//             </pre>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default App;














// // App.tsx
// import React, { useEffect } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (!firebaseUser) {
//         logout();
//         return;
//       }
//       const idToken = await firebaseUser.getIdToken();
//       login(firebaseUser, idToken);
//     });

//     return () => unsub();
//   }, [login, logout]);

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>

//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput userToken={token} initialGame="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput userToken={token} initialGame="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;












// // App.tsx
// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { handleRedirectLogin, auth } from "./firebase/firebaseClient";
// import { signOut } from "firebase/auth";

// const App: React.FC = () => {
//   const [userToken, setUserToken] = useState<string | null>(null);
//   const [userName, setUserName] = useState<string | null>(null);
//   const [userEmail, setUserEmail] = useState<string | null>(null);

//   const handleLogin = (
//     token: string,
//     displayName: string | null,
//     email: string | null
//   ) => {
//     setUserToken(token);
//     setUserName(displayName);
//     setUserEmail(email);
//   };

//   // ✅ Handle redirect login on first load
//   useEffect(() => {
//     const checkRedirect = async () => {
//       const result = await handleRedirectLogin();
//       if (result) {
//         handleLogin(
//           result.token,
//           result.user.displayName,
//           result.user.email
//         );
//       }
//     };
//     checkRedirect();
//   }, []);

//   const handleLogout = async () => {
//     await signOut(auth);
//     setUserToken(null);
//     setUserName(null);
//     setUserEmail(null);
//   };

//   if (!userToken) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton onLogin={handleLogin} />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {userName}</h1>
//           <p className="text-sm text-gray-500">{userEmail}</p>
//         </div>
//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput userToken={userToken} game="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput userToken={userToken} game="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;















// // App.tsx
// import React, { useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";


// const App: React.FC = () => {
//   const [userToken, setUserToken] = useState<string | null>(null);
//   const [userName, setUserName] = useState<string | null>(null);

//   const handleLogin = (token: string, displayName: string | null) => {
//     setUserToken(token);
//     setUserName(displayName);
//   };

//   if (!userToken) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton onLogin={handleLogin} />
//       </div>
//     );
//   }

//   return (
//     <div className="p-4">
//       <h1 className="text-xl font-bold mb-2">Welcome, {userName}</h1>
//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold">FIFA Analysis</h2>
//         <VoiceInput userToken={userToken} game="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold">LoL Analysis</h2>
//         <VoiceInput userToken={userToken} game="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;
