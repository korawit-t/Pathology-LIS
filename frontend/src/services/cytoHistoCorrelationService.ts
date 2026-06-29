import api from "./httpClient";

export interface NongyneCaseRef {
  id: number;
  accession_no: string;
  specimen_type: string;
  collection_site: string | null;
  registered_at: string;
  status: string;
}

export interface CorrelationRecord {
  id: number;
  case_type: "gyne" | "nongyne";
  nongyne_case_id: number | null;
  gyne_case_id: number | null;
  cytology_accession_no: string | null;
  surgical_accession_no: string;
  cytology_diagnosis_snapshot: string | null;
  histology_diagnosis: string | null;
  correlation_result: string;
  comment: string | null;
  correlated_by: { id: number; full_name: string } | null;
  correlated_at: string;
  // present only in list endpoint
  cytology_report_id?: number | null;
  surgical_report_id?: number | null;
}

export interface SurgicalContextItem {
  case_type: "gyne" | "nongyne";
  nongyne_case: NongyneCaseRef;         // used for both gyne and nongyne (field name kept for backward compat)
  cytology_diagnosis: string | null;
  correlation: CorrelationRecord | null;
}

export interface CorrelationCreatePayload {
  case_type: "gyne" | "nongyne";
  nongyne_case_id?: number;
  gyne_case_id?: number;
  surgical_accession_no: string;
  surgical_case_id?: number;
  cytology_diagnosis_snapshot?: string;
  histology_diagnosis?: string;
  correlation_result: string;
  comment?: string;
}

export interface CorrelationUpdatePayload {
  histology_diagnosis?: string;
  correlation_result?: string;
  comment?: string;
}

const CytoHistoCorrelationService = {
  getByNongyneCase: async (caseId: number): Promise<CorrelationRecord[]> => {
    const res = await api.get<CorrelationRecord[]>(`/cyto-histo-correlations/by-nongyne-case/${caseId}`);
    return res.data;
  },

  getByGyneCase: async (caseId: number): Promise<CorrelationRecord[]> => {
    const res = await api.get<CorrelationRecord[]>(`/cyto-histo-correlations/by-gyne-case/${caseId}`);
    return res.data;
  },

  getSurgicalContext: async (patientId: number, surgicalAccession: string): Promise<SurgicalContextItem[]> => {
    const res = await api.get<SurgicalContextItem[]>(
      `/cyto-histo-correlations/surgical-context/${patientId}`,
      { params: { surgical_accession: surgicalAccession } },
    );
    return res.data;
  },

  create: async (payload: CorrelationCreatePayload): Promise<CorrelationRecord> => {
    const res = await api.post<CorrelationRecord>("/cyto-histo-correlations", payload);
    return res.data;
  },

  update: async (correlationId: number, payload: CorrelationUpdatePayload): Promise<CorrelationRecord> => {
    const res = await api.put<CorrelationRecord>(`/cyto-histo-correlations/${correlationId}`, payload);
    return res.data;
  },

  delete: async (correlationId: number): Promise<void> => {
    await api.delete(`/cyto-histo-correlations/${correlationId}`);
  },
};

export default CytoHistoCorrelationService;
