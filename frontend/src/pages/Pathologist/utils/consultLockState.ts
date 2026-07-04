export interface ConsultLockInput {
  /** General lock from useSurgicalReport — true when the case is already
   * signed out with no draft in flight. */
  isLocked: boolean;
  isAddendumMode: boolean;
  isAwaitingApproval: boolean;
  isOutLabConsult: boolean;
  consultStatus?: string | null;
  consultPdfPath?: string | null;
}

export interface ConsultLockState {
  /** Locks the diagnosis text editor until the consult report is finalized.
   * Stays true even after the PDF is uploaded — the editor only unlocks once
   * the case is actually published (isLocked). */
  isConsultEditorLocked: boolean;
  /** Locks Save Draft + Finalize until the consult PDF is uploaded. Once the
   * PDF is set, this clears so the pathologist can finalize with it attached. */
  isConsultFinalizeLocked: boolean;
  isEditorLocked: boolean;
  isFinalizeLocked: boolean;
}

/**
 * Pure lock-state computation for the Surgical out-lab-consult workflow,
 * extracted out of SurgicalDiagnosisReportForm/index.tsx so it's unit
 * testable in isolation — this exact formula was the source of a real bug
 * (Sign-off staying locked forever after the consult PDF was uploaded, for a
 * case already signed out in a prior round).
 */
export function getConsultLockState({
  isLocked,
  isAddendumMode,
  isAwaitingApproval,
  isOutLabConsult,
  consultStatus,
  consultPdfPath,
}: ConsultLockInput): ConsultLockState {
  const isConsultEditorLocked = !!isOutLabConsult && consultStatus === "processing";

  const isConsultFinalizeLocked =
    !!isOutLabConsult && consultStatus === "processing" && !consultPdfPath;

  const isEditorLocked = (isLocked && !isAddendumMode) || isConsultEditorLocked;

  // Relax the general "already signed out" lock while a consult round is
  // active — once the consult PDF is uploaded, isConsultFinalizeLocked alone
  // should decide, no addendum click needed. isAwaitingApproval is
  // re-asserted unconditionally so this never bypasses an unrelated
  // pending-approval report on the same case.
  const isFinalizeLocked =
    (isLocked && !isAddendumMode && !isConsultEditorLocked) ||
    isConsultFinalizeLocked ||
    isAwaitingApproval;

  return { isConsultEditorLocked, isConsultFinalizeLocked, isEditorLocked, isFinalizeLocked };
}
