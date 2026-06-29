import api from "./httpClient";

export type SpecimenCategory = "surgical" | "gyne_cyto" | "nongyne_cyto";

export interface SpecimenTemplate {
  id: number;
  name: string;
  category: SpecimenCategory;
}

export interface SpecimenTemplatePayload {
  name: string;
  category?: SpecimenCategory;
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
};

export default SpecimenTemplateService;
