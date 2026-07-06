import { User } from "./user";

export interface LoginResponse {
  token_type: string;
  roles: string[];
  user?: User;
  last_password_update?: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
