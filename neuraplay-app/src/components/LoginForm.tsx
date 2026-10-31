import React, { useState } from "react";
import { authApi, getErrorMessage } from "../services/api";
import { useAuthStore } from "../store/auth-store";

interface Props {
  onSwitchToRegister: () => void;
}

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none text-white placeholder-gray-500 transition-colors";

const LoginForm: React.FC<Props> = ({ onSwitchToRegister }) => {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { user, access, refresh } = await authApi.login(email.trim(), password);
      login(user, access, refresh);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to log in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2 whitespace-pre-line">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-purple-500/25"
      >
        {submitting ? "Logging in..." : "Log in"}
      </button>

      <p className="text-center text-sm text-gray-400">
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToRegister} className="text-purple-400 hover:text-purple-300 font-semibold">
          Create one
        </button>
      </p>
    </form>
  );
};

export default LoginForm;
