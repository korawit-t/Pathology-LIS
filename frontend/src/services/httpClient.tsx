import axios from "axios";
import { message } from "antd";
import qs from "qs";
import { clearLocalSession } from "./authSession";
import { requestStepUp } from "./stepUpBroker";

/** Details the server sends instead of a bare 403 — see StepUpModal. */
const STEP_UP_REQUIRED = "step_up_required";
const MFA_SETUP_REQUIRED = "mfa_setup_required";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });

        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        try {
          await axios.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true });
        } catch {}
        clearLocalSession();
        window.location.reload();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // The server refuses irreversible actions (signing out a report, changing
    // security settings) until a factor is re-checked. Ask here rather than in
    // every caller: a page that does not know about step-up would otherwise
    // show the raw "step_up_required" detail as its error message.
    if (
      error.response?.status === 403 &&
      error.response?.data?.detail === STEP_UP_REQUIRED &&
      !originalRequest._stepUpRetry
    ) {
      originalRequest._stepUpRetry = true;
      try {
        await requestStepUp(originalRequest.stepUpAction);
      } catch {
        // Dismissed, or nothing mounted to ask with. Hand the caller its own
        // error back, marked so a page-level step-up handler does not put a
        // second prompt up on top of the one just closed.
        error.__stepUpHandled = true;
        return Promise.reject(error);
      }
      return api(originalRequest);
    }

    // Same guard, but the user has no second factor to check and their
    // enrolment deadline has passed. ProtectedRoute only sees this at login,
    // so a deadline that falls mid-session lands here — say what to do rather
    // than reloading them out of a half-written report.
    if (
      error.response?.status === 403 &&
      error.response?.data?.detail === MFA_SETUP_REQUIRED
    ) {
      message.warning(
        "Set up two-factor authentication before doing this — " +
          "your profile menu, Two-Factor Authentication.",
        4,
      );
      error.__stepUpHandled = true;
    }

    return Promise.reject(error);
  },
);

export default api;
