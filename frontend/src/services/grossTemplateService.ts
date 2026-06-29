import api from "./httpClient";
import { GrossTemplate, GetGrossTemplatesParams } from "../types/grossTemplate";

const GrossTemplateService = {
  /**
   * สร้างแม่แบบ (Template) ใหม่
   */
  createTemplate: (payload: GrossTemplate) => {
    return api.post<GrossTemplate>("/gross-templates", payload);
  },

  /**
   * ดึงรายการ Templates ทั้งหมด (รองรับ Pagination และ Filtering ตาม Category)
   */
  getTemplates: (params: GetGrossTemplatesParams = {}) => {
    return api.get<GrossTemplate[]>("/gross-templates", { params });
  },

  /**
   * ดึงรายละเอียด Template ตาม ID
   */
  getTemplateById: (id: number) => {
    return api.get<GrossTemplate>(`/gross-templates/${id}`);
  },

  /**
   * อัปเดตข้อมูล Template
   * ใช้ Partial เพื่อให้สามารถส่งเฉพาะบาง Field ที่ต้องการแก้ไขได้
   */
  updateTemplate: (id: number, payload: Partial<GrossTemplate>) => {
    return api.patch<GrossTemplate>(`/gross-templates/${id}`, payload);
  },

  /**
   * ลบ Template
   */
  deleteTemplate: (id: number) => {
    return api.delete(`/gross-templates/${id}`);
  },
};

export default GrossTemplateService;
