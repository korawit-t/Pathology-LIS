import api from "./httpClient";
import { ArchiveItem } from "./archiveService";
import {
  NongyneDiagnosisCreate,
  NongyneDiagnosisUpdate,
  NongyneDiagnosisRevise,
  NongyneDiagnosisResponse,
} from "../types/nongyneDiagnosis";

const BASE_URL = "/nongyne-diagnosis";

const NongyneDiagnosisService = {
  getByCaseId: async (caseId: number): Promise<NongyneDiagnosisResponse[]> => {
    const response = await api.get(`${BASE_URL}/case/${caseId}`);
    return response.data;
  },

  create: async (data: NongyneDiagnosisCreate): Promise<NongyneDiagnosisResponse> => {
    const response = await api.post(`${BASE_URL}`, data);
    return response.data;
  },

  update: async (
    id: number,
    data: NongyneDiagnosisUpdate
  ): Promise<NongyneDiagnosisResponse> => {
    const response = await api.put(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  revise: async (
    id: number,
    data: NongyneDiagnosisRevise
  ): Promise<NongyneDiagnosisResponse> => {
    const response = await api.post(`${BASE_URL}/${id}/revise`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE_URL}/${id}`);
  },

  previewReportPdf: async (caseId: number, isPending?: boolean, pendingReason?: string): Promise<Blob> => {
    const response = await api.get(`${BASE_URL}/case/${caseId}/preview-pdf`, {
      responseType: "blob",
      params: {
        ...(isPending !== undefined ? { is_pending: isPending } : {}),
        ...(pendingReason ? { pending_reason: pendingReason } : {}),
      },
    });
    return response.data;
  },

  getReportPdf: async (diagId: number): Promise<Blob> => {
    const response = await api.get(`${BASE_URL}/${diagId}/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  getAllReports: async (
    page: number = 1,
    size: number = 10,
    search?: string,
  ): Promise<any> => {
    const response = await api.get("/nongyne-cyto-reports", {
      params: { skip: (page - 1) * size, limit: size, search },
    });
    return response.data;
  },

  getPublishedReportPdf: async (reportId: number): Promise<Blob> => {
    const response = await api.get(`/nongyne-cyto-reports/${reportId}/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  getArchive: async (page = 1, size = 20, search?: string, hospital_id?: number, clinician?: string) => {
    const res = await api.get(`/nongyne-cyto-reports/archive`, {
      params: { page, size, search, hospital_id, clinician },
    });
    return res.data as { items: ArchiveItem[]; total: number };
  },
};

export default NongyneDiagnosisService;
