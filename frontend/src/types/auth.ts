import { User } from "./user";

export interface LoginResponse {
  token_type: string;
  roles: string[];
  user?: User;
  last_password_update?: string | null;
  /** Present only on the second step, when the browser was trusted. */
  device_remembered?: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

/** Step one of a two-step login returns this instead of a session. */
export interface MfaChallengeResponse {
  mfa_required: true;
  mfa_token: string;
}

export interface MfaSetupResponse {
  provisioning_uri: string;
  secret: string;
  issuer: string;
  account_name: string;
}

export interface MfaMethod {
  id: number;
  method_type: string;
  label?: string | null;
  is_primary: boolean;
  confirmed_at?: string | null;
  last_used_at?: string | null;
}

export interface MfaStatus {
  enabled: boolean;
  pending_setup: boolean;
  methods: MfaMethod[];
  required_for_this_user: boolean;
  system_enabled: boolean;
}

export interface TrustedDevice {
  id: number;
  label?: string | null;
  ip_address?: string | null;
  created_at: string;
  last_used_at?: string | null;
  expires_at: string;
}
