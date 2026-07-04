import { getConsultLockState } from "./consultLockState";

const base = {
  isLocked: false,
  isAddendumMode: false,
  isAwaitingApproval: false,
  isOutLabConsult: false,
  consultStatus: undefined as string | undefined,
  consultPdfPath: undefined as string | undefined,
};

describe("getConsultLockState", () => {
  it("no consult flagged: only the general lock applies", () => {
    const locked = getConsultLockState({ ...base, isLocked: true });
    expect(locked.isConsultEditorLocked).toBe(false);
    expect(locked.isConsultFinalizeLocked).toBe(false);
    expect(locked.isEditorLocked).toBe(true);
    expect(locked.isFinalizeLocked).toBe(true);

    const unlocked = getConsultLockState({ ...base, isLocked: false });
    expect(unlocked.isEditorLocked).toBe(false);
    expect(unlocked.isFinalizeLocked).toBe(false);
  });

  it("dispatched, no PDF yet: editor and finalize both locked", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true,
      isOutLabConsult: true,
      consultStatus: "processing",
      consultPdfPath: null,
    });
    expect(state.isConsultEditorLocked).toBe(true);
    expect(state.isConsultFinalizeLocked).toBe(true);
    expect(state.isEditorLocked).toBe(true);
    expect(state.isFinalizeLocked).toBe(true);
  });

  it("Fix 1 regression: PDF uploaded on a case already signed out in a prior round unlocks Sign-off without needing addendum mode", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true, // case already "signed out" from round 1, no draft in flight
      isAddendumMode: false, // pathologist never clicked "Add New Report"
      isOutLabConsult: true,
      consultStatus: "processing",
      consultPdfPath: "/uploads/consults/consult.pdf",
    });
    expect(state.isConsultFinalizeLocked).toBe(false);
    expect(state.isFinalizeLocked).toBe(false); // <- this was stuck `true` forever before Fix 1
    // Diagnosis editor stays locked throughout the whole consult round regardless.
    expect(state.isEditorLocked).toBe(true);
  });

  it("admin-approval guard is never bypassed by an active consult round", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true,
      isAwaitingApproval: true,
      isOutLabConsult: true,
      consultStatus: "processing",
      consultPdfPath: "/uploads/consults/consult.pdf",
    });
    expect(state.isFinalizeLocked).toBe(true);
  });

  it("addendum mode bypasses the general lock as before, independent of consult", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true,
      isAddendumMode: true,
      isOutLabConsult: false,
    });
    expect(state.isEditorLocked).toBe(false);
    expect(state.isFinalizeLocked).toBe(false);
  });

  it("consult round already received: no consult lock applies, general lock governs as usual", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true,
      isOutLabConsult: true,
      consultStatus: "received",
      consultPdfPath: "/uploads/consults/consult.pdf",
    });
    expect(state.isConsultEditorLocked).toBe(false);
    expect(state.isConsultFinalizeLocked).toBe(false);
    expect(state.isFinalizeLocked).toBe(true); // still signed out, general lock applies
  });

  it("flagged for consult but not yet dispatched (consult_status pending): no consult lock yet", () => {
    const state = getConsultLockState({
      ...base,
      isLocked: true,
      isOutLabConsult: true,
      consultStatus: "pending",
      consultPdfPath: null,
    });
    expect(state.isConsultEditorLocked).toBe(false);
    expect(state.isConsultFinalizeLocked).toBe(false);
    expect(state.isFinalizeLocked).toBe(true); // general lock still applies as a normal signed-out case
  });
});
