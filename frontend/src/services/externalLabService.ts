import api from "./httpClient";

export interface ExternalLab {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

const ExternalLabService = {
  getExternalLabs: async (activeOnly: boolean = false): Promise<ExternalLab[]> => {
    const res = await api.get<ExternalLab[]>("/external-labs", { params: { active_only: activeOnly, limit: 100 } });
    return res.data;
  },

  createExternalLab: async (payload: { name: string; description?: string }): Promise<ExternalLab> => {
    const res = await api.post<ExternalLab>("/external-labs", payload);
    return res.data;
  },

  updateExternalLab: async (id: number, payload: Partial<{ name: string; description?: string; is_active: boolean }>): Promise<ExternalLab> => {
    const res = await api.put<ExternalLab>(`/external-labs/${id}`, payload);
    return res.data;
  },

  deleteExternalLab: async (id: number): Promise<void> => {
    await api.delete(`/external-labs/${id}`);
  },
};

export default ExternalLabService;
