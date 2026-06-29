// src/services/DiagnosticTemplateService.ts
import api from "./httpClient";
import {
  DiagnosticTemplate,
  GetTemplatesParams,
} from "../types/diagnosticTemplate"; // 🚩 ปรับ path ตามโปรเจกต์จริง

const DiagnosticTemplateService = {
  /**
   * สร้างแม่แบบใหม่
   */
  createTemplate: async (
    payload: DiagnosticTemplate,
  ): Promise<DiagnosticTemplate> => {
    const res = await api.post<DiagnosticTemplate>(
      "/diagnostic-templates",
      payload,
    );
    return res.data;
  },

  /**
   * ดึงรายการ Templates ทั้งหมด
   */
  getTemplates: async (
    params: GetTemplatesParams = {},
  ): Promise<DiagnosticTemplate[]> => {
    const res = await api.get<DiagnosticTemplate[]>("/diagnostic-templates", {
      params,
    });
    return res.data;
  },

  /**
   * ดึงรายละเอียด Template ตาม ID
   */
  getTemplateById: async (id: number): Promise<DiagnosticTemplate> => {
    const res = await api.get<DiagnosticTemplate>(
      `/diagnostic-templates/${id}`,
    );
    return res.data;
  },

  /**
   * อัปเดตข้อมูล Template
   */
  updateTemplate: async (
    id: number,
    payload: Partial<DiagnosticTemplate>,
  ): Promise<DiagnosticTemplate> => {
    const res = await api.patch<DiagnosticTemplate>(
      `/diagnostic-templates/${id}`,
      payload,
    );
    return res.data;
  },

  /**
   * ลบ Template
   */
  deleteTemplate: async (id: number): Promise<any> => {
    const res = await api.delete(`/diagnostic-templates/${id}`);
    return res.data;
  },
};

export default DiagnosticTemplateService;
