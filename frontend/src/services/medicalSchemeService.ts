// src/services/medicalSchemeService.ts
import api from "./httpClient";
import { MedicalScheme } from "../types/medicalScheme";

const MedicalSchemeService = {
  /**
   * ดึงรายการสิทธิการรักษาทั้งหมด (เช่น จ่ายตรง, ประกันสังคม)
   */
  getSchemes: async (): Promise<MedicalScheme[]> => {
    const res = await api.get<MedicalScheme[]>("/org/medical-schemes");
    return res.data;
  },

  /**
   * ดึงข้อมูลสิทธิการรักษาตาม ID
   */
  getSchemeById: async (id: number): Promise<MedicalScheme> => {
    const res = await api.get<MedicalScheme>(`/org/medical-schemes/${id}`);
    return res.data;
  },

  /**
   * สร้างสิทธิการรักษาใหม่
   */
  createScheme: async (
    payload: Partial<MedicalScheme>,
  ): Promise<MedicalScheme> => {
    const res = await api.post<MedicalScheme>("/org/medical-schemes", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลสิทธิการรักษา
   */
  updateScheme: async (
    id: number,
    payload: Partial<MedicalScheme>,
  ): Promise<MedicalScheme> => {
    const res = await api.put<MedicalScheme>(
      `/org/medical-schemes/${id}`,
      payload,
    );
    return res.data;
  },

  /**
   * ลบสิทธิการรักษา
   */
  deleteScheme: async (id: number): Promise<void> => {
    await api.delete(`/org/medical-schemes/${id}`);
  },
};

export default MedicalSchemeService;
