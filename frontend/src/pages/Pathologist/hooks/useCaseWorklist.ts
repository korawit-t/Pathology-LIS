import { useState, useEffect, useCallback } from "react";
import { message } from "antd";
import PathologistService from "../../../services/pathologistService";
import { CASE_STATUS } from "../../../constants/lab.constants";
import SystemSettingService from "../../../services/systemSettingService";
import SurgicalReportService from "../../../services/surgicalReportService";
import HolidayService from "../../../services/holidayService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import logger from "../../../utils/logger";
import type { SystemSetting } from "../../../types/system";

// Same bucket definitions as GyneCytoWorklist.tsx's buildTabParams for
// "stained" (Pending Report), "co_sign" (Sign Required) and "express".
// Fetched as a union of case ids (not summed) so a case appearing in more
// than one bucket — e.g. an express case awaiting the pathologist's
// signature — is only counted once.
const fetchGyneBadgeTotal = async (userId: number): Promise<number> => {
  const paramSets = [
    { status: "stained", assigned_user_id: userId, exclude_signed_by: userId },
    { signer_id: userId, exclude_status: "published" },
    { assigned_user_id: userId, is_express: true },
  ];
  const results = await Promise.all(
    paramSets.map((params) =>
      GyneCytologyCaseService.getAll({ ...params, limit: 500 }),
    ),
  );
  const ids = new Set<number>();
  results.forEach((r) => r.items.forEach((c) => ids.add(c.id)));
  return ids.size;
};

