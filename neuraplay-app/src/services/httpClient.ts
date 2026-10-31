import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../store/auth-store";

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL || "";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

// Login/register/refresh must never trigger a refresh-and-retry themselves
const NO_REFRESH_PATHS = /\/api\/auth\/(login|register|token)\//;

const httpClient = axios.create({ baseURL: API_BASE });

// Attach the current access token to every request
httpClient.interceptors.request.use((config) => {
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
httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const skipRefresh = NO_REFRESH_PATHS.test(original?.url ?? "");

    if (error.response?.status === 401 && original && !original._retry && !skipRefresh) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return httpClient(original);
      }
    }
    return Promise.reject(error);
  }
);

export default httpClient;
