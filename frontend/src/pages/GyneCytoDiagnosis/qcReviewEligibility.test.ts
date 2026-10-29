import { describe, expect, it } from "vitest";
import { qcSelfReviewConflict } from "./qcReviewEligibility";
import { canReviewGyneQc } from "../../constants/roles.constants";

const caseData = { review_requested_by_id: 10, cytotechnologist_id: 20 };

describe("canReviewGyneQc", () => {
  it("allows pathologists and senior pathologists", () => {
    expect(canReviewGyneQc(["pathologist"])).toBe(true);
    expect(canReviewGyneQc(["senior_pathologist"])).toBe(true);
  });

  it("refuses admin, lab manager and cytotech without a pathologist role", () => {
    expect(canReviewGyneQc(["admin"])).toBe(false);
    expect(canReviewGyneQc(["lab_manager"])).toBe(false);
    expect(canReviewGyneQc(["cytotechnologist"])).toBe(false);
    expect(canReviewGyneQc(["admin", "pathologist"])).toBe(true);
  });
});

describe("qcSelfReviewConflict", () => {
  it("blocks whoever sent the case for review", () => {
    expect(qcSelfReviewConflict(10, caseData, [])).toMatch(/sent this case/);
  });

  it("blocks the assigned screener", () => {
    expect(qcSelfReviewConflict(20, caseData, [])).toMatch(/screening cytotechnologist/);
  });

  it("blocks anyone signed on in a cytotech role", () => {
    const signers = [{ user_id: 30, role: "co-sign cytotechnologist" }];
    expect(qcSelfReviewConflict(30, caseData, signers)).toMatch(/screener/);
  });

  it("lets the assigned pathologist review even with a signature on their row", () => {
    const signers = [
      { user_id: 20, role: "cytotechnologist", signed_at: "2026-10-29T08:00:00" },
      { user_id: 40, role: "primary", signed_at: "2026-10-29T08:00:00" },
    ];
    expect(qcSelfReviewConflict(40, caseData, signers)).toBeNull();
  });

  it("does not match a null submitter against a user", () => {
    expect(
      qcSelfReviewConflict(40, { review_requested_by_id: null, cytotechnologist_id: null }, []),
    ).toBeNull();
  });
});
