import api from "./httpClient";
import { ArchiveItem } from "./archiveService";
import {
  GyneDiagnosisResponse,
  GyneDiagnosisCreate,
  GyneDiagnosisUpdate,
  GyneSpecimenAdequacy,
  GyneDiagnosisCategory,
} from "../types/gyne-diagnosis";
import type { GyneCytologyCase } from "../types/gyne-cytology";

const GyneDiagnosisService = {
  /**
   * บันทึกผลวินิจฉัยครั้งแรก (Initial Report v1)
   */
  createInitial: async (
    payload: GyneDiagnosisCreate,
  ): Promise<GyneDiagnosisResponse> => {
    const res = await api.post<GyneDiagnosisResponse>(
      "/gyne-diagnosis",
      payload,
    );
    return res.data;
  },

  /**
   * ดึงผลวินิจฉัยปัจจุบันของเคส (Current Version)
   */
  getCurrentDiagnosis: async (
    caseId: number,
  ): Promise<GyneDiagnosisResponse> => {
    const res = await api.get<GyneDiagnosisResponse>(
      `/gyne-diagnosis/case/${caseId}`,
    );
    return res.data;
  },

  /**
   * แก้ไขผลเดิม (ออก Revised Report) - จะสร้าง version ใหม่
   */
  reviseReport: async (
    diagId: number,
    payload: GyneDiagnosisUpdate,
  ): Promise<GyneDiagnosisResponse> => {
    const res = await api.put<GyneDiagnosisResponse>(
      `/gyne-diagnosis/${diagId}/revise`,
      payload,
    );
    return res.data;
  },

  /**
   * อัปเดตข้อมูล Draft (ไม่สร้าง version ใหม่)
   */
  updateDiagnosis: async (
    diagId: number,
    payload: GyneDiagnosisUpdate,
  ): Promise<GyneDiagnosisResponse> => {
    const res = await api.put<GyneDiagnosisResponse>(
      `/gyne-diagnosis/${diagId}`,
      payload,
    );
    return res.data;
  },

  /**
   * ดึง Master Data: Specimen Adequacy
   * @param groupType "ADEQUACY", "ZONE", "QUALITY"
   */
  getSpecimenAdequacies: async (
    groupType?: string,
  ): Promise<GyneSpecimenAdequacy[]> => {
    const res = await api.get<GyneSpecimenAdequacy[]>(
      "/gyne-diagnosis/master/adequacy",
      { params: { group_type: groupType } },
    );
    return res.data;
  },

  /**
   * ดึง Master Data: Diagnosis Categories
   */
  getDiagnosisCategories: async (
    parentId?: number,
    mainOnly?: boolean,
  ): Promise<GyneDiagnosisCategory[]> => {
    const res = await api.get<GyneDiagnosisCategory[]>(
      "/gyne-diagnosis/master/category",
      { params: { parent_id: parentId, main_only: mainOnly } },
    );
    return res.data;
  },

  getHistory: async (caseId: number): Promise<GyneDiagnosisResponse[]> => {
    const res = await api.get<GyneDiagnosisResponse[]>(
      `/gyne-diagnosis/case/${caseId}/history`,
    );
    return res.data;
  },

  getAllReports: async (
    page: number = 1,
    size: number = 10,
    search?: string,
  ): Promise<unknown> => {
    const res = await api.get("/gyne-cyto-reports", {
      params: {
        skip: (page - 1) * size,
        limit: size,
        search,
      },
    });
    return res.data;
  },

  /**
   * สร้าง Snapshot รายงาน (Finalize)
   */
  /**
   * สร้าง Snapshot รายงาน (Finalize)
   */
  publishReport: async (
    caseId: number,
    signers?: { user_id: number; role: string; signed_at?: string | null }[],
    isAbnormal?: boolean,
    isOutLabConsult?: boolean,
    consultReason?: string,
  ): Promise<GyneCytologyCase> => {
    const res = await api.post(`/gyne-cyto-reports/${caseId}/publish`, {
      signers,
      is_abnormal: isAbnormal ?? false,
      is_out_lab_consult: isOutLabConsult,
      consult_reason: consultReason,
    });
    return res.data;
  },

  completeReview: async (
    caseId: number,
    reviewResult: "agree" | "disagree",
    reviewNote?: string,
    discrepancyLevel?: "minor" | "major",
    isOutLabConsult?: boolean,
    consultReason?: string,
  ): Promise<void> => {
    await api.post(`/gyne-cyto-reports/cases/${caseId}/complete-review`, {
      review_result: reviewResult,
      review_note: reviewNote ?? null,
      discrepancy_level: discrepancyLevel ?? null,
      is_out_lab_consult: isOutLabConsult,
      consult_reason: consultReason,
    });
  },

  /**
   * พรีวิวรายงาน PDF
   */
  previewReportPdf: async (caseId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-cyto-reports/cases/${caseId}/preview-pdf`, {
      responseType: "blob",
    });
    return res.data;
  },

  /**
   * ดึงไฟล์รายงาน PDF จริง
   */
  getReportPdf: async (reportId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-cyto-reports/${reportId}/pdf`, {
      responseType: "blob",
    });
    return res.data;
  },

  /**
   * ดึงประวัติรายงานของเคส
   */
  getReportsByCase: async (caseId: number): Promise<unknown[]> => {
    const res = await api.get(`/gyne-cyto-reports/cases/${caseId}`);
    return res.data;
  },

  /**
   * ดึงข้อมูลรายงานฉบับเดียว (Snapshot)
   */
  getReportById: async (reportId: number): Promise<unknown> => {
    const res = await api.get(`/gyne-cyto-reports/${reportId}`);
    return res.data;
  },

  markRead: async (reportId: number): Promise<void> => {
    await api.post(`/gyne-cyto-reports/${reportId}/mark-read`);
  },

  getArchive: async (page = 1, size = 20, search?: string, hospital_id?: number, clinician?: string) => {
    const res = await api.get(`/gyne-cyto-reports/archive`, {
      params: { page, size, search, hospital_id, clinician },
    });
    return res.data as { items: ArchiveItem[]; total: number };
  },
};

export default GyneDiagnosisService;
