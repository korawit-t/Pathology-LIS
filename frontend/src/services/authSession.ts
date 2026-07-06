// Non-React auth-session cleanup shared by AuthContext and httpClient's
// refresh-failure path, so both stay in sync without a circular import
// (httpClient can't depend on AuthContext, which depends on httpClient).
export function clearLocalSession() {
  localStorage.removeItem("user");
  localStorage.removeItem("roles");
}
