import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  display_name: string;
  date_joined: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  login: (user: AuthUser, token: string, refreshToken: string) => void;
  setTokens: (token: string, refreshToken?: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,

      login: (user, token, refreshToken) =>
        set({ user, token, refreshToken }),

      setTokens: (token, refreshToken) =>
        set((state) => ({ token, refreshToken: refreshToken ?? state.refreshToken })),

      setUser: (user) =>
        set({ user }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null })
    }),
    {
      name: "auth-store", // storage key
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken
      })
    }
  )
);
