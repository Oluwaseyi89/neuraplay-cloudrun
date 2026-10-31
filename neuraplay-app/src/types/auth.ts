export interface AuthUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  display_name: string;
  date_joined: string;
}

export interface AuthResponse {
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
