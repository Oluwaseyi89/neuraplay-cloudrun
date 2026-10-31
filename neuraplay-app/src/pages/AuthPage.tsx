import React, { useState } from "react";
import LoginForm from "../components/auth/LoginForm";
import RegisterForm from "../components/auth/RegisterForm";

type AuthView = "login" | "register";

const VIEWS: { id: AuthView; label: string }[] = [
  { id: "login", label: "Log in" },
  { id: "register", label: "Sign up" },
];

const AuthPage: React.FC = () => {
  const [view, setView] = useState<AuthView>("login");

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800/70 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
              NeuraPlay
            </h1>
            <p className="text-gray-300 text-lg mb-6">AI Game Analysis Coach</p>

            <div className="flex bg-gray-900/50 rounded-xl p-1 mb-6">
              {VIEWS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    view === id ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === "login" ? (
              <LoginForm onSwitchToRegister={() => setView("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setView("login")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
