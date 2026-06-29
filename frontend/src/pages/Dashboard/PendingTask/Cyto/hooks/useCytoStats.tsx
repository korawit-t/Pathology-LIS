import { useState, useEffect, useCallback } from "react";
import GyneCytologyCaseService from "../../../../../services/gyneCytoCaseService";
import NongyneCytoCaseService from "../../../../../services/nongyneCytoCaseService";
import GyneStainService from "../../../../../services/gyneStainService";
import NongyneStainService from "../../../../../services/nongyneStainService";
import logger from "../../../../../utils/logger";

export const useCytoStats = () => {
  const [stats, setStats] = useState({
    gynePendingStain: 0,
    gynePendingDiagnosis: 0,
    nongynePendingStain: 0,
    nongynePendingDiagnosis: 0,
    cellBlockPending: 0,
    cellBlockProcessing: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [gyneQueue, gyneStained, nongyneQueue, nongyneStained, cbPending, cbProcessing] = await Promise.all([
        GyneStainService.getRegisteredQueue(),
        GyneCytologyCaseService.getAll({ status: "stained", limit: 1 }),
        NongyneStainService.getRegisteredQueue(),
        NongyneCytoCaseService.getAll({ status: "stained", limit: 1 }),
        NongyneCytoCaseService.getAll({ is_cell_block: true, cell_block_status: "pending", limit: 1 }),
        NongyneCytoCaseService.getAll({ is_cell_block: true, cell_block_status: "processing", limit: 1 }),
      ]);

      setStats({
        gynePendingStain: Array.isArray(gyneQueue) ? gyneQueue.length : 0,
        gynePendingDiagnosis: gyneStained?.total || 0,
        nongynePendingStain: Array.isArray(nongyneQueue) ? nongyneQueue.length : 0,
        nongynePendingDiagnosis: nongyneStained?.total || 0,
        cellBlockPending: cbPending?.total || 0,
        cellBlockProcessing: cbProcessing?.total || 0,
      });
    } catch (err) {
      logger.error("Cyto Stats Error:", err);
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
