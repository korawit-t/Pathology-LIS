import api from "./httpClient";
import { NongyneDiagnosisResponse } from "../types/nongyneDiagnosis";

export interface PendingNongyneApproval {
  id: number;
  accession_no?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  specimen_type?: string;
  pathologist_name?: string;
  status?: string;
}

export interface NongyneReportListItem {
  id: number;
  accession_no?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  patient_age?: number;
  patient_gender?: string;
  hospital_name?: string;
  status?: string;
  is_print: boolean;
  published_at?: string;
  report_type?: string;
}

export interface NongyneReportPagination {
  items: NongyneReportListItem[];
  total: number;
  page: number;
  size: number;
}

const NongyneReportService = {
  getAllReports: async (
    page = 1,
    size = 10,
    search?: string,
    status?: string,
    is_print?: boolean,
  ): Promise<NongyneReportPagination> => {
    const res = await api.get("/nongyne-cyto-reports", {
      params: { skip: (page - 1) * size, limit: size, search, status, is_print },
    });
    return res.data;
  },

  updatePrintStatus: async (reportId: number, isPrint: boolean): Promise<unknown> => {
    const res = await api.patch(`/nongyne-cyto-reports/${reportId}/print-status`, { is_print: isPrint });
    return res.data;
  },

  getBarcodePdf: async (reportIds: number[]): Promise<Blob> => {
    const res = await api.post(
      "/nongyne-cyto-reports/barcode-pdf",
      { report_ids: reportIds },
      { responseType: "blob" },
    );
    return res.data;
  },

  getReportsByCase: async (caseId: number): Promise<NongyneDiagnosisResponse[]> => {
    const res = await api.get(`/nongyne-cyto-reports/cases/${caseId}`);
    return res.data;
  },

  getReportById: async (reportId: number): Promise<unknown> => {
    const res = await api.get(`/nongyne-cyto-reports/${reportId}`);
    return res.data;
  },

  getReportPdf: async (reportId: number): Promise<Blob> => {
    const res = await api.get(`/nongyne-cyto-reports/${reportId}/pdf`, {
      responseType: "blob",
    });
    return res.data;
  },

  publishReport: async (
    caseId: number,
    signers?: { user_id: number; role: string; signed_at?: string | null }[],
    is_pending?: boolean,
    pending_reason?: string,
  ): Promise<unknown> => {
    const res = await api.post(`/nongyne-cyto-reports/${caseId}/publish`, {
      signers,
      is_pending: is_pending ?? false,
      pending_reason: pending_reason ?? null,
    });
    return res.data;
  },

  getPendingReports: async (
    page: number = 1,
    size: number = 20,
    search?: string,
  ): Promise<{ items: PendingNongyneApproval[]; total: number }> => {
    const res = await api.get("/approvals/nongyne/pending", {
      params: { skip: (page - 1) * size, limit: size, search },
    });
    return res.data;
  },

  getPendingCosignWorklist: async (
    page: number = 1,
    size: number = 20,
    search?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; size: number }> => {
    const res = await api.get("/nongyne-cyto-reports/pending-cosign", {
      params: { page, size, search },
    });
    return res.data;
  },

  cosign: async (
    reportId: number,
    payload: { agreement?: string; agreement_note?: string; comment?: string },
  ): Promise<unknown> => {
    const res = await api.post(`/approvals/nongyne/${reportId}/cosign`, payload);
    return res.data;
  },

  addSigner: async (
    reportId: number,
    payload: { user_id: number; role: string; consult_note?: string },
  ): Promise<unknown> => {
    const res = await api.post(`/approvals/nongyne/${reportId}/add-signer`, payload);
    return res.data;
  },

  markRead: async (reportId: number): Promise<void> => {
    await api.post(`/nongyne-cyto-reports/${reportId}/mark-read`);
  },
};

export default NongyneReportService;
