import { useCallback } from "react";
import SurgicalCaseService from "../services/surgicalCaseService";
import type { SurgicalCase } from "../types/surgical";

/**
 * Resolves a list of accession numbers to their SurgicalCase (one
 * `getCases({ search, limit: 1 })` call per accession, in parallel), keyed
 * by accession number. Returns the raw case rather than a pre-shaped
 * summary object, since callers need different fields out of it (e.g. only
 * hn/patient_name, or also age/scheme/hospital) — shaping stays with each
 * caller instead of being baked into this hook.
 */
export function useCaseInfoByAccession() {
  const resolveCaseInfo = useCallback(
    async (accessionNos: (string | null | undefined)[]): Promise<Record<string, SurgicalCase>> => {
      const uniqueAccNos = [...new Set(accessionNos.filter(Boolean))] as string[];
      if (uniqueAccNos.length === 0) return {};

      const results = await Promise.all(
        uniqueAccNos.map((acc) =>
          SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [], total: 0 })),
        ),
      );

      const map: Record<string, SurgicalCase> = {};
      uniqueAccNos.forEach((acc, i) => {
        const c = results[i]?.items?.[0];
        if (c) map[acc] = c;
      });
      return map;
    },
    [],
  );

  return { resolveCaseInfo };
}
