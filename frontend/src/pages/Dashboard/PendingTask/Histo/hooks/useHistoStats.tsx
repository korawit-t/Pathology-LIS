import { useState, useEffect, useCallback } from "react";
import SurgicalCaseService from "../../../../../services/surgicalCaseService";
import SurgicalBlockStainService from "../../../../../services/surgicalBlockStainService";
import { CASE_STATUS } from "../../../../../constants/lab.constants";
import logger from "../../../../../utils/logger";

export const useHistoStats = () => {
  const [stats, setStats] = useState({
    pendingEmbedding: 0,
    pendingSectioning: 0,
    pendingStaining: 0,
    pendingDispatch: 0,
    pendingRecut: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [embeddingRes, sectioningRes, stainingRes, dispatchRes, recutCount] = await Promise.all([
        SurgicalCaseService.getCases({ status: CASE_STATUS.PROCESSED, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.EMBEDDED, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.SECTIONED, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.STAINED, limit: 1 }),
        SurgicalBlockStainService.getRecutCount(),
      ]);

      setStats({
        pendingEmbedding: embeddingRes.total || 0,
        pendingSectioning: sectioningRes.total || 0,
        pendingStaining: stainingRes.total || 0,
        pendingDispatch: dispatchRes.total || 0,
        pendingRecut: recutCount,
      });
    } catch (err) {
      logger.error("Histo Stats Error:", err);
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
