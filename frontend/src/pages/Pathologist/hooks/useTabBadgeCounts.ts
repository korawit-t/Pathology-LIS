import { useState, useEffect, useCallback } from "react";
import api from "../../../services/httpClient";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import InternalConsultService from "../../../services/internalConsultService";
import { buildMyConsultBadgeParams } from "../components/MyConsultCases";
import { buildOutlabApprovalBadgeParams } from "../components/MyOutlabApprovals";
import logger from "../../../utils/logger";

interface ReadyStainCase {
  stains: Array<{ status: string }>;
}

/**
 * Counts for the worklist tabs whose panels are NOT mounted until their tab is
 * opened — antd `Tabs` renders a pane lazily, so a badge fed only by the
 * panel's own `onCountChange` stays at 0 until the user clicks the tab.
 * Fetching the totals here (limit: 1, read `total`) keeps every badge correct
 * on first paint without force-rendering hidden tables.
 *
 * Each request is caught on its own rather than on the `Promise.all`: the call
 * rejects as a unit, so one failing endpoint would otherwise blank every badge.
 */
export const useTabBadgeCounts = (userId: number | undefined) => {
  const [readyStainCount, setReadyStainCount] = useState(0);
  const [externalConsultCount, setExternalConsultCount] = useState(0);
  const [outlabApprovalCount, setOutlabApprovalCount] = useState(0);
  const [internalConsultCount, setInternalConsultCount] = useState(0);

  const refreshBadgeCounts = useCallback(async () => {
    if (!userId) return;

    await Promise.all([
      // Special/IHC — the endpoint returns whole cases, so the "still has an
      // outstanding stain" filter has to happen here rather than as a total.
      api
        .get<ReadyStainCase[]>("/surgical-block-stains/ready-additional", {
          params: { pathologist_id: userId },
        })
        .then((res) => {
          setReadyStainCount(
            res.data.filter((c) => c.stains.some((s) => s.status !== "completed")).length,
          );
        })
        .catch((err) => logger.error("Failed to count ready stains:", err)),

      SurgicalCaseService.getCases({ ...buildMyConsultBadgeParams(userId), skip: 0, limit: 1 })
        .then((res) => setExternalConsultCount(res.total || 0))
        .catch((err) => logger.error("Failed to count external consults:", err)),

      GyneCytologyCaseService.getAll({ ...buildOutlabApprovalBadgeParams(userId), skip: 0, limit: 1 })
        .then((res) => setOutlabApprovalCount(res.total || 0))
        .catch((err) => logger.error("Failed to count outlab approvals:", err)),

      InternalConsultService.getMyPending({ skip: 0, limit: 1 })
        .then((res) => setInternalConsultCount(res.total || 0))
        .catch((err) => logger.error("Failed to count internal consults:", err)),
    ]);
  }, [userId]);

  useEffect(() => {
    refreshBadgeCounts();
  }, [refreshBadgeCounts]);

  return {
    readyStainCount,
    externalConsultCount,
    outlabApprovalCount,
    internalConsultCount,
    // Handed to the panels as `onCountChange` so an action taken inside a tab
    // (approving an outlab result, answering a consult) updates its badge.
    // These are `useState` setters, so their identity is stable — the panels
    // list `onCountChange` in effect deps.
    setExternalConsultCount,
    setOutlabApprovalCount,
    setInternalConsultCount,
    refreshBadgeCounts,
  };
};
