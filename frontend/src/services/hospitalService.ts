// src/services/hospitalService.ts
import api from "./httpClient";
import { Hospital } from "../types/hospital";

const HospitalService = {
  /**
   * ดึงรายการโรงพยาบาลทั้งหมด
   */
  getHospitals: async (): Promise<Hospital[]> => {
    const res = await api.get("/org/hospitals");
    return res.data;
  },

  /**
   * ดึงข้อมูลโรงพยาบาลตาม ID
   */
  getHospitalById: async (id: number): Promise<Hospital> => {
    const res = await api.get(`/org/hospitals/${id}`);
    return res.data;
  },

  /**
   * เพิ่มโรงพยาบาลใหม่
   */
  createHospital: async (payload: Partial<Hospital>): Promise<Hospital> => {
    const res = await api.post("/org/hospitals", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลโรงพยาบาล
   */
  updateHospital: async (
    id: number,
    payload: Partial<Hospital>,
  ): Promise<Hospital> => {
    const res = await api.put(`/org/hospitals/${id}`, payload);
    return res.data;
  },

  /**
   * ลบโรงพยาบาล
   */
  deleteHospital: async (id: number): Promise<void> => {
    await api.delete(`/org/hospitals/${id}`);
  },

  /**
   * อัปโหลดโลโก้สำหรับใช้เป็น report header ของโรงพยาบาลนี้
   */
  uploadLogo: async (id: number, file: File): Promise<Hospital> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/org/hospitals/${id}/upload-logo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};

export default HospitalService;
