// src/store/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "firebase/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,

      login: (user, token) =>
        set({ user, token }),

      logout: () =>
        set({ user: null, token: null })
    }),
    {
      name: "auth-store", // storage key
      partialize: (state) => ({ user: state.user, token: state.token })
    }
  )
);
