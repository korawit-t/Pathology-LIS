// frontend/src/pages/Dashboard/PendingTask/Pathologist/hooks/usePathologistStats.tsx
import { useState, useEffect, useCallback } from "react";
import PathologistService from "../../../../../services/pathologistService";
import { CASE_STATUS } from "../../../../../constants/lab.constants";
import logger from "../../../../../utils/logger";

export const usePathologistStats = (userId: number | undefined) => {
  const [stats, setStats] = useState({
    pendingGross: 0,
    pendingDiagnosis: 0,
    pendingSpecialStains: 0,
    pendingImmuno: 0,
    pendingPeerReview: 0,
    pendingAddendum: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const [
        registeredRes,
        formalinRes,
        inProgressRes,
        diagnosisRes,
        stainsRes,
        immunoRes,
        reviewRes,
        addendumRes
      ] = await Promise.all([
        // แยก call ทีละสถานะเพื่อหลีกเลี่ยงปัญหา URL encoding ของ "in progress"
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.REGISTERED),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.FORMALIN_FIXING),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.GROSS_IN_PROGRESS),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.SLIDE_SENT),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.PENDING_STAIN),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.PENDING_IHC),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.PENDING_REVIEW),
        PathologistService.getMyWorklist(userId, 0, 1, undefined, CASE_STATUS.PENDING_ADDENDUM),
      ]);

      setStats({
        pendingGross: (registeredRes.total || 0) + (formalinRes.total || 0) + (inProgressRes.total || 0),
        pendingDiagnosis: diagnosisRes.total || 0,
        pendingSpecialStains: stainsRes.total || 0,
        pendingImmuno: immunoRes.total || 0,
        pendingPeerReview: reviewRes.total || 0,
        pendingAddendum: addendumRes.total || 0,
      });
    } catch (err) {
      logger.error("Pathologist Stats Error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
    // Refresh every 1 minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { stats, loading, refresh: fetchData };
};
