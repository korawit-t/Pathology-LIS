import api from "./httpClient";
import {
  SurgicalReport,
  ApprovalLogResponse,
  ReportApproveRequest,
} from "../types/surgicalReport";

const ApprovalService = {
  /**
   * 🚩 ส่งผลการตัดสินใจอนุมัติหรือตีกลับ (Approve / Reject / Request Changes)
   * แยกเป็น Surgical และ Gyne ตาม Backend Router ใหม่
   */
  processDecision: async (
    reportId: number,
    payload: ReportApproveRequest,
    type: "surgical" | "gyne" | "nongyne" = "surgical",
  ): Promise<unknown> => {
    const response = await api.post(
      `/approvals/${type}/${reportId}`,
      payload,
    );
    return response.data;
  },

  /**
   * 🚩 ดึงประวัติการดำเนินการทั้งหมดของ Report ฉบับนั้น (Audit Logs)
   * ใช้ Endpoint: GET /approvals/{report_id}/logs
   */
  getApprovalHistory: async (
    reportId: number,
  ): Promise<ApprovalLogResponse[]> => {
    const response = await api.get<ApprovalLogResponse[]>(
      `/approvals/${reportId}/logs`,
    );
    return response.data;
  },

  /**
   * (เพิ่มเติม) ดึงรายการ Report ที่รอการอนุมัติ (Pending Approval)
   * ถ้าคุณทำ API กรองสถานะไว้ที่ Backend
   */
  getPendingReports: async (
    page: number = 1,
    size: number = 10,
    search?: string,
  ): Promise<unknown> => {
    const response = await api.get(`/approvals/pending`, {
      params: { page, size, search },
    });
    return response.data;
  },
};

export default ApprovalService;
