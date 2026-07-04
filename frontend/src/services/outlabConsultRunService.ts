import api from "./httpClient";

export interface OutlabConsultCaseSelection {
  case_type: string;
  case_id: number;
  accession_no?: string;
  patient_name?: string;
  block_code?: string;
}

export interface OutlabConsultRunCreate {
  destination_lab: string;
  cases: OutlabConsultCaseSelection[];
}

export interface OutlabConsultRunDetailResponse {
  id: number;
  run_id: number;
  case_type: string;
  case_id: number;
  accession_no?: string;
  patient_name?: string;
  block_code?: string;
  report_out_at?: string;
  remark?: string;
  created_at: string;
  block_returned: boolean;
  block_returned_at?: string;
  block_returned_by_id?: number;
  // Live consult_status of the underlying case (not the run's own status) —
  // lets the UI show this specific case's own progress within a multi-case run.
  case_consult_status?: string;
}

export interface OutlabConsultRunResponse {
  id: number;
  run_no: string;
  destination_lab?: string;
  operator_id?: number;
  sent_at: string;
  status: string;
  received_at?: string;
  received_by_id?: number;
  tracking_number?: string;
  details: OutlabConsultRunDetailResponse[];
}

const OutlabConsultRunService = {
  createRun: async (payload: OutlabConsultRunCreate): Promise<OutlabConsultRunResponse> => {
    const res = await api.post<OutlabConsultRunResponse>("/outlab-consult-runs", payload);
    return res.data;
  },

  getRuns: async (params?: { skip?: number; limit?: number }): Promise<OutlabConsultRunResponse[]> => {
    const res = await api.get<OutlabConsultRunResponse[]>("/outlab-consult-runs", { params });
    return res.data;
  },

  receiveRun: async (runId: number): Promise<OutlabConsultRunResponse> => {
    const res = await api.patch<OutlabConsultRunResponse>(`/outlab-consult-runs/${runId}/receive`);
    return res.data;
  },

  returnBlock: async (detailId: number): Promise<OutlabConsultRunDetailResponse> => {
    const res = await api.patch<OutlabConsultRunDetailResponse>(`/outlab-consult-runs/details/${detailId}/return-block`);
    return res.data;
  },

  updateTracking: async (runId: number, trackingNumber: string | null): Promise<OutlabConsultRunResponse> => {
    const res = await api.patch<OutlabConsultRunResponse>(`/outlab-consult-runs/${runId}/tracking`, { tracking_number: trackingNumber });
    return res.data;
  },

  deleteRun: async (runId: number): Promise<void> => {
    await api.delete(`/outlab-consult-runs/${runId}`);
  },
};

export default OutlabConsultRunService;
