import logger from "../utils/logger";
import api from "./httpClient";
import {
  PublicSearchPaginationResponse,
  UnifiedPublicSearchItem,
  SurgicalCase,
  SurgicalCaseCreatePayload,
  SurgicalCaseUpdatePayload,
  SurgicalSpecimenUpdatePayload,
} from "../types/surgical";

interface CancelCasePayload {
  reason: string;
}

const SurgicalCaseService = {
  // 1. ดึงรายการเคสทั้งหมด
  getCases: async (params: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
    pathologist_id?: number;
    hospital_id?: number;
    medical_scheme_id?: number;
    has_gross_draft?: boolean;
    is_out_lab_consult?: boolean;
    consult_status?: string;
    is_reported?: boolean;
    date_from?: string;
    date_to?: string;
  }): Promise<{ items: SurgicalCase[]; total: number }> => {
    const res = await api.get<{ items: SurgicalCase[]; total: number }>(
      "/surgical-cases",
      { params },
    );
    return res.data;
  },

  // 2. ดึงข้อมูลเคสเดียว
  getCaseById: async (id: number | string): Promise<SurgicalCase> => {
    const res = await api.get<SurgicalCase>(`/surgical-cases/${id}`);
    return res.data;
  },

  // 3. สร้างเคสใหม่
  createCase: async (
    payload: SurgicalCaseCreatePayload,
  ): Promise<SurgicalCase> => {
    const res = await api.post<SurgicalCase>("/surgical-cases", payload);
    return res.data;
  },

  // 4. อัปเดตเคส
  updateCase: async (
    id: number | string,
    payload: SurgicalCaseUpdatePayload,
  ): Promise<SurgicalCase> => {
    const res = await api.patch<SurgicalCase>(`/surgical-cases/${id}`, payload);
    return res.data;
  },

  // 5. Submit Grossing
  submitGrossing: async (
    id: number | string,
    payload: Pick<
      SurgicalCaseUpdatePayload,
      "gross_examiner_id" | "gross_assistant_id" | "is_grossed"
    >,
  ): Promise<SurgicalCase> => {
    const res = await api.patch<SurgicalCase>(
      `/surgical-cases/${id}/gross`,
      payload,
    );
    return res.data;
  },

  // 6. อัปเดต gross ราย specimen
  updateSpecimenGross: async (
    specimenId: number,
    payload: SurgicalSpecimenUpdatePayload,
  ): Promise<void> => {
    await api.patch(`/surgical-specimens/${specimenId}/gross`, payload);
  },

  // 7. ลบเคส
  deleteCase: async (id: number | string): Promise<void> => {
    await api.delete(`/surgical-cases/${id}`);
  },

  // 8. Cancel เคส
  cancelCase: async (
    id: number | string,
    payload: CancelCasePayload,
  ): Promise<SurgicalCase> => {
    const res = await api.post<SurgicalCase>(
      `/surgical-cases/${id}/cancel`,
      payload,
    );
    return res.data;
  },

  // 9. สืบค้นผลตรวจ (Public/Clinician Search)
  searchPublicCases: async (
    query: string,
    page: number = 1,
    size: number = 10,
  ): Promise<PublicSearchPaginationResponse> => {
    const res = await api.get<PublicSearchPaginationResponse>(
      `/surgical-cases/search-public`,
      {
        params: { q: query, page, size },
      },
    );
    return res.data;
  },

  searchPublicAllCases: async (
    query: string,
    page: number = 1,
    size: number = 10,
  ): Promise<{ items: UnifiedPublicSearchItem[]; total: number; page: number; size: number }> => {
    const res = await api.get(`/surgical-cases/search-public-all`, { params: { q: query, page, size } });
    return res.data;
  },

  // 10. ดูเคสทั้งหมดของโรงพยาบาล (Hospital Staff)
  listHospitalCases: async (params: {
    q?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    size?: number;
    exclude_published?: boolean;
  }): Promise<PublicSearchPaginationResponse> => {
    const res = await api.get<PublicSearchPaginationResponse>(
      `/surgical-cases/hospital-cases`,
      { params },
    );
    return res.data;
  },

  getHospitalUnreadCount: async (): Promise<number> => {
    const res = await api.get<{ unread: number }>(`/surgical-cases/hospital-cases/unread-count`);
    return res.data.unread;
  },

  // Consult PDF Endpoints
  uploadConsultPdf: async (caseId: number, file: File, receivedAt?: string): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    if (receivedAt) formData.append("received_at", receivedAt);
    const res = await api.post(`/surgical-cases/${caseId}/consult-pdf`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  deleteConsultPdf: async (caseId: number): Promise<void> => {
    await api.delete(`/surgical-cases/${caseId}/consult-pdf`);
  },

  downloadConsultPdf: async (caseId: number, fileName: string): Promise<void> => {
    try {
      const response = await api.get(`/surgical-cases/${caseId}/consult-pdf`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      logger.error("Error downloading consult PDF:", error);
      throw error;
    }
  },

  // 10. อัปโหลดไฟล์ Request
  uploadRequestFile: async (caseId: number, file: File): Promise<{ message: string, file_id: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/surgical-cases/${caseId}/request-files`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },

  // 11. ลบไฟล์ Request
  deleteRequestFile: async (fileId: number): Promise<void> => {
    await api.delete(`/surgical-cases/request-files/${fileId}`);
  },

  // 12. ดาวน์โหลดไฟล์ Request
  downloadRequestFile: async (fileId: number, fileName: string): Promise<void> => {
    try {
      const response = await api.get(`/surgical-cases/request-files/${fileId}`, {
        responseType: "blob",
      });
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

  // 13. ดาวน์โหลดไฟล์ Request เป็น Blob (สำหรับ Preview ในเบราว์เซอร์)
  downloadRequestFileBlob: async (fileId: number): Promise<ArrayBuffer> => {
    const response = await api.get(`/surgical-cases/request-files/${fileId}`, {
      responseType: "arraybuffer",
    });
    return response.data;
  },

  // 14. ดึงรายชื่อเคสที่ยังไม่ได้ระบุที่เก็บชิ้นเนื้อ
  getUnstoredCases: async (): Promise<SurgicalCase[]> => {
    const res = await api.get("/surgical-cases/unstored/specimens");
    return res.data;
  },

  // 15. ดึงรายชื่อเคสที่ระบุที่เก็บชิ้นเนื้อไปแล้ว
  getStoredCases: async (
    skip: number = 0,
    limit: number = 50,
    search?: string
  ): Promise<{ items: SurgicalCase[]; total: number }> => {
    const res = await api.get("/surgical-cases/stored/specimens", {
      params: { skip, limit, search },
    });
    return res.data;
  },

  // 16. อัปเดตสถานะและกล่องเก็บชิ้นเนื้อ (Bulk)
  bulkUpdateStorageStatus: async (caseIds: number[], containerNumber: string): Promise<SurgicalCase[]> => {
    const res = await api.post("/surgical-cases/storage/bulk-update", {
      case_ids: caseIds,
      container_number: containerNumber,
    });
    return res.data;
  },

  // 17. ลบชิ้นเนื้อออกจากที่เก็บ (Dispose)
  bulkDisposeSpecimens: async (caseIds: number[]): Promise<SurgicalCase[]> => {
    const res = await api.post("/surgical-cases/storage/bulk-dispose", {
      case_ids: caseIds,
    });
    return res.data;
  },

  // 18. ดึงรายชื่อเคสที่ถูกทำลายทิ้งไปแล้ว
  getDisposedCases: async (
    skip: number = 0,
    limit: number = 50,
    search?: string
  ): Promise<{ items: SurgicalCase[]; total: number }> => {
    const res = await api.get("/surgical-cases/disposed/specimens", {
      params: { skip, limit, search },
    });
    return res.data;
  },

  getTatStats: async (dateFrom?: string, dateTo?: string, pathologistId?: number) => {
    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (pathologistId != null) params.pathologist_id = pathologistId;
    const res = await api.get("/surgical-cases/tat-stats", { params });
    return res.data as {
      avg_tat_days: number;
      routine_avg_days: number;
      express_avg_days: number;
      total_reported: number;
      on_time_count: number;
      on_time_pct: number;
      target_days: number;
      express_target_days: number;
      distribution: { lt3: number; t3_5: number; t5_10: number; gt10: number };
      monthly: Array<{ month: string; case_count: number; avg_days: number }>;
    };
  },

  getCancerRegistrySummary: async (dateFrom?: string, dateTo?: string) => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get("/surgical-cases/cancer-registry-summary", { params });
    return res.data as {
      total: number;
      malignant: number;
      benign: number;
      indeterminate: number;
      malignancy_rate: number;
      monthly: Array<{ month: string; malignant: number; benign: number; indeterminate: number }>;
      by_specimen: Array<{ specimen_name: string; count: number }>;
    };
  },

  getWorkloadSummary: async (dateFrom?: string, dateTo?: string, pathologistId?: number) => {
    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (pathologistId != null) params.pathologist_id = pathologistId;
    const res = await api.get("/surgical-cases/workload-summary", { params });
    return res.data as {
      total_cases: number;
      total_blocks: number;
      he_slides: number;
      special_stain_slides: number;
      ihc_slides: number;
      consult_cases: number;
      signed_cases?: number;
    };
  },

  getWorkloadDaily: async (dateFrom?: string, dateTo?: string, pathologistId?: number) => {
    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (pathologistId != null) params.pathologist_id = pathologistId;
    const res = await api.get("/surgical-cases/workload-daily", { params });
    return res.data as Array<{
      date: string;
      cases: number;
      he_slides: number;
      special_stain_slides: number;
      ihc_slides: number;
    }>;
  },

  getWorkloadIHCTop: async (dateFrom?: string, dateTo?: string, pathologistId?: number, limit = 10) => {
    const params: Record<string, string | number> = { limit };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (pathologistId != null) params.pathologist_id = pathologistId;
    const res = await api.get("/surgical-cases/workload-ihc-top", { params });
    return res.data as Array<{ name: string; count: number }>;
  },

  // 19. สรุปยอดค่าใช้จ่ายรายโรงพยาบาล
  getHospitalBillingSummary: async (
    startDate: string,
    endDate: string,
    hospitalId?: number
  ): Promise<unknown> => {
    const res = await api.get("/surgical-cases/hospital-billing-summary", {
      params: { start_date: startDate, end_date: endDate, hospital_id: hospitalId },
    });
    return res.data;
  },

  // 20. ดาวน์โหลดใบสรุปยอดค่าใช้จ่ายรายโรงพยาบาล เป็น PDF
  downloadHospitalBillingSummaryPdf: async (
    startDate: string,
    endDate: string,
    hospitalId?: number,
    fileName: string = "hospital_billing_summary.pdf"
  ): Promise<void> => {
    try {
      const response = await api.get("/surgical-cases/hospital-billing-summary/pdf", {
        params: { start_date: startDate, end_date: endDate, hospital_id: hospitalId },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      logger.error("Error downloading billing summary outline:", error);
      throw error;
    }
  },
};

export default SurgicalCaseService;
