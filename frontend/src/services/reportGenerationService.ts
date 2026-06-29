import api from "./httpClient";

export interface SpecimenDraftData {
  specimen_id: number;
  microscopic_description?: string;
}

export interface ReportGenDraftData {
  specimens: SpecimenDraftData[];
}

export interface ReportGenRequest {
  source: "gross_and_micro" | "gross_only" | "micro_only";
  diagnosis_mode: "individual" | "integrated" | "clean";
  draft_data?: ReportGenDraftData;
}

export interface SpecimenResult {
  specimen_id: number;
  specimen_label: string;
  specimen_name: string;
  microscopic_description: string;
  diagnosis: string;
}

export interface ReportGenResponse {
  mode: string;
  specimens: SpecimenResult[];
  case_diagnosis_text: string | null;
}

export interface ReportGenPreview {
  profile_name: string;
  provider: string;
  model: string;
  system_prompt: string;
  user_message: string;
}

const ReportGenerationService = {
  getPreview: async (caseId: number, payload: ReportGenRequest): Promise<ReportGenPreview> => {
    const res = await api.post<ReportGenPreview>(
      `/surgical-cases/${caseId}/generate-report-preview`,
      payload
    );
    return res.data;
  },

  generate: async (caseId: number, payload: ReportGenRequest): Promise<ReportGenResponse> => {
    const res = await api.post<ReportGenResponse>(
      `/surgical-cases/${caseId}/generate-report`,
      payload
    );
    return res.data;
  },
};

export default ReportGenerationService;
