import React, { useState } from "react";
import { authApi, getErrorMessage } from "../services/api";
import type { RegisterPayload } from "../services/api";
import { useAuthStore } from "../store/auth-store";

interface Props {
  onSwitchToLogin: () => void;
}

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none text-white placeholder-gray-500 transition-colors";

const emptyForm: RegisterPayload = {
  email: "",
  username: "",
  first_name: "",
  last_name: "",
  password: "",
  password_confirm: "",
};

const RegisterForm: React.FC<Props> = ({ onSwitchToLogin }) => {
  const login = useAuthStore((state) => state.login);
  const [form, setForm] = useState<RegisterPayload>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof RegisterPayload) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.password_confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { user, access, refresh } = await authApi.register({
        ...form,
        email: form.email.trim(),
        username: form.username.trim(),
      });
      login(user, access, refresh);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create your account. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="register-first-name" className="block text-sm font-medium text-gray-300 mb-1">First name</label>
          <input
            id="register-first-name"
            type="text"
            autoComplete="given-name"
            value={form.first_name}
            onChange={update("first_name")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="register-last-name" className="block text-sm font-medium text-gray-300 mb-1">Last name</label>
          <input
            id="register-last-name"
            type="text"
            autoComplete="family-name"
            value={form.last_name}
            onChange={update("last_name")}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-300 mb-1">Username</label>
        <input
          id="register-username"
          type="text"
          autoComplete="username"
          required
          value={form.username}
          onChange={update("username")}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update("email")}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update("password")}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 mt-1">At least 8 characters, not too common or entirely numeric.</p>
      </div>

      <div>
        <label htmlFor="register-password-confirm" className="block text-sm font-medium text-gray-300 mb-1">Confirm password</label>
        <input
          id="register-password-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={form.password_confirm}
          onChange={update("password_confirm")}
          className={inputClass}
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
        {submitting ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-gray-400">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} className="text-purple-400 hover:text-purple-300 font-semibold">
          Log in
        </button>
      </p>
    </form>
  );
};

export default RegisterForm;
