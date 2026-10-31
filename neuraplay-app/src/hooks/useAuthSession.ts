import { useCallback, useEffect } from "react";
import { useAuthStore } from "../store/auth-store";
import { authService } from "../services/authService";
import { refreshAccessToken } from "../services/httpClient";
import { secondsUntilExpiry } from "../lib/jwt";

// Refresh this many seconds before the access token expires
const REFRESH_LEAD_SECONDS = 60;

/**
 * Keeps the persisted session valid: re-validates it on load and refreshes the
 * access token shortly before expiry (the voice WebSocket needs a live token).
 */
export const useAuthSession = () => {
  const { user, token, refreshToken, setUser, logout: clearSession } = useAuthStore();

  // Validate a persisted session on load (refreshes the token if it expired)
  useEffect(() => {
    if (!useAuthStore.getState().refreshToken) return;
    authService.me().then(setUser).catch(() => clearSession());
  }, [setUser, clearSession]);

  useEffect(() => {
    if (!token) return;
    const secondsLeft = secondsUntilExpiry(token);
    if (secondsLeft === null) return;

    const timer = setTimeout(() => {
      refreshAccessToken();
    }, Math.max(secondsLeft - REFRESH_LEAD_SECONDS, 0) * 1000);

    return () => clearTimeout(timer);
  }, [token]);

  const logout = useCallback(async () => {
    if (refreshToken) {
      try {
        await authService.logout(refreshToken);
      } catch (error) {
        console.warn("⚠️ Server logout failed, clearing local session anyway:", error);
      }
    }
    clearSession();
  }, [refreshToken, clearSession]);

  return {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    logout,
  };
};
