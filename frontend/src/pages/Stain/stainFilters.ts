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
  system_code?: string | null;
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
// accept both — BlockGridView/StainManagementPage.tsx already does. Compared
// case-insensitively because the backend spells it "Special stain" in places
// (crud/slide_storage.py).
export const SPECIAL_STAIN_CATEGORIES = ["Histochem", "Special Stain"];

export const isSpecialStainCategory = (cat?: string | null): boolean =>
  SPECIAL_STAIN_CATEGORIES.some(
    (c) => c.toLowerCase() === (cat ?? "").toLowerCase(),
  );

/** Short label for the category tag — special stains collapse to "SS". */
export const catLabel = (cat?: string | null): string =>
  isSpecialStainCategory(cat) ? "SS" : cat || "—";

/**
 * The two system tests that are never a stain *order* in their own right: the
 * routine H&E every block gets automatically at grossing (crud/surgical_block
 * create_block) and the H&E recut, which is tracked by `is_recut` and priced
 * at 0. `system_code` is the stable handle — the master test can be renamed
 * from Admin → master data — so the name check is only a fallback for tests
 * created before system_code existed.
 */
export const HE_SYSTEM_CODES = ["HE_ROUTINE", "HE_RECUT"];

export const isRoutineHETest = (test?: StainTest | null): boolean =>
  HE_SYSTEM_CODES.includes(test?.system_code ?? "") ||
  !!test?.name?.includes("H&E");

/** A real in-house special-stain order (AFB, GMS, PAS, …): special-stain
 * category, done in this lab, and not the routine H&E. */
export const isSpecialStainOrder = (s: StainLike): boolean =>
  !s.test?.is_external &&
  isSpecialStainCategory(s.test?.category) &&
  !isRoutineHETest(s.test);

/** What the Internal Stain Orders worklist shows: special stains, plus recuts
 * (BlockGridView routes a pathologist's recut request to this page). IHC / ISH
 * / Molecular are ordered and tracked elsewhere, and the routine H&E has its
 * own page (Stain/RoutineHE). */
export const isRelevantStain = (s: StainLike): boolean =>
  !!s.is_recut || isSpecialStainOrder(s);

/** Billable to HosXP: every in-house test except the H&E pair — a recut is a
 * re-section of an existing block, not a separately charged test. Wider than
 * isRelevantStain on purpose: an in-house IHC still has to be keyed. */
export const isKeyableStain = (s: StainLike): boolean =>
  !s.is_recut && !s.test?.is_external && !isRoutineHETest(s.test);
