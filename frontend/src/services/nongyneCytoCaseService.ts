import logger from "../utils/logger";
import api from "./httpClient";
import {
  NongyneCytologyCase,
  NongyneCytologyCaseCreate,
  NongyneCytologyCaseUpdate,
} from "../types/nongyne";

export interface NongyneCytologyListResponse {
  items: NongyneCytologyCase[];
  total: number;
}

const NongyneCytologyCaseService = {
  /**
   * ดึงรายการเคสทั้งหมด
   */
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
    hospital_id?: number;
    medical_scheme_id?: number;
    assigned_to_me?: boolean;
    is_out_lab_consult?: boolean;
    consult_status?: string;
    is_reported?: boolean;
    is_cell_block?: boolean;
    cell_block_status?: string;
    date_from?: string;
    date_to?: string;
    stain_status?: string;
    is_screened?: boolean;
    is_pending?: boolean;
  }): Promise<NongyneCytologyListResponse> => {
    const res = await api.get<NongyneCytologyListResponse>("/nongyne-cytology", {
      params,
    });
    return res.data;
  },

  /**
   * ดึงข้อมูลเคสรายบุคคลด้วย ID
   */
  getById: async (id: number): Promise<NongyneCytologyCase> => {
    const res = await api.get<NongyneCytologyCase>(`/nongyne-cytology/${id}`);
    return res.data;
  },

  /**
   * สร้างเคสใหม่
   */
  create: async (
    payload: NongyneCytologyCaseCreate,
  ): Promise<NongyneCytologyCase> => {
    const res = await api.post<NongyneCytologyCase>("/nongyne-cytology", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลเคสหรือเปลี่ยนสถานะ
   */
  update: async (
    id: number,
    payload: NongyneCytologyCaseUpdate,
  ): Promise<NongyneCytologyCase> => {
    const res = await api.patch<NongyneCytologyCase>(
      `/nongyne-cytology/${id}`,
      payload,
    );
    return res.data;
  },

  /**
   * ลบเคส
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`/nongyne-cytology/${id}`);
  },

  uploadRequestFile: async (caseId: number, file: File): Promise<{ message: string; file_id: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/nongyne-cytology/${caseId}/request-files`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  deleteRequestFile: async (fileId: number): Promise<void> => {
    await api.delete(`/nongyne-cytology/request-files/${fileId}`);
  },

  downloadRequestFile: async (fileId: number, fileName: string): Promise<void> => {
    try {
      const response = await api.get(`/nongyne-cytology/request-files/${fileId}`, { responseType: "blob" });
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
    const response = await api.get(`/nongyne-cytology/request-files/${fileId}`, { responseType: "arraybuffer" });
    return response.data;
  },

  getTatStats: async (dateFrom?: string, dateTo?: string) => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get("/nongyne-cytology/tat-stats", { params });
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
};

export default NongyneCytologyCaseService;
