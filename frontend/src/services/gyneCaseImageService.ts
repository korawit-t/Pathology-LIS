import api from "./httpClient";

export interface GyneCaseImage {
  id: number;
  case_id: number;
  image_url: string;
  original_filename?: string;
  description?: string;
  stain?: string;
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
    stain?: string,
  ): Promise<GyneCaseImage> => {
    const form = new FormData();
    form.append("file", file);
    if (description) form.append("description", description);
    if (stain) form.append("stain", stain);
    form.append("order", String(order ?? 1));
    form.append("show_in_report", String(showInReport ?? true));
    const res = await api.post<GyneCaseImage>(`/gyne-cytology/${caseId}/images`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  update: async (
    imageId: number,
    payload: { description?: string; stain?: string; order?: number; show_in_report?: boolean },
  ): Promise<GyneCaseImage> => {
    const res = await api.patch<GyneCaseImage>(`/gyne-cytology/images/${imageId}`, payload);
    return res.data;
  },


  /**
   * 🔁 แทนที่ไฟล์รูปเดิมด้วยรูปที่แก้แล้ว (crop / หมุน / annotate) — PUT
   * แถวใน DB และ metadata ทั้งหมดคงเดิม เปลี่ยนแค่ตัวไฟล์
   */
  replaceContent: async (imageId: number, blob: Blob, fileName = "edited.jpg"): Promise<GyneCaseImage> => {
    const form = new FormData();
    form.append("file", blob, fileName);
    const res = await api.put<GyneCaseImage>(`/gyne-cytology/images/${imageId}/content`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  delete: async (imageId: number): Promise<void> => {
    await api.delete(`/gyne-cytology/images/${imageId}`);
  },
};

export default GyneCaseImageService;
