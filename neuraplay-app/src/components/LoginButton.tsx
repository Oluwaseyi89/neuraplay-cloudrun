import React from "react";
import {
  signInWithGoogle,
  signInWithGoogleRedirect
} from "../firebase/firebaseClient";
import { useAuthStore } from "../store/auth-store";

const LoginButton: React.FC = () => {
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    try {
      const { user, token } = await signInWithGoogle();
      login(user, token);
      console.log("✅ Logged in with popup:", user.displayName);

    } catch (error) {
      console.warn("⚠️ Popup login failed → Redirecting...", error);
      await signInWithGoogleRedirect();
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="px-4 py-2 bg-blue-600 text-white rounded"
    >
      Login with Google
    </button>
  );
};

export default LoginButton;












// import React from "react";
// import {
//   signInWithGoogle,
//   signInWithGoogleRedirect
// } from "../firebase/firebaseClient";

// interface LoginButtonProps {
//   onLogin: (token: string, displayName: string | null, email: string | null) => void;
// }

// const LoginButton: React.FC<LoginButtonProps> = ({ onLogin }) => {
//   const handleLogin = async () => {
//     try {
//       // Try Popup login first ✅
//       const result = await signInWithGoogle();
//       onLogin(result.token, result.user.displayName, result.user.email);
//       console.log("Logged in with popup:", result.user.displayName);

//     } catch (err) {
//       console.warn("Popup login failed → using redirect:", err);

//       // Fallback to redirect ✅
//       await signInWithGoogleRedirect();
//     }
//   };

//   return (
//     <button
//       onClick={handleLogin}
//       className="px-4 py-2 bg-blue-600 text-white rounded"
//     >
//       Login with Google
//     </button>
//   );
// };

// export default LoginButton;















// // LoginButton.tsx
// import React from "react";
// import { signInWithGoogle } from "../firebase/firebaseClient";


// interface LoginButtonProps {
//   onLogin: (token: string, displayName: string | null, email: string | null) => void;
// }

// const LoginButton: React.FC<LoginButtonProps> = ({ onLogin }) => {
//   const handleLogin = async () => {
//     try {
//       const { user, token } = await signInWithGoogle();
//       onLogin(token, user.displayName, user.email);
//       console.log("Logged in user:", user.displayName);
//     } catch (err) {
//       console.error("Login failed:", err);
//     }
//   };

//   return (
//     <button onClick={handleLogin} className="px-4 py-2 bg-blue-600 text-white rounded">
//       Login with Google
//     </button>
//   );
// };

// export default LoginButton;
