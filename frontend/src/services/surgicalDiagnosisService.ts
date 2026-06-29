import logger from "../utils/logger";
import api from "./httpClient";
import {
  SurgicalDiagnosis,
  CreateDiagnosisPayload,
  UpdateDiagnosisPayload,
} from "../types/surgicalDiagnosis";

const SurgicalDiagnosisService = {
  // 1. สร้างการวินิจฉัย (Original Entry เท่านั้น)
  createDiagnosis: async (
    payload: CreateDiagnosisPayload,
  ): Promise<SurgicalDiagnosis> => {
    const response = await api.post<SurgicalDiagnosis>(
      "/surgical-diagnoses",
      payload,
    );
    return response.data;
  },

  // 2. สร้าง Entry ถัดไป (Addendum/Revised) 🚩 ใช้ Endpoint พิเศษตาม Backend
  createNextEntry: async (specimenId: number): Promise<SurgicalDiagnosis> => {
    const response = await api.post<SurgicalDiagnosis>(
      `/surgical-diagnoses/specimen/${specimenId}/next`,
    );
    return response.data;
  },

  // 3. ดึงรายการวินิจฉัยทั้งหมดของชิ้นเนื้อ (History List)
  getDiagnosesBySpecimen: async (
    specimenId: number,
  ): Promise<SurgicalDiagnosis[]> => {
    const response = await api.get<SurgicalDiagnosis[]>(
      `/surgical-diagnoses/specimen/${specimenId}`,
    );
    return response.data;
  },

  getDiagnosesByCase: async (caseId: number): Promise<SurgicalDiagnosis[]> => {
    const response = await api.get<SurgicalDiagnosis[]>(
      `/surgical-diagnoses/case/${caseId}`,
    );
    return response.data;
  },

  // 4. ดึงข้อมูลราย ID
  getDiagnosisById: async (diagnosisId: number): Promise<SurgicalDiagnosis> => {
    const response = await api.get<SurgicalDiagnosis>(
      `/surgical-diagnoses/${diagnosisId}`,
    );
    return response.data;
  },

  // 5. อัปเดตข้อมูลการวินิจฉัย (เฉพาะ Draft)
  updateDiagnosis: async (
    diagnosisId: number,
    payload: UpdateDiagnosisPayload,
  ): Promise<SurgicalDiagnosis> => {
    try {
      const response = await api.patch<SurgicalDiagnosis>(
        `/surgical-diagnoses/${diagnosisId}`,
        payload,
      );
      return response.data;
    } catch (error: any) {
      throw error.response?.data?.detail || "Update failed";
    }
  },

  // 6. ลงนามยืนยันผล (Sign-off)
  signOffDiagnosis: async (
    diagnosisId: number,
    revisionReason: string | null = null,
  ): Promise<SurgicalDiagnosis> => {
    const payload: { status: string; revision_reason?: string } = {
      status: "signed",
    };
    if (revisionReason) payload.revision_reason = revisionReason;

    const response = await api.patch<SurgicalDiagnosis>(
      `/surgical-diagnoses/${diagnosisId}`,
      payload,
    );
    return response.data;
  },

  // 7. ลบการวินิจฉัย (เฉพาะ Draft)
  deleteDiagnosis: async (diagnosisId: number): Promise<void> => {
    await api.delete(`/surgical-diagnoses/${diagnosisId}`);
  },

  deleteCaseLevelDraft: async (caseId: number) => {
    // ยิงไปที่ Endpoint ที่เรากำลังจะไปสร้างใน Backend
    const response = await api.delete(
      `/surgical-diagnoses/case/${caseId}/case-level-draft`,
    );
    return response.data;
  },

  // 10. บันทึกร่างข้อมูลแบบกลุ่ม (Bulk Save Draft) 🚩 สำหรับโหมดใหม่
  bulkSaveDraft: async (payload: Record<string, unknown>): Promise<unknown> => {
    try {
      // ยิงไปที่ Endpoint ใหม่ที่เราสร้างใน Router
      const response = await api.post(
        "/surgical-diagnoses/bulk-save-draft",
        payload,
      );
      return response.data;
    } catch (error: any) {
      logger.error("Bulk Save Error:", error);
      throw error.response?.data?.detail || "Bulk save failed";
    }
  },
};

export default SurgicalDiagnosisService;
