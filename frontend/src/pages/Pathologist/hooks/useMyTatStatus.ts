import { useState, useEffect, useCallback } from "react";
import PathologistService from "../../../services/pathologistService";
import SystemSettingService from "../../../services/systemSettingService";
import HolidayService from "../../../services/holidayService";
import { CASE_STATUS } from "../../../constants/lab.constants";
import { calculateTATProgress } from "../../../utils/tatUtils";
import logger from "../../../utils/logger";
import type { SystemSetting } from "../../../types/system";
import type { WorklistRow } from "../SurgicalDiagnosisReportForm/SurgicalCaseWorklist";

export type TatRow = WorklistRow & { tatPercent: number; tatDisplay: string };

const DONE_STATUSES = [CASE_STATUS.SIGNED_OUT, CASE_STATUS.ADDENDUM_SIGNED, CASE_STATUS.CANCELLED];

const byStatus = (rows: TatRow[]): Record<string, number> =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

// Single source of truth for "my TAT overdue/warning" — shared by the
// PathologistDashboard KPI/alert and the Pathologist worklist's TAT-overdue
// tab, so the two always agree on the same cases (same pathologist scope,
// same business-day/holiday-aware calculation as calculateTATProgress).
export const useMyTatStatus = (userId: number | undefined) => {
  const [systemSettings, setSystemSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [overdueCases, setOverdueCases] = useState<TatRow[]>([]);
  const [warningCases, setWarningCases] = useState<TatRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    SystemSettingService.getSettings()
      .then(setSystemSettings)
      .catch((err) => logger.error("Failed to fetch system settings:", err));
    HolidayService.getHolidayDateList()
      .then(setHolidays)
      .catch((err) => logger.error("Failed to fetch holidays:", err));
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId || !systemSettings) return;
    setLoading(true);
    try {
      const data = await PathologistService.getMyWorklist(userId, 0, 500, "", "ALL");
      const items: WorklistRow[] = Array.isArray(data) ? data : (data.items ?? []);
      const overdue: TatRow[] = [];
      const warning: TatRow[] = [];

      items.forEach((row) => {
        if (DONE_STATUSES.includes(row.status as (typeof DONE_STATUSES)[number])) return;
        const tat = calculateTATProgress(row.registered_at ?? "", "SURGICAL", systemSettings, row.is_express, holidays);
        if (!tat) return;
        if (tat.isOverdue) {
          overdue.push({ ...row, tatPercent: tat.percent, tatDisplay: tat.displayTime });
        } else if (tat.percent > 75) {
          warning.push({ ...row, tatPercent: tat.percent, tatDisplay: tat.displayTime });
        }
      });

      overdue.sort((a, b) => b.tatPercent - a.tatPercent);
      warning.sort((a, b) => b.tatPercent - a.tatPercent);
      setOverdueCases(overdue);
      setWarningCases(warning);
    } catch {
      // silently fail — TAT status is non-critical
    } finally {
      setLoading(false);
    }
  }, [userId, systemSettings, holidays]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    overdueCases,
    warningCases,
    overdueByStatus: byStatus(overdueCases),
    warningByStatus: byStatus(warningCases),
    totalOverdue: overdueCases.length,
    totalWarning: warningCases.length,
    loading,
    refresh: fetchData,
  };
};
