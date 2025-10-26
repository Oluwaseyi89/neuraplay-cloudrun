// App.tsx
import React, { useEffect } from "react";
import LoginButton from "./components/LoginButton";
import VoiceInput from "./components/VoiceInput";
import { useAuthStore } from "./store/auth-store";
import { auth } from "./firebase/firebaseClient";
import { signOut, onAuthStateChanged } from "firebase/auth";

const App: React.FC = () => {
  const { user, token, login, logout } = useAuthStore();

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

      <p className="mb-4">Speak your game stats to get real-time analysis.</p>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
        <VoiceInput userToken={token} game="fifa" />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
        <VoiceInput userToken={token} game="lol" />
      </div>
    </div>
  );
};

export default App;












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
