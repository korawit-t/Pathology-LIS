import api from "./httpClient";
import {
  LoginPayload,
  LoginResponse,
  MfaChallengeResponse,
  MfaSetupResponse,
  MfaStatus,
  TrustedDevice,
} from "../types/auth";

const AuthService = {
  login: async (values: LoginPayload) => {
    const formData = new URLSearchParams();
    formData.append("username", values.username);
    formData.append("password", values.password);

    // Tokens are set as httpOnly cookies by the server — not stored in JS.
    // When a second factor applies the server sends no cookie at all, only
    // {mfa_required, mfa_token} — see completeMfaLogin.
    return api.post<LoginResponse | MfaChallengeResponse>("/auth/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  /** Second step: exchange the challenge and a code for a session. */
  completeMfaLogin: (mfaToken: string, code: string, rememberDevice: boolean) =>
    api.post<LoginResponse>("/auth/login/mfa", {
      mfa_token: mfaToken,
      code,
      remember_device: rememberDevice,
    }),

  getMfaStatus: () => api.get<MfaStatus>("/auth/mfa/status"),

  /** Starts enrolment. Nothing is enabled until confirmMfaSetup succeeds. */
  startMfaSetup: (password: string) =>
    api.post<MfaSetupResponse>("/auth/mfa/setup", { password }),

  confirmMfaSetup: (code: string) =>
    api.post<{ enabled: boolean }>("/auth/mfa/confirm", { code }),

  disableMfa: (password: string) => api.post("/auth/mfa/disable", { password }),

  stepUp: (code: string) => api.post("/auth/mfa/step-up", { code }),

  getTrustedDevices: () => api.get<TrustedDevice[]>("/auth/mfa/devices"),

  revokeTrustedDevice: (id: number) => api.delete(`/auth/mfa/devices/${id}`),

  revokeAllTrustedDevices: () => api.delete("/auth/mfa/devices"),

  changePassword: (currentPassword: string, newPassword: string) => {
    return api.put("/users/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  logout: () => api.post("/auth/logout").catch(() => {}),
};

export default AuthService;
