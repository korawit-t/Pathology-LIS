import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { User } from "../types/user";
import { LoginResponse } from "../types/auth";
import { UserRole } from "../constants/roles.constants";
import api, { setTokens, clearTokens, API_BASE_URL } from "../services/httpClient";
import axios from "axios";
import { getHomeRoute } from "../utils/hasRole";
import SystemSettingService from "../services/systemSettingService";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_WARN_DURATION_MS = 1 * 60 * 1000;
const IDLE_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  handleLoginSuccess: (data: LoginResponse) => { status: "force_change" | "success" };
  logout: () => void;
  updateUser: (user: User) => void;
  idleWarning: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimeoutMs = useRef(DEFAULT_TIMEOUT_MS);
  const warnDurationMs = useRef(DEFAULT_WARN_DURATION_MS);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const settings = await SystemSettingService.getPublicSettings();
        const minutes = settings.idle_timeout_minutes ?? 10;
        idleTimeoutMs.current = Math.max(1, minutes) * 60 * 1000;
        const warnMinutes = settings.idle_warning_minutes ?? 1;
        warnDurationMs.current = Math.max(1, warnMinutes) * 60 * 1000;
      } catch {
        // keep default
      }

      const savedUser = localStorage.getItem("user");
      const savedRoles = localStorage.getItem("roles");
      const savedRefreshToken = localStorage.getItem("refresh_token");

      if (savedUser && savedRefreshToken) {
        try {
          const res = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: savedRefreshToken },
            { withCredentials: true },
          );
          const newAccess = res.data.access_token;
          const newRefresh = res.data.refresh_token ?? savedRefreshToken;
          if (newAccess) setTokens(newAccess, newRefresh);

          const parsedUser = JSON.parse(savedUser);
          const parsedRoles = savedRoles ? JSON.parse(savedRoles) : [];
          setUser({ ...parsedUser, roles: parsedRoles as UserRole[] });
        } catch {
          localStorage.removeItem("user");
          localStorage.removeItem("roles");
          localStorage.removeItem("refresh_token");
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const handleLoginSuccess = useCallback(
    (data: LoginResponse) => {
      if (data.access_token && data.refresh_token) {
        setTokens(data.access_token, data.refresh_token);
      }
      localStorage.setItem("roles", JSON.stringify(data.roles));

      const userWithRoles: User = {
        ...data.user,
        roles: data.roles as UserRole[],
      };
      localStorage.setItem("user", JSON.stringify(userWithRoles));

      setUser(userWithRoles);

      const loginStatus: "force_change" | "success" = data.user
        ?.is_temporary_password
        ? "force_change"
        : "success";

      if (loginStatus === "force_change") {
        navigate("/force-change-password", { replace: true });
      } else {
        navigate(getHomeRoute(data.roles, data.user?.position_name), { replace: true });
      }

      return { status: loginStatus };
    },
    [navigate],
  );

  const logout = useCallback(() => {
    api.post("/auth/logout").catch(() => {});
    clearTokens();
    const lastSlug = localStorage.getItem("last_hospital_slug") || "master";
    localStorage.removeItem("user");
    localStorage.removeItem("roles");
    localStorage.setItem("last_hospital_slug", lastSlug);
    setUser(null);
    setIdleWarning(false);
    navigate(lastSlug === "master" ? "/login" : `/${lastSlug}`, { replace: true });
  }, [navigate]);

  // Idle-logout: reset timers on any user activity.
  const resetIdleTimers = useCallback(() => {
    setIdleWarning(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    const timeoutMs = idleTimeoutMs.current;
    const warnAt = Math.max(0, timeoutMs - warnDurationMs.current);
    warnTimer.current = setTimeout(() => setIdleWarning(true), warnAt);
    idleTimer.current = setTimeout(() => logout(), timeoutMs);
  }, [logout]);

  useEffect(() => {
    if (!user) return; // Only run when logged in.

    resetIdleTimers();
    IDLE_EVENTS.forEach((e) =>
      window.addEventListener(e, resetIdleTimers, { passive: true })
    );
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimers));
    };
  }, [user, resetIdleTimers]);

  const value = {
    user,
    loading,
    handleLoginSuccess,
    logout,
    updateUser: setUser,
    idleWarning,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
