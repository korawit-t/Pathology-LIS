// frontend/src/services/titleService.ts
import api from "./httpClient";
import { Title, TitlePayload } from "../types/title";

const TitleService = {
  /**
   * 📋 ดึงคำนำหน้าทั้งหมด
   */
  getTitles: async (): Promise<Title[]> => {
    const res = await api.get<Title[]>("/org/titles");
    return res.data;
  },

  /**
   * 🔍 ดึงคำนำหน้าตาม ID
   */
  getTitleById: async (id: number): Promise<Title> => {
    const res = await api.get<Title>(`/org/titles/${id}`);
    return res.data;
  },

  /**
   * ➕ สร้างคำนำหน้าใหม่
   */
  createTitle: async (payload: TitlePayload): Promise<Title> => {
    const res = await api.post<Title>("/org/titles", payload);
    return res.data;
  },

  /**
   * ✏️ แก้ไขคำนำหน้า
   */
  updateTitle: async (
    id: number,
    payload: Partial<TitlePayload>,
  ): Promise<Title> => {
    const res = await api.put<Title>(`/org/titles/${id}`, payload);
    return res.data;
  },

  /**
   * 🗑️ ลบคำนำหน้า
   */
  deleteTitle: async (id: number): Promise<void> => {
    await api.delete(`/org/titles/${id}`);
  },
};

export default TitleService;
