// GET /version — public, also answered before login.
export interface VersionInfo {
  version: string;
  environment: string;
}

// GET /version/update-status — admin only (backend app/schemas/version.py).
export interface UpdateStatus {
  // False when the backend's UPDATE_CHECK_REPO is "off".
  enabled: boolean;
  repo: string | null;
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  // The newer release changes the MAJOR number: read its upgrade notes first.
  major_update: boolean;
  release_url: string | null;
  published_at: string | null;
  checked_at: string | null;
  error: "unreachable" | "no_release" | "rate_limited" | "bad_response" | null;
}
