import { useState, useEffect, useCallback } from "react";
import SurgicalCaseService from "../../../../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../../../../services/gyneCytoCaseService";
import NongyneCytologyCaseService from "../../../../../services/nongyneCytoCaseService";
import logger from "../../../../../utils/logger";

const CONSULT_PARAMS = { skip: 0, limit: 1, is_out_lab_consult: true, consult_status: "pending" };

export const useOutlabConsultStats = () => {
  const [stats, setStats] = useState({ surgicalPending: 0, gynePending: 0, nongynePending: 0 });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes, nRes] = await Promise.allSettled([
        SurgicalCaseService.getCases(CONSULT_PARAMS as any),
        GyneCytologyCaseService.getAll(CONSULT_PARAMS as any),
        NongyneCytologyCaseService.getAll(CONSULT_PARAMS as any),
      ]);
      setStats({
        surgicalPending: sRes.status === "fulfilled" ? (sRes.value.total ?? 0) : 0,
        gynePending: gRes.status === "fulfilled" ? (gRes.value.total ?? 0) : 0,
        nongynePending: nRes.status === "fulfilled" ? (nRes.value.total ?? 0) : 0,
      });
    } catch (err) {
      logger.error("Outlab Consult Stats Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { stats, loading, refresh: fetchData };
};
