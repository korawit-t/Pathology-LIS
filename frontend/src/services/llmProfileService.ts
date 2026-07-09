import api from "./httpClient";

export interface LlmProfile {
  id: number;
  display_name: string;
  provider: string;
  model: string;
  base_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LlmProfileCreate {
  display_name: string;
  provider: string;
  model: string;
  base_url?: string | null;
  is_active?: boolean;
}

export type LlmProfileUpdate = Partial<LlmProfileCreate>;

export interface LlmProfileTestRequest {
  provider: string;
  model: string;
  base_url?: string | null;
}

export interface LlmProfileTestResult {
  success: boolean;
  detail: string;
}

const LlmProfileService = {
  list: async (): Promise<LlmProfile[]> => {
    const res = await api.get<LlmProfile[]>("/llm-profiles");
    return res.data;
  },
  testConnection: async (data: LlmProfileTestRequest): Promise<LlmProfileTestResult> => {
    const res = await api.post<LlmProfileTestResult>("/llm-profiles/test-connection", data);
    return res.data;
  },
  create: async (data: LlmProfileCreate): Promise<LlmProfile> => {
    const res = await api.post<LlmProfile>("/llm-profiles", data);
    return res.data;
  },
  update: async (id: number, data: LlmProfileUpdate): Promise<LlmProfile> => {
    const res = await api.put<LlmProfile>(`/llm-profiles/${id}`, data);
    return res.data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/llm-profiles/${id}`);
  },
};

export default LlmProfileService;
