import api from "./httpClient";

const BASE = "/legacy-reports";

export type LegacyReportType = "surgical" | "gyne" | "nongyne";

export interface LegacyReport {
  id: number;
  accession_no?: string;
  patient_hn?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_gender?: string;
  patient_age?: number;
  hospital_name?: string;
  department_name?: string;
  pathologist_name?: string;
  clinician_name?: string;
  status?: string;
  published_at?: string;
  reported_at?: string;
  registered_at?: string;
  is_read?: boolean;
  read_at?: string;
  is_pending?: boolean;
  // Surgical-specific
  specimen_summary?: string;
  diagnosis_summary?: string;
  has_malignancy?: boolean;
  // Gyne-specific
  adequacy_text?: string;
  category_1_text?: string;
  category_2_text?: string;
  // NonGyne-specific
  specimen_type?: string;
  collection_site?: string;
  diagnosis?: string;
}

export interface LegacySearchItem {
  id: number;
  case_type: "SURGICAL" | "GYNE" | "NONGYNE";
  accession_no?: string;
  patient_hn?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  status: string;
  published_at?: string;
  reported_at?: string;
  registered_at?: string;
  clinician_name?: string;
  pathologist_name?: string;
  hospital_name?: string;
  is_read?: boolean;
  read_at?: string;
  report_id: number;
  is_pending?: boolean;
}

const legacyReportService = {
  getList: async (
    type: LegacyReportType,
    params: { skip?: number; limit?: number; search?: string; hospital_id?: number },
  ) => {
    const res = await api.get(`${BASE}/${type}`, { params });
    return res.data as { items: LegacyReport[]; total: number };
  },

  getPdf: async (type: LegacyReportType, id: number): Promise<Blob> => {
    const res = await api.get(`${BASE}/${type}/${id}/pdf`, { responseType: "blob" });
    return res.data as Blob;
  },

  markRead: async (type: LegacyReportType, id: number) => {
    await api.post(`${BASE}/${type}/${id}/mark-read`);
  },

  publicSearch: async (q: string, hospitalId?: number, skip = 0, limit = 10) => {
    const res = await api.get(`${BASE}/search`, {
      params: { q, hospital_id: hospitalId, skip, limit },
    });
    return res.data as { items: LegacySearchItem[]; total: number };
  },
};

export default legacyReportService;
