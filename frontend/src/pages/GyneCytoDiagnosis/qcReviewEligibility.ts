import type { GyneCytologyCase } from "../../types/gyne-cytology";

// Mirrors CYTOTECH_SIGNER_ROLES in backend/app/crud/gyne_cyto_report.py.
const CYTOTECH_SIGNER_ROLES = ["cytotechnologist", "co-sign cytotechnologist"];

/** Why this user may not give the QC verdict on this case, or null.
 *
 * Mirrors `_self_review_conflict` in backend/app/crud/gyne_cyto_report.py so
 * the buttons are disabled for the same people the API refuses — the backend
 * stays the authority (and its 403 detail is shown if the two ever drift).
 * A signed_at on someone's row is deliberately not a disqualifier: with
 * "Require All Signatures" off, the screener's sign-off stamps every signer. */
export const qcSelfReviewConflict = (
  userId: number | undefined,
  caseData: Pick<
    GyneCytologyCase,
    "review_requested_by_id" | "cytotechnologist_id"
  > | null,
  signers: { user_id: number; role: string }[] | null | undefined,
): string | null => {
  if (!userId || !caseData) return null;
  if (Number(caseData.review_requested_by_id) === Number(userId))
    return "You sent this case for review — another pathologist has to review it.";
  if (Number(caseData.cytotechnologist_id) === Number(userId))
    return "You are this case's screening cytotechnologist — another pathologist has to review it.";
  if (
    (signers ?? []).some(
      (s) =>
        Number(s.user_id) === Number(userId) &&
        CYTOTECH_SIGNER_ROLES.includes(s.role),
    )
  )
    return "You are signed on as this case's screener — another pathologist has to review it.";
  return null;
};
