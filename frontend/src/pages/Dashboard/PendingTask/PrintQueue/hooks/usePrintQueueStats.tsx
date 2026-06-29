import { useState, useEffect, useCallback } from "react";
import SurgicalReportService from "../../../../../services/surgicalReportService";
import GyneReportService from "../../../../../services/gyneReportService";
import NongyneReportService from "../../../../../services/nongyneReportService";
import logger from "../../../../../utils/logger";

export const usePrintQueueStats = () => {
  const [stats, setStats] = useState({
    surgicalPending: 0,
    gynePending: 0,
    nongynePending: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [surgicalRes, gyneRes, nongyneRes] = await Promise.all([
        SurgicalReportService.getAllReports(1, 1, undefined, "published", false),
        GyneReportService.getAllReports(1, 1, undefined, "published", false),
        NongyneReportService.getAllReports(1, 1, undefined, "published", false),
      ]);
      setStats({
        surgicalPending: surgicalRes.total || 0,
        gynePending: gyneRes.total || 0,
        nongynePending: nongyneRes.total || 0,
      });
    } catch (err) {
      logger.error("Print Queue Stats Error:", err);
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
