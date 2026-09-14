import { useEffect, useState } from "react";
import HisService from "../services/hisService";

/**
 * Whether this deployment is wired to a HIS at all.
 *
 * The LIS is open source and plenty of sites run no HIS — HOSxP is a Thai
 * product, and `HIS_TYPE`/`HIS_DATABASE_URL` are both optional. Without this,
 * those sites still saw every HOSxP affordance (the two Outlab tabs, the
 * "Pull from HIS" button on all four case-type forms) and only found out by
 * clicking one and getting a 503.
 *
 * `/his/info` reports what the backend was *configured* with and never touches
 * the HIS itself, so it answers on a site that has none — unlike every other
 * endpoint in HisService, which 503s there.
 *
 * Cached module-level: the answer can't change without a backend restart, and
 * several unrelated components ask independently, so one request per page load
 * is enough.
 */
let cachedLookup: Promise<boolean> | null = null;

function lookupHisConfigured(): Promise<boolean> {
  if (!cachedLookup) {
    // A failed lookup resolves to `true` deliberately. Hiding a working
    // feature because one request blipped is worse than leaving a control
    // visible on a site that may not need it — and the endpoint only fails
    // when the whole API is unreachable, at which point nothing works anyway.
    // Promise.resolve().then(...) rather than calling getInfo() directly, so a
    // synchronous throw lands in the same .catch() as a rejected request.
    cachedLookup = Promise.resolve()
      .then(() => HisService.getInfo())
      .then((info) => info.configured)
      .catch(() => true);
  }
  return cachedLookup;
}

/** Test seam: clear the module-level cache between cases. */
export function resetHisConfiguredCache(): void {
  cachedLookup = null;
}

/**
 * `undefined` until resolved, so callers render nothing rather than flashing a
 * HOSxP control that is about to be hidden.
 */
export function useHisConfigured(): { hisConfigured: boolean | undefined } {
  const [hisConfigured, setHisConfigured] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    lookupHisConfigured().then((value) => {
      if (alive) setHisConfigured(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { hisConfigured };
}