export const useSurgicalCaseWorklist = (userId: number | undefined) => {
  const [data, setData] = useState({
    surgical: { items: [], total: 0 },
    gyne: { items: [], total: 0 },
    nonGyne: { items: [], total: 0 },
  });

  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [currentStatus, setCurrentStatus] = useState<string>(
    CASE_STATUS.SLIDE_SENT,
  );
  const [slideSentTotal, setSlideSentTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [coSignTotal, setCoSignTotal] = useState(0);
  const [expressTotal, setExpressTotal] = useState(0);
  const [systemSettings, setSystemSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);

  const fetchTabCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const [slideSentRes, pendingRes, coSignRes, expressRes] = await Promise.all([
        PathologistService.getMyWorklist(userId, 0, 1, "", CASE_STATUS.SLIDE_SENT),
        PathologistService.getMyWorklist(userId, 0, 1, "", undefined, true),
        SurgicalReportService.getPendingCosignWorklist(1, 1, ""),
        PathologistService.getMyWorklist(userId, 0, 1, "", undefined, undefined, true, true),
      ]);
      setSlideSentTotal(slideSentRes.total || 0);
      setPendingTotal(pendingRes.total || 0);
      setCoSignTotal(coSignRes.total || 0);
      setExpressTotal(expressRes.total || 0);
    } catch {
      /* ignore */
    }
  }, [userId]);

  const fetchSettings = useCallback(async () => {
    try {
      const settings = await SystemSettingService.getSettings();
      setSystemSettings(settings);
    } catch (err) {
      logger.error("Failed to fetch system settings:", err);
    }
  }, []);

  // 🚩 เพิ่มฟังก์ชันสำหรับโหลดวันหยุดจาก DB
  const fetchHolidays = useCallback(async () => {
    try {
      const dates = await HolidayService.getHolidayDateList();
      setHolidays(dates);
    } catch (err) {
      logger.error("Failed to fetch holidays:", err);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchHolidays();
    fetchTabCounts();
  }, [fetchSettings, fetchHolidays, fetchTabCounts]);

  const fetchWorklist = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const currentPage = pagination.current;
      const pageSize = pagination.pageSize;

      type WorklistResponse = { items: unknown[]; total: number };
      // 1. เตรียมตัวแปรสำหรับพักข้อมูล
      let surgicalResponse: WorklistResponse = { items: [], total: 0 };
      let gyneResponse: WorklistResponse = { items: [], total: 0 };
      let nonGyneResponse: WorklistResponse = { items: [], total: 0 };

      // 🚩 กรณีที่ 1: ถ้าเป็น Tab Consult/Co-signer (แยกไปเรียก Service รายงาน)
      if (currentStatus === "CO_SIGNER") {
        surgicalResponse = await SurgicalReportService.getPendingCosignWorklist(
          pagination.current,
          pageSize,
          searchText,
        );
      } else {
        let statusParam: string | string[] | undefined = currentStatus;

        if (currentStatus === CASE_STATUS.SLIDE_SENT) {
          statusParam = CASE_STATUS.SLIDE_SENT;
        } else if (currentStatus === CASE_STATUS.PENDING_DIAGNOSIS) {
          statusParam = undefined;
        } else if (currentStatus === "ALL" || currentStatus === "EXPRESS") {
          statusParam = undefined;
        }

        surgicalResponse = await PathologistService.getMyWorklist(
          userId,
          skip,
          pageSize,
          searchText,
          statusParam,
          currentStatus === CASE_STATUS.PENDING_DIAGNOSIS ? true : undefined,
          currentStatus === "EXPRESS" ? true : undefined,
          currentStatus === "EXPRESS" ? true : undefined,
        );
      }

      // 🚩 3. ดึงข้อมูล Gyne เพิ่มเติม
      // หมายเหตุ: ปรับ Parameter ตาม API ของคุณ (เช่น assigned_to_me)
      try {
        const gyneRaw = await GyneCytologyCaseService.getAll({
          assigned_to_me: true,
          limit: pageSize,
          search: searchText,
        });

        // ✅ Normalization: ปรับ Data ให้หน้าตาเหมือน Surgical
        // เพื่อให้ SurgicalCaseWorklist แสดงผลได้โดยไม่ Error
        gyneResponse = {
          items: gyneRaw.items.map((item) => ({
            ...item,
            case_type: "GYNE", // 🚩 สำคัญ: เอาไว้แยกประเภทในตาราง
            registered_at: item.created_at, // Gyne ใช้ created_at
            patient_name: item.patient?.name || "N/A",
            patient_hn: item.hn,
          })),
          total: gyneRaw.total || 0,
        };

        // Badge total = union of Pending Report + Sign Required + Express
        // (same buckets as the Gyne Cytology worklist's own tabs), deduped by
        // case id so a case counted under more than one bucket isn't counted twice.
        gyneResponse.total = await fetchGyneBadgeTotal(userId);
      } catch (gErr) {
        logger.error("Failed to fetch Gyne worklist:", gErr);
      }

      // ดึงข้อมูล Non-Gyne เพิ่มเติม
      try {
        const nonGyneRaw = await NongyneCytologyCaseService.getAll({
          assigned_to_me: true,
          is_reported: false,
          exclude_signed_by: userId,
          limit: pageSize,
          search: searchText,
        });

        nonGyneResponse = {
          items: nonGyneRaw.items.map((item) => ({
            ...item,
            case_type: "NON_GYNE",
            registered_at: item.created_at, // Use created_at
            patient_name: item.patient?.name || "N/A",
            patient_hn: item.hn,
          })),
          total: nonGyneRaw.total || 0,
        };
      } catch (ngErr) {
        logger.error("Failed to fetch Non-Gyne worklist:", ngErr);
      }

      // 4. Update State ทั้งหมด
      if (currentStatus === CASE_STATUS.SLIDE_SENT) {
        setSlideSentTotal(surgicalResponse.total || 0);
      }
      setData({
        surgical: {
          items: surgicalResponse.items || [],
          total: surgicalResponse.total || 0,
        },
        gyne: {
          items: gyneResponse.items || [],
          total: gyneResponse.total || 0,
        },
        nonGyne: {
          items: nonGyneResponse.items || [],
          total: nonGyneResponse.total || 0,
        },
      });
    } catch (error) {
      logger.error("Fetch error:", error);
      message.error("ไม่สามารถดึงข้อมูลจาก Server ได้");
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    pagination.current,
    pagination.pageSize,
    searchText,
    currentStatus, // เมื่อค่านี้เปลี่ยน (จากการกด Tab) useEffect จะสั่งรันฟังก์ชันนี้ใหม่ทันที
  ]);

  // ✅ รวม useEffect เป็นชุดเดียว
  useEffect(() => {
    // ถ้ามีการพิมพ์ค้นหา ให้หน่วงเวลา 500ms
    // แต่ถ้าเปลี่ยน Status หรือ เปลี่ยนหน้า ให้โหลดทันที (delay = 0)
    const delay = searchText ? 500 : 0;

    const timer = setTimeout(() => {
      fetchWorklist();
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    pagination.current,
    pagination.pageSize,
    currentStatus,
    searchText,
  ]);

  return {
    filteredData: {
      surgical: data.surgical.items,
      gyne: data.gyne.items,
      nonGyne: data.nonGyne.items,
      total: data.surgical.total,
      gyneTotal: data.gyne.total,
      nonGyneTotal: data.nonGyne.total,
    },
    slideSentTotal,
    pendingTotal,
    coSignTotal,
    expressTotal,
    systemSettings,
    holidays,
    loading,
    pagination,
    setPagination,
    setSearchText,
    currentStatus,
    setCurrentStatus,
    refresh: fetchWorklist,
  };
};
