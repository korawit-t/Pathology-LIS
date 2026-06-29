import { useState } from "react";
import { App } from "antd";
import ApprovalService from "../../../services/approvalService";
import {
  ReportApproveRequest,
  SurgicalReport,
  ApprovalLogResponse,
} from "../../../types/surgicalReport";

export const useApproval = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<ApprovalLogResponse[]>([]);

  /**
   * ฟังก์ชันส่งการตัดสินใจอนุมัติ/ตีกลับ
   */
  const processApproval = async (
    reportId: number,
    payload: ReportApproveRequest,
    type: "surgical" | "gyne" | "nongyne" = "surgical",
    onSuccess?: (updatedReport: unknown) => void,
  ) => {
    setLoading(true);
    try {
      const updatedReport = await ApprovalService.processDecision(
        reportId,
        payload,
        type,
      );

      const actionLabel =
        payload.action === "APPROVED"
          ? "อนุมัติ"
          : payload.action === "REJECTED"
            ? "ปฏิเสธ"
            : "ส่งกลับแก้ไข";

      message.success(`ดำเนินการ${actionLabel}รายงานเรียบร้อยแล้ว`);

      if (onSuccess) onSuccess(updatedReport);
      return updatedReport;
    } catch (error: any) {
      // 🚩 เปลี่ยนมาใช้ message.error แทน notification
      const errorDetail =
        error.response?.data?.detail || "โปรดลองใหม่อีกครั้งในภายหลัง";
      message.error(`เกิดข้อผิดพลาด: ${errorDetail}`);

      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * ดึงประวัติ Logs
   */
  const fetchApprovalLogs = async (reportId: number) => {
    setLoading(true);
    try {
      const data = await ApprovalService.getApprovalHistory(reportId);
      setLogs(data);
      return data;
    } catch (error: any) {
      message.warning("ไม่สามารถดึงข้อมูลประวัติการอนุมัติได้");
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    logs,
    processApproval,
    fetchApprovalLogs,
  };
};
