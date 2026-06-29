import { useState, useEffect, useCallback } from "react";
import api from "../../../services/httpClient";

export interface DashboardSummary {
  pipeline: Record<string, number>;
  tat_overdue: { total: number; by_status: Record<string, number> };
  tat_warning: { total: number; by_status: Record<string, number> };
  tat_settings: { routine_days: number; express_days: number };
}

const EMPTY: DashboardSummary = {
  pipeline: {},
  tat_overdue: { total: 0, by_status: {} },
  tat_warning: { total: 0, by_status: {} },
  tat_settings: { routine_days: 10, express_days: 3 },
};

export const useDashboardSummary = () => {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardSummary>("/surgical-cases/dashboard-summary");
      setSummary(res.data);
    } catch {
      // silently fail — dashboard summary is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { summary, loading, refresh: fetchData };
};
