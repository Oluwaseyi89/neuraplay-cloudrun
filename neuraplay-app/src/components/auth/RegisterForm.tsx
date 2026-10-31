import React, { useState } from "react";
import { authService } from "../../services/authService";
import { getErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth-store";
import type { RegisterPayload } from "../../types/auth";
import FormField from "./FormField";
import FormError from "./FormError";
import SubmitButton from "./SubmitButton";
import SwitchAuthPrompt from "./SwitchAuthPrompt";

interface Props {
  onSwitchToLogin: () => void;
}

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
      const { user, access, refresh } = await authService.register({
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
        <FormField
          id="register-first-name"
          label="First name"
          type="text"
          autoComplete="given-name"
          value={form.first_name}
          onChange={update("first_name")}
        />
        <FormField
          id="register-last-name"
          label="Last name"
          type="text"
          autoComplete="family-name"
          value={form.last_name}
          onChange={update("last_name")}
        />
      </div>

      <FormField
        id="register-username"
        label="Username"
        type="text"
        autoComplete="username"
        required
        value={form.username}
        onChange={update("username")}
      />

      <FormField
        id="register-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={form.email}
        onChange={update("email")}
        placeholder="you@example.com"
      />

      <FormField
        id="register-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={form.password}
        onChange={update("password")}
        hint="At least 8 characters, not too common or entirely numeric."
      />

      <FormField
        id="register-password-confirm"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={form.password_confirm}
        onChange={update("password_confirm")}
      />

      <FormError message={error} />
      <SubmitButton submitting={submitting} label="Create account" submittingLabel="Creating account..." />
      <SwitchAuthPrompt question="Already have an account?" actionLabel="Log in" onClick={onSwitchToLogin} />
    </form>
  );
};

export default RegisterForm;
