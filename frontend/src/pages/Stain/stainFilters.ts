/**
 * Shared stain classification for the Internal Stain pages.
 *
 * Lives outside StainManagement.jsx so the HosXP Key tab can apply the same
 * rules without importing from its own parent.
 */

export interface StainTest {
  name?: string | null;
  category?: string | null;
  is_external?: boolean | null;
}

export interface StainLike {
  is_recut?: boolean | null;
  test?: StainTest | null;
}

export const CAT_COLOR: Record<string, string> = {
  IHC: "purple",
  Histochem: "cyan",
  "Special Stain": "cyan",
  ISH: "geekblue",
  Molecular: "magenta",
};

// Special stains carry two different category strings in the same database:
// the seeded tests use "Histochem", while anything created or edited through
// Admin → master data is saved as "Special Stain" (TEST_CATEGORY_OPTIONS in
// constants/lab.constants.ts). They mean the same thing, so every check has to
// accept both — BlockGridView/StainManagementPage.tsx already does.
export const SPECIAL_STAIN_CATEGORIES = ["Histochem", "Special Stain"];

export const isSpecialStainCategory = (cat?: string | null): boolean =>
  SPECIAL_STAIN_CATEGORIES.includes(cat ?? "");

/** Short label for the category tag — special stains collapse to "SS". */
export const catLabel = (cat?: string | null): string =>
  isSpecialStainCategory(cat) ? "SS" : cat || "—";

/** In-house work worth showing on the Internal Stain page: recuts always, plus
 * any non-H&E stain whose master test isn't flagged as sent out. */
export const isRelevantStain = (s: StainLike): boolean =>
  !!s.is_recut || (!s.test?.is_external && !s.test?.name?.includes("H&E"));

/** Billable to HosXP: the same in-house stains, minus recuts — a recut is a
 * re-section of an existing block, not a separately charged test. */
export const isKeyableStain = (s: StainLike): boolean =>
  !s.is_recut && !s.test?.is_external && !s.test?.name?.includes("H&E");
