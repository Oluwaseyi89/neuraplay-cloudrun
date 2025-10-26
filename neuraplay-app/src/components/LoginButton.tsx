// LoginButton.tsx
import React from "react";
import { signInWithGoogle } from "../firebase/firebaseClient";


interface LoginButtonProps {
  onLogin: (token: string, displayName: string | null, email: string | null) => void;
}

const LoginButton: React.FC<LoginButtonProps> = ({ onLogin }) => {
  const handleLogin = async () => {
    try {
      const { user, token } = await signInWithGoogle();
      onLogin(token, user.displayName, user.email);
      console.log("Logged in user:", user.displayName);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <button onClick={handleLogin} className="px-4 py-2 bg-blue-600 text-white rounded">
      Login with Google
    </button>
  );
};

export default LoginButton;
