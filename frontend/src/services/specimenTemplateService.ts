import api from "./httpClient";

export type SpecimenCategory = "surgical" | "gyne_cyto" | "nongyne_cyto";

export interface SpecimenTemplate {
  id: number;
  name: string;
  category: SpecimenCategory;
  default_slide_count: number;
  requires_slide_count: boolean;
  requires_volume: boolean;
  sort_order: number;
}

export interface SpecimenTemplatePayload {
  name: string;
  category?: SpecimenCategory;
  default_slide_count?: number;
  requires_slide_count?: boolean;
  requires_volume?: boolean;
}

const SpecimenTemplateService = {
  getTemplates: async (category?: SpecimenCategory): Promise<SpecimenTemplate[]> => {
    const res = await api.get<SpecimenTemplate[]>("/specimen-templates", {
      params: category ? { category } : undefined,
    });
    return res.data;
  },

  createTemplate: async (payload: SpecimenTemplatePayload): Promise<SpecimenTemplate> => {
    const res = await api.post<SpecimenTemplate>("/specimen-templates", payload);
    return res.data;
  },

  updateTemplate: async (id: number, payload: SpecimenTemplatePayload): Promise<SpecimenTemplate> => {
    const res = await api.patch<SpecimenTemplate>(`/specimen-templates/${id}`, payload);
    return res.data;
  },

  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/specimen-templates/${id}`);
  },

  reorderTemplates: async (
    category: SpecimenCategory,
    ids: number[],
  ): Promise<SpecimenTemplate[]> => {
    const res = await api.patch<SpecimenTemplate[]>("/specimen-templates/reorder", {
      category,
      ids,
    });
    return res.data;
  },
};

export default SpecimenTemplateService;
