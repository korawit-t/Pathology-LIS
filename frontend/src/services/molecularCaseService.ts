import api from "./httpClient";

export interface MolecularCasePatientRef {
  id: number;
  hn?: string | null;
  name: string;
  ln?: string | null;
  gender?: string | null;
  cid?: string | null;
  title?: { id: number; title: string } | null;
}

export interface MolecularCaseResponse {
  id: number;
  accession_no: string;
  parent_case_id?: number | null;
  parent_case_accession_no?: string | null;
  patient_name?: string | null;
  hn?: string | null;
  stain_id?: number | null;
  ap_test_id: number;
  test_name?: string | null;
  status: string;
  is_outlab: boolean;
  result_text?: string | null;
  outlab_pdf_path?: string | null;
  outlab_pdf_received_at?: string | null;
  registrar_id: number;
  registered_at?: string | null;
  reported_by_id?: number | null;
  reported_at?: string | null;
  reported_by_name?: string | null;
  assist_pathologist_id?: number | null;
  assist_pathologist_name?: string | null;
  is_cancelled: boolean;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Standalone-only registration/demographic fields (null for parent-linked cases)
  patient_id?: number | null;
  patient?: MolecularCasePatientRef | null;
  hospital_id?: number | null;
  department_id?: number | null;
  medical_scheme_id?: number | null;
  an?: string | null;
  vn?: string | null;
  clinical_diagnosis?: string | null;
  clinician_name?: string | null;
  collect_at?: string | null;
}

export interface MolecularCaseCreate {
  patient_id: number;
  ap_test_id: number;
  hospital_id?: number | null;
  department_id?: number | null;
  medical_scheme_id?: number | null;
  hn?: string | null;
  an?: string | null;
  vn?: string | null;
  clinical_diagnosis?: string | null;
  clinician_name?: string | null;
  collect_at?: string | null;
  assist_pathologist_id?: number | null;
}

export interface MolecularCaseUpdate {
  result_text?: string | null;
  is_outlab?: boolean;
  // Editable regardless of origin — not rejected on parent-linked cases.
  assist_pathologist_id?: number | null;
  // Standalone-only — rejected by the backend on parent-linked cases.
  patient_id?: number | null;
  ap_test_id?: number | null;
  hospital_id?: number | null;
  department_id?: number | null;
  medical_scheme_id?: number | null;
  hn?: string | null;
  an?: string | null;
  vn?: string | null;
  clinical_diagnosis?: string | null;
  clinician_name?: string | null;
  collect_at?: string | null;
}

export interface MolecularCaseFinalize {
  result_text?: string | null;
}

export interface MolecularCaseCancel {
  cancel_reason?: string | null;
}

export interface MolecularCaseListParams {
  skip?: number;
  limit?: number;
  status?: string;
  is_outlab?: boolean;
  parent_case_id?: number;
  stain_id?: number;
  search?: string;
  clinician?: string;
}

export const MolecularCaseService = {
  createStandalone: (payload: MolecularCaseCreate): Promise<MolecularCaseResponse> =>
    api.post("/molecular-cases", payload).then((r) => r.data),

  getAll: (params?: MolecularCaseListParams): Promise<MolecularCaseResponse[]> =>
    api.get("/molecular-cases", { params }).then((r) => r.data),

  getById: (caseId: number): Promise<MolecularCaseResponse> =>
    api.get(`/molecular-cases/${caseId}`).then((r) => r.data),

  update: (caseId: number, payload: MolecularCaseUpdate): Promise<MolecularCaseResponse> =>
    api.patch(`/molecular-cases/${caseId}`, payload).then((r) => r.data),

  finalize: (caseId: number, payload: MolecularCaseFinalize): Promise<MolecularCaseResponse> =>
    api.post(`/molecular-cases/${caseId}/finalize`, payload).then((r) => r.data),

  cancel: (caseId: number, payload: MolecularCaseCancel): Promise<MolecularCaseResponse> =>
    api.post(`/molecular-cases/${caseId}/cancel`, payload).then((r) => r.data),

  uploadOutlabPdf: (caseId: number, file: File, receivedAt?: string): Promise<MolecularCaseResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (receivedAt) formData.append("received_at", receivedAt);
    return api
      .post(`/molecular-cases/${caseId}/outlab-pdf`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  deleteOutlabPdf: (caseId: number): Promise<MolecularCaseResponse> =>
    api.delete(`/molecular-cases/${caseId}/outlab-pdf`).then((r) => r.data),

  getOutlabPdfBlob: (caseId: number): Promise<Blob> =>
    api.get(`/molecular-cases/${caseId}/outlab-pdf`, { responseType: "blob" }).then((r) => r.data),

  getResultPdfBlob: (caseId: number): Promise<Blob> =>
    api.get(`/molecular-cases/${caseId}/result-pdf`, { responseType: "blob" }).then((r) => r.data),
};
