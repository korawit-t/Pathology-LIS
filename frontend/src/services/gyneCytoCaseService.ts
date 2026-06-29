import logger from "../utils/logger";
import api from "./httpClient";
import {
  GyneCytologyCase,
  GyneCytologyCaseCreate,
  GyneCytologyCaseUpdate,
} from "../types/gyne-cytology";

// 🚩 1. เพิ่ม Interface สำหรับโครงสร้าง List Response
export interface GyneCytologyListResponse {
  items: GyneCytologyCase[];
  total: number;
}

const GyneCytologyCaseService = {
  /**
   * ดึงรายการเคสทั้งหมด (🚩 ปรับ Return Type เป็น GyneCytologyListResponse)
   */
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
    hospital_id?: number;
    medical_scheme_id?: number;
    assigned_to_me?: boolean;
    assigned_user_id?: number;
    signer_id?: number;
    exclude_signed_by?: number;
    signed_by?: number;
    is_reviewed?: boolean;
    is_out_lab_consult?: boolean;
    is_out_lab?: boolean;
    consult_status?: string;
    is_reported?: boolean;
    date_from?: string;
    date_to?: string;
    review_reason?: string;
  }): Promise<GyneCytologyListResponse> => {
    // 🚩 2. ปรับ Generic type ใน api.get ให้ตรงกัน
    const res = await api.get<GyneCytologyListResponse>("/gyne-cytology", {
      params,
    });
    return res.data;
  },

  /**
   * ดึงข้อมูลเคสรายบุคคลด้วย ID
   */
  getById: async (id: number): Promise<GyneCytologyCase> => {
    const res = await api.get<GyneCytologyCase>(`/gyne-cytology/${id}`);
    return res.data;
  },

  /**
   * สร้างเคสใหม่ (ลงทะเบียนรับสิ่งส่งตรวจ)
   */
  create: async (
    payload: GyneCytologyCaseCreate,
  ): Promise<GyneCytologyCase> => {
    const res = await api.post<GyneCytologyCase>("/gyne-cytology", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลเคสหรือเปลี่ยนสถานะ
   */
  update: async (
    id: number,
    payload: GyneCytologyCaseUpdate,
  ): Promise<GyneCytologyCase> => {
    const res = await api.patch<GyneCytologyCase>(
      `/gyne-cytology/${id}`,
      payload,
    );
    return res.data;
  },

  /**
   * ลบเคส (Soft Delete หรือ Hard Delete ตาม Backend)
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`/gyne-cytology/${id}`);
  },

  /**
   * ดึงรายการรายงานทั้งหมดที่รออนุมัติ (Filter by status=pending)
   */
  getPendingReports: async (
    page: number = 1,
    size: number = 10,
    search?: string,
  ): Promise<{ items: GyneCytologyCase[]; total: number }> => {
    const res = await api.get("/gyne-cytology", {
      params: {
        skip: (page - 1) * size,
        limit: size,
        search,
        status: "pending_approval",
      },
    });
    return res.data;
  },

  /**
   * อัปเดตพยาธิแพทย์ผู้รับผิดชอบเคส
   */
  assignPathologist: async (
    caseId: number,
    pathologistId: number,
  ): Promise<GyneCytologyCase> => {
    const res = await api.patch<GyneCytologyCase>(`/gyne-cytology/${caseId}`, {
      pathologist_id: pathologistId,
    });
    return res.data;
  },

  getPendingCosignWorklist: async (
    page: number = 1,
    size: number = 20,
    search?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; size: number }> => {
    const res = await api.get("/gyne-cyto-reports/pending-cosign", {
      params: { page, size, search },
    });
    return res.data;
  },

  cosign: async (
    reportId: number,
    payload: { agreement?: string; agreement_note?: string; comment?: string },
  ): Promise<unknown> => {
    const res = await api.post(`/approvals/gyne/${reportId}/cosign`, payload);
    return res.data;
  },

  addSigner: async (
    reportId: number,
    payload: { user_id: number; role: string; consult_note?: string },
  ): Promise<unknown> => {
    const res = await api.post(`/approvals/gyne/${reportId}/add-signer`, payload);
    return res.data;
  },

  uploadRequestFile: async (caseId: number, file: File): Promise<{ message: string; file_id: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/gyne-cytology/${caseId}/request-files`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  deleteRequestFile: async (fileId: number): Promise<void> => {
    await api.delete(`/gyne-cytology/request-files/${fileId}`);
  },

  downloadRequestFile: async (fileId: number, fileName: string): Promise<void> => {
    try {
      const response = await api.get(`/gyne-cytology/request-files/${fileId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      logger.error("Error downloading file:", error);
      throw error;
    }
  },

  downloadRequestFileBlob: async (fileId: number): Promise<ArrayBuffer> => {
    const response = await api.get(`/gyne-cytology/request-files/${fileId}`, { responseType: "arraybuffer" });
    return response.data;
  },

  uploadOutlabReport: async (caseId: number, file: File): Promise<GyneCytologyCase> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post<GyneCytologyCase>(
      `/gyne-cytology/${caseId}/outlab-report`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data;
  },

  downloadOutlabReport: async (caseId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-cytology/${caseId}/outlab-report`, { responseType: "blob" });
    return res.data;
  },

  uploadOutlabTestResult: async (caseId: number, file: File): Promise<GyneCytologyCase> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post<GyneCytologyCase>(
      `/gyne-cytology/${caseId}/outlab-test-result`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data;
  },

  downloadOutlabTestResult: async (caseId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-cytology/${caseId}/outlab-test-result`, { responseType: "blob" });
    return res.data;
  },
};

export default GyneCytologyCaseService;
