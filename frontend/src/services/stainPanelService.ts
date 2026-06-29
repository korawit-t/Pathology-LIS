import api from "./httpClient";
import { AnatomicalPathologyTest } from "./anatomicalTestService";

export interface StainPanelItem {
  id: number;
  test_id: number;
  sort_order: number;
  test: AnatomicalPathologyTest;
}

export interface StainPanel {
  id: number;
  name: string;
  category: string;
  description?: string;
  is_active: boolean;
  items: StainPanelItem[];
  created_at: string;
  updated_at: string;
}

export interface StainPanelCreatePayload {
  name: string;
  category?: string;
  description?: string;
  test_ids: number[];
}

export interface StainPanelUpdatePayload {
  name?: string;
  category?: string;
  description?: string;
  is_active?: boolean;
  test_ids?: number[];
}

const StainPanelService = {
  getPanels: async (category?: string): Promise<StainPanel[]> => {
    const res = await api.get<StainPanel[]>("/stain-panels", {
      params: category ? { category } : undefined,
    });
    return res.data;
  },

  createPanel: async (payload: StainPanelCreatePayload): Promise<StainPanel> => {
    const res = await api.post<StainPanel>("/stain-panels", payload);
    return res.data;
  },

  updatePanel: async (id: number, payload: StainPanelUpdatePayload): Promise<StainPanel> => {
    const res = await api.patch<StainPanel>(`/stain-panels/${id}`, payload);
    return res.data;
  },

  deletePanel: async (id: number): Promise<void> => {
    await api.delete(`/stain-panels/${id}`);
  },
};

export default StainPanelService;
