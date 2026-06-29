import api from "./httpClient";
import { LoginPayload, LoginResponse } from "../types/auth";

const AuthService = {
  login: async (values: LoginPayload) => {
    const formData = new URLSearchParams();
    formData.append("username", values.username);
    formData.append("password", values.password);

    // Tokens are set as httpOnly cookies by the server — not stored in JS
    return api.post<LoginResponse>("/auth/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  changePassword: (newPassword: string) => {
    return api.put("/users/me/password", { new_password: newPassword });
  },

  logout: () => api.post("/auth/logout").catch(() => {}),
};

export default AuthService;
