import api from "./httpClient";

export interface TumorRegistry {
  id: number;
  surgical_case_id: number;
  topography_code?: string;
  topography_desc?: string;
  morphology_code?: string;
  morphology_desc?: string;
  grade?: string;
  pt?: string;
  pn?: string;
  pm?: string;
  created_at: string;
  updated_at: string;
}

export interface TumorRegistryUpsert {
  topography_code?: string;
  topography_desc?: string;
  morphology_code?: string;
  morphology_desc?: string;
  grade?: string;
  pt?: string;
  pn?: string;
  pm?: string;
}

export interface SuggestPreview {
  profile_name: string;
  provider: string;
  model: string;
  system_prompt: string;
  diagnosis_text: string | null;
}

export interface TumorRegistrySummary {
  total_registered: number;
  malignant_total: number;
  coverage_pct: number;
  by_topography: { code: string; desc: string; count: number }[];
  by_grade: { grade: string; count: number }[];
  by_pt: { pt: string; count: number }[];
}

const TumorRegistryService = {
  getByCase: async (caseId: number): Promise<TumorRegistry> => {
    const res = await api.get<TumorRegistry>(`/tumor-registries/${caseId}`);
    return res.data;
  },
  upsert: async (caseId: number, data: TumorRegistryUpsert): Promise<TumorRegistry> => {
    const res = await api.put<TumorRegistry>(`/tumor-registries/${caseId}`, data);
    return res.data;
  },
  getPreview: async (caseId: number): Promise<SuggestPreview> => {
    const res = await api.get<SuggestPreview>(`/tumor-registries/${caseId}/suggest-preview`);
    return res.data;
  },
  suggest: async (caseId: number): Promise<Partial<TumorRegistryUpsert>> => {
    const res = await api.post<Partial<TumorRegistryUpsert>>(`/tumor-registries/${caseId}/suggest`);
    return res.data;
  },
  getSummary: async (dateFrom?: string, dateTo?: string): Promise<TumorRegistrySummary> => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get<TumorRegistrySummary>("/tumor-registries/summary", { params });
    return res.data;
  },
};

export default TumorRegistryService;
