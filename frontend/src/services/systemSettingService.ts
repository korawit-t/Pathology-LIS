import api from "./httpClient";
import {
  SystemSetting,
  SystemSettingUpdate,
  LogoUploadResponse,
} from "../types/system";

const SystemSettingService = {
  getPublicSettings: async (slug?: string): Promise<SystemSetting> => {
    const res = await api.get<SystemSetting>("/system-settings/public", {
      params: { slug: slug || "master" },
    });
    return res.data;
  },

  getAllSettings: async (): Promise<SystemSetting[]> => {
    const res = await api.get<SystemSetting[]>("/system-settings/all");
    return res.data;
  },

  getSettings: async (): Promise<SystemSetting> => {
    const res = await api.get<SystemSetting>("/system-settings/1");
    return res.data;
  },

  updateSettings: async (
    payload: SystemSettingUpdate,
    slug: string = "master"
  ): Promise<SystemSetting> => {
    const res = await api.patch<SystemSetting>(
      "/system-settings/update",
      payload,
      { params: { slug } }
    );
    return res.data;
  },

  uploadLogo: async (
    type: "login" | "report",
    file: File,
    slug: string = "master"
  ): Promise<LogoUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<LogoUploadResponse>(
      `/system-settings/upload-logo`,
      formData,
      {
        params: { logo_type: type, slug },
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return res.data;
  },

  testPrintSticker: async (): Promise<Blob> => {
    const res = await api.get("/system-settings/sticker-test-print", { responseType: "blob" });
    return res.data;
  },

  deleteSettings: async (id: number): Promise<void> => {
    await api.delete(`/system-settings/${id}`);
  },

  getReportTemplates: async (): Promise<Record<string, { available: string[]; active: string }>> => {
    const res = await api.get<Record<string, { available: string[]; active: string }>>("/system-settings/report-templates");
    return res.data;
  },

  setReportTemplate: async (report_type: string, template_name: string): Promise<SystemSetting> => {
    const res = await api.patch<SystemSetting>("/system-settings/report-templates", { report_type, template_name });
    return res.data;
  },
};

export default SystemSettingService;
