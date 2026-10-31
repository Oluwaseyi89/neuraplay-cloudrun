import httpClient from "./httpClient";
import type { AuthResponse, AuthUser, RegisterPayload } from "../types/auth";

export const authService = {
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const { data } = await httpClient.post<AuthResponse>("/api/auth/register/", payload);
    return data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await httpClient.post<AuthResponse>("/api/auth/login/", { email, password });
    return data;
  },

  logout: async (refresh: string): Promise<void> => {
    await httpClient.post("/api/auth/logout/", { refresh });
  },

  me: async (): Promise<AuthUser> => {
    const { data } = await httpClient.get<AuthUser>("/api/auth/me/");
    return data;
  },
};
