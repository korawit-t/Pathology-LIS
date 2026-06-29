import { User } from "./user";

export interface LoginResponse {
  access_token?: string;   // deprecated — tokens now live in httpOnly cookies
  refresh_token?: string;  // deprecated — tokens now live in httpOnly cookies
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
  new_password: string;
}
