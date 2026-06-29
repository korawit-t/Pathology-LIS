import { useState, useEffect, useCallback } from "react";
import api from "../../../../../services/httpClient";
import logger from "../../../../../utils/logger";

export const useImmunoStats = () => {
  const [stats, setStats] = useState({
    pendingIHC: 0,
    pendingSpecialStain: 0,
    pendingIHCInternal: 0,
    pendingSpecialStainInternal: 0,
    pendingIHCOutlab: 0,
    pendingSpecialStainOutlab: 0,
    pendingMolecularOutlab: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/surgical-cases/immuno-stats");
      setStats({
        pendingIHC: res.data.pending_ihc ?? 0,
        pendingSpecialStain: res.data.pending_special_stain ?? 0,
        pendingIHCInternal: res.data.pending_ihc_internal ?? 0,
        pendingSpecialStainInternal: res.data.pending_special_stain_internal ?? 0,
        pendingIHCOutlab: res.data.pending_ihc_outlab ?? 0,
        pendingSpecialStainOutlab: res.data.pending_special_stain_outlab ?? 0,
        pendingMolecularOutlab: res.data.pending_molecular_outlab ?? 0,
      });
    } catch (err) {
      logger.error("Immuno Stats Error:", err);
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
