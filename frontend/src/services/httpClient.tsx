import axios from "axios";
import qs from "qs";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// In-memory token store (cleared on page refresh — user must re-login)
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("refresh_token");
}

export function getAccessToken() {
  return accessToken;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: "repeat" }),
});

let isRefreshing = false;
type QueueItem = { resolve: (value?: unknown) => void; reject: (err: unknown) => void };
let failedQueue: QueueItem[] = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isLoginRequest = originalRequest.url?.includes("/auth/login");
    const isRefreshRequest = originalRequest.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isLoginRequest &&
      !isRefreshRequest
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { withCredentials: true },
        );
        const newAccess = res.data.access_token;
        const newRefresh = res.data.refresh_token;
        if (newAccess) setTokens(newAccess, newRefresh ?? refreshToken!);

        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        clearTokens();
        try {
          await axios.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true });
        } catch {}
        localStorage.removeItem("user");
        localStorage.removeItem("roles");
        window.location.reload();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
