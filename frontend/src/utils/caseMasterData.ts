import { message } from "antd";

/** Shared try/catch + error-message shell for the case-registration
 * form modals' fetchMasterData: each modal keeps its own Promise.all(...)
 * service-call list and state-setting fully inline (the actual list of
 * lookups differs per case type) — this wraps only the truly-common part.
 * Returns undefined on failure so the caller can bail out of setting state. */
export async function loadMasterData<T>(
  fetchFn: () => Promise<T>,
  errorMessage = "Failed to load reference data",
): Promise<T | undefined> {
  try {
    return await fetchFn();
  } catch {
    message.error(errorMessage);
    return undefined;
  }
}
