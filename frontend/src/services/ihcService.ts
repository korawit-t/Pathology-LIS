import api from "./httpClient";

export interface IHCMarkerOptionCreate {
  ap_test_id: number;
  option_label: string;
  option_value: string;
  display_order?: number;
  has_numeric?: string | null;
  numeric_unit?: string | null;
}

export interface IHCMarkerOptionUpdate {
  option_label?: string;
  option_value?: string;
  display_order?: number;
  has_numeric?: string | null;
  numeric_unit?: string | null;
}

export interface IHCMarkerOptionResponse {
  id: number;
  ap_test_id: number;
  option_label: string;
  option_value: string;
  display_order: number;
  has_numeric?: string | null;
  numeric_unit?: string | null;
}

export interface IHCResultUpsert {
  surgical_specimen_id: number;
  ap_test_id: number;
  selected_option?: string | null;
  numeric_value?: number | null;
  note?: string | null;
}

export interface IHCResultResponse {
  id: number;
  surgical_specimen_id: number;
  ap_test_id: number;
  selected_option?: string | null;
  numeric_value?: number | null;
  note?: string | null;
  updated_at: string;
}

export interface IHCMarkerWithResult {
  ap_test_id: number;
  marker_name: string;
  options: IHCMarkerOptionResponse[];
  result?: IHCResultResponse | null;
}

export interface NongyneIHCResultUpsert {
  case_id: number;
  ap_test_id: number;
  selected_option?: string | null;
  numeric_value?: number | null;
  note?: string | null;
}

export interface NongyneIHCResultResponse {
  id: number;
  case_id: number;
  ap_test_id: number;
  selected_option?: string | null;
  numeric_value?: number | null;
  note?: string | null;
  updated_at: string;
}

export interface NongyneIHCMarkerWithResult {
  ap_test_id: number;
  marker_name: string;
  options: IHCMarkerOptionResponse[];
  result?: NongyneIHCResultResponse | null;
}

export const IHCService = {
  // Admin: marker options
  getOptions: (apTestId: number): Promise<IHCMarkerOptionResponse[]> =>
    api.get(`/ihc/markers/${apTestId}/options`).then((r) => r.data),

  createOption: (apTestId: number, payload: IHCMarkerOptionCreate): Promise<IHCMarkerOptionResponse> =>
    api.post(`/ihc/markers/${apTestId}/options`, payload).then((r) => r.data),

  updateOption: (optionId: number, payload: IHCMarkerOptionUpdate): Promise<IHCMarkerOptionResponse> =>
    api.patch(`/ihc/options/${optionId}`, payload).then((r) => r.data),

  deleteOption: (optionId: number): Promise<void> =>
    api.delete(`/ihc/options/${optionId}`).then(() => {}),

  // Pathologist: panel + results
  getPanel: (specimenId: number): Promise<IHCMarkerWithResult[]> =>
    api.get(`/ihc/specimens/${specimenId}/panel`).then((r) => r.data),

  upsertResult: (payload: IHCResultUpsert): Promise<IHCResultResponse> =>
    api.put(`/ihc/results`, payload).then((r) => r.data),

  deleteResult: (resultId: number): Promise<void> =>
    api.delete(`/ihc/results/${resultId}`).then(() => {}),

  // Non-Gyne IHC (case-level)
  getNongynePanel: (caseId: number): Promise<NongyneIHCMarkerWithResult[]> =>
    api.get(`/ihc/nongyne-cases/${caseId}/panel`).then((r) => r.data),

  upsertNongyneResult: (payload: NongyneIHCResultUpsert): Promise<NongyneIHCResultResponse> =>
    api.put(`/ihc/nongyne-results`, payload).then((r) => r.data),

  deleteNongyneResult: (resultId: number): Promise<void> =>
    api.delete(`/ihc/nongyne-results/${resultId}`).then(() => {}),
};
