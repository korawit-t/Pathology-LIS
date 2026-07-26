import api from "./httpClient";

export interface UnifiedCaseItem {
  case_type: "surgical" | "gyne" | "nongyne" | "molecular";
  id: number;
  accession_no: string;
  hn: string | null;
  patient_name: string | null;
  hospital_name: string | null;
  department_name: string | null;
  medical_scheme_name: string | null;
  specimen: string | null;
  status: string;
  registered_at: string | null;
  clinician_name: string | null;
  is_express: boolean;
  consult: boolean;
  wf_grossed: boolean;
  wf_processed: boolean;
  wf_slide_prepped: boolean;
  wf_screened: boolean;
  wf_reported: boolean;
}

export interface UnifiedCaseListResponse {
  items: UnifiedCaseItem[];
  total: number;
}

const UnifiedCaseService = {
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    hospital_id?: number;
    medical_scheme_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<UnifiedCaseListResponse> => {
    const res = await api.get<UnifiedCaseListResponse>("/unified-cases", { params });
    return res.data;
  },
};

export default UnifiedCaseService;
