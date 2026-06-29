import api from "./httpClient";
import {
  WsiSetting,
  WsiSettingUpdate,
  WsiScannerProfile,
  WsiScannerProfileCreate,
  WsiScannerProfileUpdate,
  WsiFileInfo,
  WsiFile,
  WsiSlideLink,
  WsiSlideLinkCreate,
  WsiSlideLinkUpdate,
  WsiScanResult,
} from "../types/system";

const WsiSettingService = {
  getSettings: async (): Promise<WsiSetting> => {
    const res = await api.get<WsiSetting>("/wsi-settings");
    return res.data;
  },

  updateSettings: async (payload: WsiSettingUpdate): Promise<WsiSetting> => {
    const res = await api.patch<WsiSetting>("/wsi-settings", payload);
    return res.data;
  },

  listProfiles: async (): Promise<WsiScannerProfile[]> => {
    const res = await api.get<WsiScannerProfile[]>("/wsi-settings/profiles");
    return res.data;
  },

  createProfile: async (data: WsiScannerProfileCreate): Promise<WsiScannerProfile> => {
    const res = await api.post<WsiScannerProfile>("/wsi-settings/profiles", data);
    return res.data;
  },

  updateProfile: async (id: number, data: WsiScannerProfileUpdate): Promise<WsiScannerProfile> => {
    const res = await api.put<WsiScannerProfile>(`/wsi-settings/profiles/${id}`, data);
    return res.data;
  },

  deleteProfile: async (id: number): Promise<void> => {
    await api.delete(`/wsi-settings/profiles/${id}`);
  },

  listFiles: async (): Promise<WsiFileInfo[]> => {
    const res = await api.get<WsiFileInfo[]>("/wsi/list");
    return res.data;
  },

  listWsiFiles: async (params?: {
    skip?: number;
    limit?: number;
    unlinked_only?: boolean;
    parse_confidence?: string;
  }): Promise<WsiFile[]> => {
    const res = await api.get<WsiFile[]>("/wsi/files", { params });
    return res.data;
  },

  triggerScan: async (): Promise<WsiScanResult> => {
    const res = await api.post<WsiScanResult>("/wsi/scan");
    return res.data;
  },

  getBlockSlides: async (blockId: number): Promise<WsiFile[]> => {
    const res = await api.get<WsiFile[]>(`/wsi/block/${blockId}/slides`);
    return res.data;
  },

  getCaseSlides: async (caseId: number): Promise<WsiFile[]> => {
    const res = await api.get<WsiFile[]>(`/wsi/case/${caseId}/slides`);
    return res.data;
  },

  listLinks: async (params?: { status?: string; wsi_file_id?: number; surgical_block_id?: number }): Promise<WsiSlideLink[]> => {
    const res = await api.get<WsiSlideLink[]>("/wsi-links", { params });
    return res.data;
  },

  createLink: async (data: WsiSlideLinkCreate): Promise<WsiSlideLink> => {
    const res = await api.post<WsiSlideLink>("/wsi-links", data);
    return res.data;
  },

  updateLink: async (id: number, data: WsiSlideLinkUpdate): Promise<WsiSlideLink> => {
    const res = await api.patch<WsiSlideLink>(`/wsi-links/${id}`, data);
    return res.data;
  },
};

export default WsiSettingService;
