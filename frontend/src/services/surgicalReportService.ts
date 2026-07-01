/**
 * ============================================================
 * SurgicalReportService
 * ============================================================
 *
 * Purpose:
 * --------
 * Centralized service layer for managing Surgical Pathology
 * Report operations in the LIS frontend application.
 *
 * This service acts as the single integration point between
 * UI components and Surgical Report-related backend APIs.
 *
 * Responsibilities:
 * -----------------
 * - Retrieve surgical reports by report ID (Approval / Review)
 * - Retrieve report history per case with pagination & search
 * - Retrieve aggregated report history across all cases
 * - Finalize surgical reports (locking report content)
 * - Generate, preview, and download report PDFs
 *
 * Architectural Notes:
 * --------------------
 * - Uses a shared Axios instance (`httpClient`)
 *   - Centralized authentication handling
 *   - Request / response interceptors
 *   - Consistent error propagation
 *
 * - Service methods return **only domain data**
 *   (i.e. `response.data`)
 *   - Prevents leakage of HTTP implementation details
 *   - Simplifies consumption in React components
 *
 * - Strongly typed return values
 *   - Ensures compile-time safety
 *   - Aligns frontend contracts with backend schemas
 *
 * Usage Guidelines:
 * -----------------
 * - UI components MUST NOT call Axios directly
 * - All Surgical Report API interactions must go through
 *   this service to maintain consistency and traceability
 *
 * Change Management:
 * ------------------
 * - Any backend endpoint change MUST be reflected here
 * - This file should be reviewed carefully during
 *   report workflow or approval process modifications
 *
 * ============================================================
 */

import api from "./httpClient";
import {
  SurgicalReport,
  SurgicalReportPagination,
  SurgicalStatResponse,
  LabTechStatResponse,
  StaffRegistrationRow,
  StaffGrossStats,
  TissueProcessStats,
  StorageStats,
  OutlabStats,
} from "../types/surgicalReport";
import { BulkSaveDraft } from "../types/surgicalBulk";
import { ArchiveItem } from "./archiveService";

