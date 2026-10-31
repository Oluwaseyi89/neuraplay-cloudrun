import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../store/auth-store";
import type { AuthUser } from "../store/auth-store";

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface AuthResponse {
  user: AuthUser;
  access: string;
  refresh: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  password: string;
  password_confirm: string;
}

const api = axios.create({ baseURL: API_BASE });

// Attach the current access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Share one in-flight refresh between concurrent 401s
let refreshPromise: Promise<string | null> | null = null;

export const refreshAccessToken = (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;

  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return Promise.resolve(null);

  refreshPromise = axios
    .post(`${API_BASE}/api/auth/token/refresh/`, { refresh: refreshToken })
    .then(({ data }) => {
      setTokens(data.access, data.refresh);
      return data.access as string;
    })
    .catch(() => {
      logout();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

// On 401, refresh the access token once and retry the original request
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthEndpoint = /\/api\/auth\/(login|register|token)\//.test(original?.url ?? "");

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

/** Seconds until a JWT expires (negative if already expired, null if unreadable) */
export const secondsUntilExpiry = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp - Date.now() / 1000;
  } catch {
    return null;
  }
};

/** Turn a DRF error response into a readable message */
export const getErrorMessage = (error: unknown, fallback = "Something went wrong. Please try again."): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (!data) return error.message || fallback;
    if (typeof data === "string") return fallback;
    if (data.detail) return data.detail;
    if (data.error) return data.error;

    const messages = Object.entries(data).map(([field, value]) => {
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
    });
    if (messages.length) return messages.join("\n");
  }
  return fallback;
};

export const authApi = {
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>("/api/auth/register/", payload);
    return data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>("/api/auth/login/", { email, password });
    return data;
  },

  logout: async (refresh: string): Promise<void> => {
    await api.post("/api/auth/logout/", { refresh });
  },

  me: async (): Promise<AuthUser> => {
    const { data } = await api.get<AuthUser>("/api/auth/me/");
    return data;
  },
};

export default api;
