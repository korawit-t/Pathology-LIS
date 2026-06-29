import api from "./httpClient";

export interface GyneCaseImage {
  id: number;
  case_id: number;
  image_url: string;
  original_filename?: string;
  description?: string;
  show_in_report: boolean;
  order: number;
  uploaded_at: string;
}

const GyneCaseImageService = {
  getImages: async (caseId: number): Promise<GyneCaseImage[]> => {
    const res = await api.get<GyneCaseImage[]>(`/gyne-cytology/${caseId}/images`);
    return res.data;
  },

  upload: async (
    caseId: number,
    file: File,
    description?: string,
    order?: number,
    showInReport?: boolean,
  ): Promise<GyneCaseImage> => {
    const form = new FormData();
    form.append("file", file);
    if (description) form.append("description", description);
    form.append("order", String(order ?? 1));
    form.append("show_in_report", String(showInReport ?? true));
    const res = await api.post<GyneCaseImage>(`/gyne-cytology/${caseId}/images`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  update: async (
    imageId: number,
    payload: { description?: string; order?: number; show_in_report?: boolean },
  ): Promise<GyneCaseImage> => {
    const res = await api.patch<GyneCaseImage>(`/gyne-cytology/images/${imageId}`, payload);
    return res.data;
  },

  delete: async (imageId: number): Promise<void> => {
    await api.delete(`/gyne-cytology/images/${imageId}`);
  },
};

export default GyneCaseImageService;
