import api from "./httpClient";
import {
  InternalConsult,
  InternalConsultCreate,
  InternalConsultRespondRequest,
  InternalConsultPromoteRequest,
  InternalConsultListResponse,
  ConsultCaseType,
} from "../types/internalConsult";

const InternalConsultService = {
  createConsult: async (payload: InternalConsultCreate): Promise<InternalConsult> => {
    const res = await api.post<InternalConsult>("/internal-consults", payload);
    return res.data;
  },

  getMyPending: async (params?: { skip?: number; limit?: number }): Promise<InternalConsultListResponse> => {
    const res = await api.get<InternalConsultListResponse>("/internal-consults/my-pending", { params });
    return res.data;
  },

  getForReport: async (caseType: ConsultCaseType, reportId: number): Promise<InternalConsult[]> => {
    const res = await api.get<InternalConsult[]>(`/internal-consults/report/${caseType}/${reportId}`);
    return res.data;
  },

  respond: async (consultId: number, payload: InternalConsultRespondRequest): Promise<InternalConsult> => {
    const res = await api.patch<InternalConsult>(`/internal-consults/${consultId}/respond`, payload);
    return res.data;
  },

  promote: async (consultId: number, payload: InternalConsultPromoteRequest): Promise<InternalConsult> => {
    const res = await api.patch<InternalConsult>(`/internal-consults/${consultId}/promote`, payload);
    return res.data;
  },

  close: async (consultId: number): Promise<InternalConsult> => {
    const res = await api.patch<InternalConsult>(`/internal-consults/${consultId}/close`, {});
    return res.data;
  },
};

export default InternalConsultService;
