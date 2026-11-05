import { useEffect, useState } from "react";
import { BUILD_ID } from "../constants/app.constants";
import { STALE_BUILD_EVENT } from "../utils/staleBuild";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
// Coming back to the tab checks straight away, but not more often than this.
const MIN_GAP_MS = 60 * 1000;

interface Options {
  // Off under `vite` dev, which serves no version.json.
  enabled?: boolean;
  currentBuildId?: string;
  intervalMs?: number;
}

/**
 * True once the server is serving a different build from the one this tab
 * loaded. Compares BUILD_ID with /version.json (written by vite.config.js) on
 * load, every few minutes, and whenever the tab becomes visible again; a chunk
 * that failed to load because it was replaced (utils/staleBuild.ts) says the
 * same thing sooner.
 */
export function useNewBuildAvailable({
  enabled = import.meta.env.PROD,
  currentBuildId = BUILD_ID,
  intervalMs = DEFAULT_INTERVAL_MS,
}: Options = {}): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (available) return;
    const onStale = () => setAvailable(true);
    window.addEventListener(STALE_BUILD_EVENT, onStale);
    return () => window.removeEventListener(STALE_BUILD_EVENT, onStale);
  }, [available]);

  useEffect(() => {
    if (!enabled || available) return;
    // `found` stops the polling at once, without waiting for the re-render
    // that `available` triggers to clean this effect up.
    let cancelled = false;
    let found = false;
    let lastCheck = 0;

    const check = async () => {
      if (found) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${lastCheck}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data: { buildId?: unknown } = await res.json();
        if (!cancelled && typeof data.buildId === "string" && data.buildId !== currentBuildId) {
          found = true;
          setAvailable(true);
        }
      } catch {
        // Offline, or the server is mid-deploy: the next check tries again.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck >= MIN_GAP_MS) {
        void check();
      }
    };

    void check();
    const timer = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, available, currentBuildId, intervalMs]);

  return available;
}
