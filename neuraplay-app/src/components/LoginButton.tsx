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