const SurgicalReportService = {
  // 🚩 เพิ่มฟังก์ชันดึง Report ตาม ID (สำหรับหน้า Approval Detail)
  getReportById: async (reportId: number): Promise<SurgicalReport> => {
    const response = await api.get<SurgicalReport>(
      `/surgical-reports/${reportId}`,
    );
    return response.data;
  },

  /**
   * 🚩 NEW: บันทึก Draft และสร้าง Snapshot รายงานทันที
   * แก้ปัญหา 404 และ Data Sync โดยรวมการ Save และ Finalize ไว้ใน Transaction เดียว
   */
  finalizeAndSnapshot: async (
    caseId: number,
    data: BulkSaveDraft,
  ): Promise<SurgicalReport> => {
    const response = await api.post<SurgicalReport>(
      `/surgical-reports/${caseId}/finalize-snapshot`,
      data, // ส่ง Payload ทั้งก้อน (Gross, Diagnosis, etc.) ไปให้ Backend บันทึกก่อนทำ Snapshot
    );
    return response.data;
  },

  // 🚩 2. ปรับปรุงให้รองรับ Pagination และ Search
  getReportHistory: async (
    caseId: number,
    page: number = 1,
    size: number = 10,
    search?: string,
  ): Promise<SurgicalReportPagination> => {
    const response = await api.get<SurgicalReportPagination>(
      `/surgical-reports/cases/${caseId}`,
      {
        params: { page, size, search }, // ส่ง Query Parameters ไปยัง Backend
      },
    );
    return response.data;
  },

  // ดึงประวัติรายงานของ "ทุกเคส" รวมกัน
  getAllReports: async (
    page = 1,
    size = 10,
    search?: string,
    status?: string,
    is_print?: boolean,
  ): Promise<SurgicalReportPagination> => {
    const response = await api.get<SurgicalReportPagination>(
      `/surgical-reports/all`,
      {
        params: { page, size, search, status, is_print },
      },
    );
    return response.data;
  },

  getArchive: async (page = 1, size = 20, search?: string, hospital_id?: number, clinician?: string) => {
    const response = await api.get(`/surgical-reports/archive`, {
      params: { page, size, search, hospital_id, clinician },
    });
    return response.data as { items: ArchiveItem[]; total: number };
  },

  getReportPdf: async (reportId: number, withBarcode: boolean = false): Promise<Blob> => {
    const response = await api.get(`/surgical-reports/${reportId}/pdf`, {
      params: { with_barcode: withBarcode },
      responseType: "blob",
    });
    return response.data;
  },

  getLatestReportPdf: async (caseId: number): Promise<Blob> => {
    const response = await api.get(
      `/surgical-reports/cases/${caseId}/latest/pdf`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  previewReportData: async (
    case_id: number,
    specimenIds: number[],
  ): Promise<unknown> => {
    const response = await api.post(
      `/surgical-reports/cases/${case_id}/preview-data`,
      { active_specimen_ids: specimenIds },
    );
    return response.data;
  },

  // 🚩 เพิ่มฟังก์ชันนี้สำหรับ Preview โดยเฉพาะ
  previewReportPdf: async (
    caseId: number,
    specimenIds?: number[],
    overrides?: { is_pending?: boolean; pending_reason?: string }
  ): Promise<Blob> => {
    const response = await api.post(
      `/surgical-reports/cases/${caseId}/preview-pdf`,
      { active_specimen_ids: specimenIds, ...overrides }, // Payload ที่รวม overrides
      { responseType: "blob" }, // สำคัญมาก: ต้องเป็น blob
    );
    return response.data;
  },

  // 8. Finalize Report (Snapshot ข้อมูลเข้าตาราง SurgicalReport)
  finalizeReport: async (caseId: number, payload: Record<string, unknown>): Promise<unknown> => {
    // 🚩 อัปเดต URL ให้ตรงกับ Router ใหม่ และส่ง payload ไปด้วย
    const response = await api.post(
      `/surgical-reports/${caseId}/finalize-snapshot`,
      payload,
    );
    return response.data;
  },

  updatePrintStatus: async (reportId: number, isPrint: boolean): Promise<unknown> => {
    const response = await api.patch(`/surgical-reports/${reportId}/print-status`, { is_print: isPrint });
    return response.data;
  },

  getBarcodePdf: async (reportIds: number[]): Promise<Blob> => {
    const response = await api.post(
      `/surgical-reports/barcode-pdf`,
      { report_ids: reportIds },
      { responseType: "blob" },
    );
    return response.data;
  },

  /**
   * 🚩 NEW: ดึงรายการงานที่รอเราไปร่วมลงนาม (Consult / Co-sign)
   * ดึงเฉพาะเคสที่ user_id ปัจจุบันมีชื่อใน signer แต่ signed_at ยังเป็น NULL
   */
  getPendingCosignWorklist: async (
    page: number = 1,
    size: number = 20,
    search?: string,
  ): Promise<SurgicalReportPagination> => {
    const response = await api.get<SurgicalReportPagination>(
      `/surgical-reports/pending-cosign`, // 🚩 ต้องตรงกับ Router ใน FastAPI
      {
        params: { page, size, search },
      },
    );
    return response.data;
  },

  // 🚩 Cost Summary Endpoint
  getCostSummary: async (caseId: number): Promise<unknown> => {
    const response = await api.get(`/surgical-cases/${caseId}/cost-summary`);
    return response.data;
  },

  deleteDraftDiagnosis: async (diagnosisId: number): Promise<void> => {
    await api.delete(`/surgical-diagnoses/${diagnosisId}`);
  },

  // 🚩 Statistics Endpoint
  getSurgicalStatistics: async (
    startDate: string,
    endDate: string,
    pathologistId?: number,
  ): Promise<SurgicalStatResponse> => {
    const response = await api.get<SurgicalStatResponse>(
      `/surgical-reports/statistics`,
      {
        params: { start_date: startDate, end_date: endDate, pathologist_id: pathologistId },
      },
    );
    return response.data;
  },

  markRead: async (reportId: number): Promise<void> => {
    await api.post(`/surgical-reports/${reportId}/mark-read`);
  },

  getLabTechStatistics: async (
    startDate: string,
    endDate: string,
    userId?: number,
  ): Promise<LabTechStatResponse> => {
    const response = await api.get<LabTechStatResponse>(
      `/surgical-reports/lab-stats`,
      { params: { start_date: startDate, end_date: endDate, user_id: userId } },
    );
    return response.data;
  },

  getStaffRegistrationStats: async (
    startDate: string,
    endDate: string,
  ): Promise<StaffRegistrationRow[]> => {
    const response = await api.get<StaffRegistrationRow[]>(
      `/surgical-reports/staff-registration-stats`,
      { params: { start_date: startDate, end_date: endDate } },
    );
    return response.data;
  },

  getStorageStats: async (
    startDate: string,
    endDate: string,
  ): Promise<StorageStats> => {
    const response = await api.get<StorageStats>(
      `/surgical-reports/storage-stats`,
      { params: { start_date: startDate, end_date: endDate } },
    );
    return response.data;
  },

  getTissueProcessStats: async (
    startDate: string,
    endDate: string,
  ): Promise<TissueProcessStats> => {
    const response = await api.get<TissueProcessStats>(
      `/surgical-reports/tissue-process-stats`,
      { params: { start_date: startDate, end_date: endDate } },
    );
    return response.data;
  },

  getStaffGrossStats: async (
    startDate: string,
    endDate: string,
  ): Promise<StaffGrossStats> => {
    const response = await api.get<StaffGrossStats>(
      `/surgical-reports/staff-gross-stats`,
      { params: { start_date: startDate, end_date: endDate } },
    );
    return response.data;
  },

  getOutlabStats: async (
    startDate: string,
    endDate: string,
  ): Promise<OutlabStats> => {
    const response = await api.get<OutlabStats>(
      `/surgical-reports/outlab-stats`,
      { params: { start_date: startDate, end_date: endDate } },
    );
    return response.data;
  },

  // Fix #5: co-sign without publishing
  cosign: async (
    reportId: number,
    payload: { agreement?: string; agreement_note?: string; comment?: string },
  ): Promise<SurgicalReport> => {
    const res = await api.post<SurgicalReport>(`/approvals/surgical/${reportId}/cosign`, payload);
    return res.data;
  },

  // Fix #4: add co-signer after publish
  addSigner: async (
    reportId: number,
    payload: { user_id: number; role: string; consult_note?: string },
  ): Promise<SurgicalReport> => {
    const res = await api.post<SurgicalReport>(`/approvals/surgical/${reportId}/add-signer`, payload);
    return res.data;
  },
};

export default SurgicalReportService;
