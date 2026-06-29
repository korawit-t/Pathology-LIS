// frontend/src/pages/Dashboard/PendingTask/Surgical/hooks/useSurgicalStats.tsx
import { useState, useEffect, useCallback } from "react";
import SurgicalBlockService from "../../../../../services/surgicalBlockService";
import SurgicalCaseService from "../../../../../services/surgicalCaseService";
import SurgicalSpecimenService from "../../../../../services/surgicalSpecimenService";
import { CASE_STATUS } from "../../../../../constants/lab.constants";
import logger from "../../../../../utils/logger";
import type { SurgicalBlock } from "../../../../../types/surgical";

export const useSurgicalStats = () => {
  const [stats, setStats] = useState({
    registeredCount: 0,
    pendingFixation: 0,
    draftCasesCount: 0,
    decalCount: 0,
    pendingProcessing: 0,
    additionalSectionsCount: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [decalRes, registeredRes, fixationRes, draftRes, processingRes, addlSections] = await Promise.all([
        SurgicalBlockService.getBlocks({ skip: 0, limit: 1000 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.REGISTERED, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.FORMALIN_FIXING, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.GROSS_IN_PROGRESS, limit: 1 }),
        SurgicalCaseService.getCases({ status: CASE_STATUS.GROSSED, limit: 1 }),
        SurgicalSpecimenService.getSpecimensNeedingAdditionalSections(),
      ]);

      const items = decalRes.items || [];
      const currentDecal = items.filter((b: SurgicalBlock) => b.is_decal).length;

      setStats({
        registeredCount: registeredRes.total || 0,
        pendingFixation: fixationRes.total || 0,
        draftCasesCount: draftRes.total || 0,
        decalCount: currentDecal,
        pendingProcessing: processingRes.total || 0,
        additionalSectionsCount: addlSections.length,
      });
    } catch (err) {
      logger.error("Surgical Stats Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // ตั้งเวลา Refresh ทุกๆ 1 นาทีเพื่อให้ Dashboard ดู Active
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { stats, loading, refresh: fetchData };
};
