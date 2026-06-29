import api from "./httpClient";

export interface GyneReportListItem {
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

export interface GyneReportPagination {
  items: GyneReportListItem[];
  total: number;
  page: number;
  size: number;
}

const GyneReportService = {
  getAllReports: async (
    page = 1,
    size = 10,
    search?: string,
    status?: string,
    is_print?: boolean,
  ): Promise<GyneReportPagination> => {
    const res = await api.get("/gyne-cyto-reports", {
      params: { skip: (page - 1) * size, limit: size, search, status, is_print },
    });
    return res.data;
  },

  getReportPdf: async (reportId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-cyto-reports/${reportId}/pdf`, {
      responseType: "blob",
    });
    return res.data;
  },

  updatePrintStatus: async (reportId: number, isPrint: boolean): Promise<unknown> => {
    const res = await api.patch(`/gyne-cyto-reports/${reportId}/print-status`, { is_print: isPrint });
    return res.data;
  },

  getBarcodePdf: async (reportIds: number[]): Promise<Blob> => {
    const res = await api.post(
      "/gyne-cyto-reports/barcode-pdf",
      { report_ids: reportIds },
      { responseType: "blob" },
    );
    return res.data;
  },
};

export default GyneReportService;
