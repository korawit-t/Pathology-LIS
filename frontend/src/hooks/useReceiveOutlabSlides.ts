import { useCallback, useState } from "react";
import { message } from "antd";
import SurgicalBlockStainService from "../services/surgicalBlockStainService";

export interface ReceiveOutlabSlidesResult {
  receivedCount: number;
  failedRunIds: string[];
}

/**
 * Records the return of selected outlab slides, grouped by run — one
 * receiveOutlabRunDetails call per run, issued in parallel via
 * Promise.allSettled, then reports success / partial-failure / full-failure
 * via a message toast. This is CaseViewTab's original (more robust) "receive
 * selected" behavior, now shared with TrackingTab: TrackingTab only ever
 * operates on one expanded run at a time, so its call is just a 1-entry case
 * of the same grouped shape, not a UI redesign.
 */
export function useReceiveOutlabSlides() {
  const [receiving, setReceiving] = useState(false);

  const receiveSelected = useCallback(
    async (byRun: Record<string, number[]>): Promise<ReceiveOutlabSlidesResult> => {
      const entries = Object.entries(byRun).filter(([, ids]) => ids.length > 0);
      if (entries.length === 0) return { receivedCount: 0, failedRunIds: [] };

      const receivedCount = entries.reduce((sum, [, ids]) => sum + ids.length, 0);

      setReceiving(true);
      try {
        const results = await Promise.allSettled(
          entries.map(([runId, ids]) =>
            SurgicalBlockStainService.receiveOutlabRunDetails(Number(runId), ids),
          ),
        );
        const failedRunIds = entries
          .map(([runId]) => runId)
          .filter((_, i) => results[i].status === "rejected");

        if (failedRunIds.length === 0) {
          message.success(`Recorded return of ${receivedCount} slide(s)`);
        } else if (failedRunIds.length < entries.length) {
          message.warning(`Some slides recorded, but failed for run(s): ${failedRunIds.join(", ")}`);
        } else {
          message.error("Failed to record selected slide returns");
        }
        return { receivedCount, failedRunIds };
      } finally {
        setReceiving(false);
      }
    },
    [],
  );

  return { receiveSelected, receiving };
}
