import api from "./httpClient";

export interface SurgicalCaseCorrelationRecord {
  id: number;
  from_case_id: number;
  to_case_id: number;
  from_accession_no: string;
  to_accession_no: string;
  correlation_result: string;
  comment: string | null;
  correlated_by: { id: number; full_name: string } | null;
  correlated_at: string;
}

export interface SurgicalCaseCorrelationCreatePayload {
  from_case_id: number;
  to_case_id: number;
  from_accession_no: string;
  to_accession_no: string;
  correlation_result: string;
  comment?: string;
}

export interface SurgicalCaseCorrelationUpdatePayload {
  correlation_result?: string;
  comment?: string;
}

const SurgicalCaseCorrelationService = {
  getByCase: async (caseId: number): Promise<SurgicalCaseCorrelationRecord[]> => {
    const res = await api.get<SurgicalCaseCorrelationRecord[]>(
      `/surgical-case-correlations/by-case/${caseId}`,
    );
    return res.data;
  },

  create: async (
    payload: SurgicalCaseCorrelationCreatePayload,
  ): Promise<SurgicalCaseCorrelationRecord> => {
    const res = await api.post<SurgicalCaseCorrelationRecord>(
      "/surgical-case-correlations",
      payload,
    );
    return res.data;
  },

  update: async (
    correlationId: number,
    payload: SurgicalCaseCorrelationUpdatePayload,
  ): Promise<SurgicalCaseCorrelationRecord> => {
    const res = await api.put<SurgicalCaseCorrelationRecord>(
      `/surgical-case-correlations/${correlationId}`,
      payload,
    );
    return res.data;
  },

  delete: async (correlationId: number): Promise<void> => {
    await api.delete(`/surgical-case-correlations/${correlationId}`);
  },
};

export default SurgicalCaseCorrelationService;
