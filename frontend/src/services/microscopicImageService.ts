// src/services/microscopicImageService.ts
import api from "./httpClient";
import { MicroscopicImage } from "../types/image";

const MicroscopicImageService = {
  /**
   * 📤 อัปโหลดรูปภาพ Microscopic (POST)
   */
  uploadImage: async (
    specimenId: number,
    formData: FormData
  ): Promise<MicroscopicImage> => {
    const res = await api.post<MicroscopicImage>(
      `/microscopic-images/${specimenId}`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return res.data;
  },

  /**
   * 📝 อัปเดตข้อมูลรูปภาพ (🚩 เพิ่มใหม่สำหรับแก้ไข Caption)
   */
  updateImage: async (
    imageId: number,
    data: { description?: string; magnification?: string; stain?: string }
  ): Promise<MicroscopicImage> => {
    // ใช้ PATCH เพื่อส่งเฉพาะฟิลด์ที่ต้องการแก้ไขไปยัง Backend
    const res = await api.patch<MicroscopicImage>(
      `/microscopic-images/${imageId}`,
      data
    );
    return res.data;
  },

  /**
   * 🖼️ ดึงรายการรูปภาพ Microscopic ทั้งหมดของชิ้นเนื้อ (GET)
   */
  getImagesBySpecimenId: async (
    specimenId: number
  ): Promise<MicroscopicImage[]> => {
    const res = await api.get<MicroscopicImage[]>(
      `/microscopic-images/specimen/${specimenId}`
    );
    return res.data;
  },

  /**
   * 📂 ดึงรายการรูปภาพ Microscopic ทั้งหมดของ Case (GET)
   */
  getImagesByCaseId: async (caseId: string): Promise<MicroscopicImage[]> => {
    const res = await api.get<MicroscopicImage[]>(
      `/microscopic-images/case/${caseId}`
    );
    return res.data;
  },

  /**
   * 🗑️ ลบรูปภาพ Microscopic (DELETE)
   */
  deleteImage: async (imageId: number): Promise<void> => {
    await api.delete(`/microscopic-images/${imageId}`);
  },

  /**
   * 🔒 สร้าง URL สำหรับแสดงผลรูปภาพผ่าน Secure Endpoint
   */
  getSecureImageUrl: (imagePath: string): string => {
    if (!imagePath) return "";
    const baseURL = api.defaults.baseURL || "";
    return `${baseURL}/microscopic-images/get-image/${imagePath}`;
  },
};

export default MicroscopicImageService;
