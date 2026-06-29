// frontend/src/services/patientService.ts
import api from "./httpClient";
import { Patient } from "../types/patient";
import type { SurgicalCase } from "../types/surgical";

export interface NongyneCytoHistoryItem {
  id: number;
  accession_no: string;
  registered_at: string | null;
  status: string;
  specimen_type: string | null;
  diagnosis_text: string | null;
  latest_report_id: number | null;
  has_correlation?: boolean;
  correlation_id?: number | null;
}

export interface GyneCytoHistoryItem {
  id: number;
  accession_no: string;
  registered_at: string | null;
  status: string;
  specimen_type: string | null;
  category_1: { code: string; text: string } | null;
  category_2: { code: string; text: string } | null;
  latest_report_id: number | null;
  has_correlation?: boolean;
  correlation_id?: number | null;
}

const PatientService = {
  /**
   * ดึงข้อมูลคนไข้ทั้งหมด (รองรับการ Search ด้วยชื่อหรือ HN ผ่าน query params)
   */
  getPatients: async (q = ""): Promise<Patient[]> => {
    const res = await api.get<Patient[]>("/patients", {
      params: { q: q },
    });
    return res.data;
  },

  /**
   * ดึงข้อมูลคนไข้รายบุคคลตาม ID
   */
  getPatientById: async (id: number): Promise<Patient> => {
    const res = await api.get<Patient>(`/patients/${id}`);
    return res.data;
  },

  /**
   * ดึงประวัติการตรวจ (Surgical Cases) ทั้งหมดของคนไข้คนนี้
   */
  getPatientHistory: async (id: number): Promise<SurgicalCase[]> => {
    const res = await api.get<SurgicalCase[]>(`/patients/${id}/history`);
    return res.data;
  },

  /**
   * ดึงประวัติ Gyne Cytology ทั้งหมดของคนไข้คนนี้
   */
  getGyneCytoHistory: async (id: number): Promise<GyneCytoHistoryItem[]> => {
    const res = await api.get<GyneCytoHistoryItem[]>(`/patients/${id}/gyne-cyto-history`);
    return res.data;
  },

  getNongyneCytoHistory: async (id: number): Promise<NongyneCytoHistoryItem[]> => {
    const res = await api.get<NongyneCytoHistoryItem[]>(`/patients/${id}/nongyne-cyto-history`);
    return res.data;
  },

  /**
   * สร้างคนไข้ใหม่
   */
  createPatient: async (payload: Partial<Patient>): Promise<Patient> => {
    const res = await api.post<Patient>("/patients", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลคนไข้
   */
  updatePatient: async (
    id: number,
    payload: Partial<Patient>,
  ): Promise<Patient> => {
    const res = await api.put<Patient>(`/patients/${id}`, payload);
    return res.data;
  },

  /**
   * ลบข้อมูลคนไข้
   */
  deletePatient: async (id: number): Promise<void> => {
    await api.delete(`/patients/${id}`);
  },
};

export default PatientService;
