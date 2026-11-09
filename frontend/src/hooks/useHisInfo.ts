import { useEffect, useState } from "react";
import HisService from "../services/hisService";
import type { HisFeature, HisInfo } from "../services/hisService";

/**
 * Which HIS this deployment is connected to (its display name — "HOSxP",
 * "SSB", …) and which features it offers.
 *
 * The LIS is open source and sites run different HIS programs, or none:
 * `HIS_TYPE`/`HIS_DATABASE_URL` are both optional, and only HOSxP implements
 * appointments / visits-today. Without this, every site saw every HOSxP
 * affordance and only found out it didn't apply by clicking it and getting
 * a 503 (no HIS) or a 501 (HIS without that feature).
 *
 * `/his/info` reports what the backend was *configured* with and never touches
 * the HIS itself, so it answers on a site that has none — unlike every other
 * endpoint in HisService.
 *
 * Cached module-level: the answer can't change without a backend restart, and
 * several unrelated components ask independently, so one request per page load
 * is enough.
 */

const ALL_FEATURES: HisFeature[] = ["patient_search", "appointments", "visits_today", "admission"];

/**
 * Used when the lookup fails. Deliberately "everything available": hiding a
 * working feature because one request blipped is worse than leaving a control
 * visible on a site that may not need it — and the endpoint only fails when
 * the whole API is unreachable, at which point nothing works anyway.
 */
const FALLBACK_INFO: HisInfo = {
  configured: true,
  his_type: "",
  display_name: "HIS",
  features: Object.fromEntries(ALL_FEATURES.map((f) => [f, true])) as Record<HisFeature, boolean>,
};

/**
 * Tolerates a backend from before display_name/features existed (a frontend
 * served ahead of a backend restart), so the HIS button doesn't vanish just
 * because `features` is missing: every feature then follows `configured`,
 * which is all the old backend could say.
 */
function normalize(raw: Partial<HisInfo>): HisInfo {
  const configured = raw.configured !== false;
  const features = Object.fromEntries(
    ALL_FEATURES.map((f) => [f, raw.features ? !!raw.features[f] : configured]),
  ) as Record<HisFeature, boolean>;
  return {
    configured,
    his_type: raw.his_type ?? "",
    display_name: raw.display_name?.trim() || "HIS",
    features,
  };
}

let cachedLookup: Promise<HisInfo> | null = null;
/** Set once the lookup settles, so later mounts start with the answer
 * instead of rendering one frame with the generic "HIS" label. */
let resolvedInfo: HisInfo | undefined;

function lookupHisInfo(): Promise<HisInfo> {
  if (!cachedLookup) {
    // Promise.resolve().then(...) rather than calling getInfo() directly, so a
    // synchronous throw lands in the same .catch() as a rejected request.
    cachedLookup = Promise.resolve()
      .then(() => HisService.getInfo())
      .then(normalize)
      .catch(() => FALLBACK_INFO)
      .then((info) => {
        resolvedInfo = info;
        return info;
      });
  }
  return cachedLookup;
}

/** Test seam: clear the module-level cache between cases. */
export function resetHisInfoCache(): void {
  cachedLookup = null;
  resolvedInfo = undefined;
}

/**
 * `hisInfo` is `undefined` until the first lookup resolves. Callers that gate
 * a control should treat undefined as "show it" (`features.x !== false`) so
 * the common, connected case doesn't flicker in.
 */
export function useHisInfo(): { hisInfo: HisInfo | undefined } {
  const [hisInfo, setHisInfo] = useState<HisInfo | undefined>(() => resolvedInfo);

  useEffect(() => {
    let alive = true;
    lookupHisInfo().then((value) => {
      if (alive) setHisInfo(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { hisInfo };
}
