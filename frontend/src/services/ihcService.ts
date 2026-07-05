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

export interface IHCMarkerExtraFieldOptionCreate {
  option_label: string;
  option_value: string;
  display_order?: number;
}

export interface IHCMarkerExtraFieldOptionUpdate {
  option_label?: string;
  option_value?: string;
  display_order?: number;
}

export interface IHCMarkerExtraFieldOptionResponse {
  id: number;
  field_id: number;
  option_label: string;
  option_value: string;
  display_order: number;
}

export type IHCExtraFieldType = "select" | "numeric" | "text";

export interface IHCMarkerExtraFieldCreate {
  ap_test_id: number;
  field_key: string;
  label: string;
  field_type: IHCExtraFieldType;
  numeric_unit?: string | null;
  display_order?: number;
}

export interface IHCMarkerExtraFieldUpdate {
  field_key?: string;
  label?: string;
  field_type?: IHCExtraFieldType;
  numeric_unit?: string | null;
  display_order?: number;
}

export interface IHCMarkerExtraFieldResponse {
  id: number;
  ap_test_id: number;
  field_key: string;
  label: string;
  field_type: IHCExtraFieldType;
  numeric_unit?: string | null;
  display_order: number;
  options: IHCMarkerExtraFieldOptionResponse[];
}

export interface IHCMarkerExtraFieldWithValue extends IHCMarkerExtraFieldResponse {
  value?: string | null;
}

export interface IHCResultExtraValueUpsert {
  surgical_specimen_id: number;
  field_id: number;
  value?: string | null;
}

export interface IHCResultExtraValueResponse {
  id: number;
  ihc_result_id: number;
  field_id: number;
  value?: string | null;
  updated_at: string;
}

export interface IHCMarkerWithResult {
  ap_test_id: number;
  marker_name: string;
  options: IHCMarkerOptionResponse[];
  result?: IHCResultResponse | null;
  extra_fields: IHCMarkerExtraFieldWithValue[];
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

  // Admin: marker extra fields
  getExtraFields: (apTestId: number): Promise<IHCMarkerExtraFieldResponse[]> =>
    api.get(`/ihc/markers/${apTestId}/extra-fields`).then((r) => r.data),

  createExtraField: (apTestId: number, payload: IHCMarkerExtraFieldCreate): Promise<IHCMarkerExtraFieldResponse> =>
    api.post(`/ihc/markers/${apTestId}/extra-fields`, payload).then((r) => r.data),

  updateExtraField: (fieldId: number, payload: IHCMarkerExtraFieldUpdate): Promise<IHCMarkerExtraFieldResponse> =>
    api.patch(`/ihc/extra-fields/${fieldId}`, payload).then((r) => r.data),

  deleteExtraField: (fieldId: number): Promise<void> =>
    api.delete(`/ihc/extra-fields/${fieldId}`).then(() => {}),

  createExtraFieldOption: (fieldId: number, payload: IHCMarkerExtraFieldOptionCreate): Promise<IHCMarkerExtraFieldOptionResponse> =>
    api.post(`/ihc/extra-fields/${fieldId}/options`, payload).then((r) => r.data),

  updateExtraFieldOption: (optionId: number, payload: IHCMarkerExtraFieldOptionUpdate): Promise<IHCMarkerExtraFieldOptionResponse> =>
    api.patch(`/ihc/extra-field-options/${optionId}`, payload).then((r) => r.data),

  deleteExtraFieldOption: (optionId: number): Promise<void> =>
    api.delete(`/ihc/extra-field-options/${optionId}`).then(() => {}),

  upsertExtraValue: (payload: IHCResultExtraValueUpsert): Promise<IHCResultExtraValueResponse | null> =>
    api.put(`/ihc/result-extra-values`, payload).then((r) => r.data),

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
