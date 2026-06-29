import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { hasAnyRole, getHomeRoute } from "../../utils/hasRole";
import { PAGE_PERMISSIONS, PageKey } from "../../constants/pagePermissions";
import { Spin } from "antd";

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageKey?: PageKey;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, pageKey }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spin size="large" fullscreen tip="Loading authentication..." />;
  }

  if (!user) {
    const lastSlug = localStorage.getItem("last_hospital_slug") || "master";
    const loginUrl = lastSlug === "master" ? "/login" : `/${lastSlug}`;
    return <Navigate to={loginUrl} state={{ from: location }} replace />;
  }

  const needsPasswordChange = user.is_temporary_password || user.is_password_expired;

  if (needsPasswordChange && location.pathname !== "/force-change-password") {
    return <Navigate to="/force-change-password" replace />;
  }

  if (!needsPasswordChange && location.pathname === "/force-change-password") {
    return <Navigate to={getHomeRoute(user.roles, user.position_name)} replace />;
  }

  const allowedRoles = pageKey ? PAGE_PERMISSIONS[pageKey] : undefined;

  if (allowedRoles && !hasAnyRole(user, allowedRoles)) {
    const home = getHomeRoute(user.roles);
    // Only redirect to home if it's a meaningful page; otherwise boot to login
    if (home !== "/dashboard") {
      return <Navigate to={home} replace />;
    }
    const lastSlug = localStorage.getItem("last_hospital_slug") || "master";
    const loginUrl = lastSlug === "master" ? "/login" : `/${lastSlug}`;
    return <Navigate to={loginUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
