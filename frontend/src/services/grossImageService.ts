// frontend/src/services/grossImageService.ts
import api from "./httpClient"; 
import { GrossImage } from "../types/image";

const GrossImageService = {
  /**
   * 📤 อัปโหลดรูปภาพ Gross (POST)
   * @param specimenId - ID ของ Specimen ที่รูปภาพนี้เชื่อมโยงอยู่
   * @param formData - ข้อมูลฟอร์มที่มี 'file', 'description', และ 'order'
   */
  uploadImage: async (specimenId: number, formData: FormData): Promise<GrossImage> => {
    // 💡 เมื่อส่ง FormData, Axios จะจัดการ boundary และ multipart อัตโนมัติ
    const res = await api.post<GrossImage>(`/surgical-specimens/${specimenId}/images/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  /**
   * 🖼️ ดึงรายการรูปภาพ Gross ทั้งหมดของ Case
   * @param caseId
   */
  getImagesByCaseId: async (caseId: number): Promise<GrossImage[]> => {
    const res = await api.get<GrossImage[]>(`/surgical-cases/${caseId}/images/`);
    return res.data;
  },

  /**
   * 🖼️ ดึงรายการรูปภาพ Gross ตามรายชิ้นเนื้อ (Specimen)
   * @param specimenId
   */
  getImagesBySpecimenId: async (specimenId: number): Promise<GrossImage[]> => {
    const res = await api.get<GrossImage[]>(`/surgical-specimens/${specimenId}/images/`);
    return res.data;
  },

  /**
   * 🗑️ ลบรูปภาพ Gross ตาม ID (DELETE)
   * @param imageId - ID ของรูปภาพ Gross ที่ต้องการลบ
   */
  deleteImage: async (imageId: number): Promise<void> => {
    await api.delete(`/surgical-specimens/images/${imageId}`);
  },

  /**
   * ✏️ อัปเดตข้อมูลรูปภาพ Gross (PATCH)
   * @param imageId - ID ของรูปภาพ Gross
   * @param data - ข้อมูลที่ต้องการอัปเดต (เช่น show_in_report)
   */
  updateImage: async (imageId: number, data: Partial<GrossImage>): Promise<GrossImage> => {
    const res = await api.patch<GrossImage>(`/surgical-specimens/images/${imageId}`, data);
    return res.data;
  },
};

export default GrossImageService;