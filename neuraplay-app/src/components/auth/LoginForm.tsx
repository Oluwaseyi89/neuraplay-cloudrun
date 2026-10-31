import React, { useState } from "react";
import { authService } from "../../services/authService";
import { getErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth-store";
import FormField from "./FormField";
import FormError from "./FormError";
import SubmitButton from "./SubmitButton";
import SwitchAuthPrompt from "./SwitchAuthPrompt";

interface Props {
  onSwitchToRegister: () => void;
}

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
      const { user, access, refresh } = await authService.login(email.trim(), password);
      login(user, access, refresh);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to log in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <FormField
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />

      <FormField
        id="login-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />

      <FormError message={error} />
      <SubmitButton submitting={submitting} label="Log in" submittingLabel="Logging in..." />
      <SwitchAuthPrompt question="Don't have an account?" actionLabel="Create one" onClick={onSwitchToRegister} />
    </form>
  );
};

export default LoginForm;
