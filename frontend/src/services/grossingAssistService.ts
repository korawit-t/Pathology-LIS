import api from "./httpClient";

export interface GrossingAssistPreview {
  profile_name: string;
  provider: string;
  model: string;
  system_prompt: string;
  specimens_text: string | null;
}

export interface GrossingAssistResult {
  feedback: string;
}

const GrossingAssistService = {
  getPreview: async (caseId: number): Promise<GrossingAssistPreview> => {
    const res = await api.get<GrossingAssistPreview>(`/surgical-cases/${caseId}/grossing-assist-preview`);
    return res.data;
  },
  suggest: async (caseId: number): Promise<GrossingAssistResult> => {
    const res = await api.post<GrossingAssistResult>(`/surgical-cases/${caseId}/grossing-assist`);
    return res.data;
  },
};

export default GrossingAssistService;
