import api from "./httpClient";
import { User } from "../types/user";

export interface UserPreferences {
  layoutMode?: string;
  theme?: string;
  is_split_mode?: boolean;
  default_diagnosis_mode?: string;
  patient_info_expanded?: boolean;
  show_navigator?: boolean;
  auto_save?: boolean;
  auto_save_interval?: number;              // seconds: 30 | 45 | 60 | 90
  editor_font_size?: "small" | "medium" | "large";
  show_specimen_category?: boolean;
  [key: string]: unknown;
}

const UserService = {
  // ดึงข้อมูล User ทั้งหมด
  getUsers: async (params?: Record<string, any>): Promise<User[]> => {
    const res = await api.get<User[]>("/users", {
      params: {
        limit: 1000,
        ...params,
      },
    });
    return res.data;
  },

  getUserById: async (id: number): Promise<User> => {
    const res = await api.get<User>(`/users/${id}`);
    return res.data;
  },

  // 🚩 ดึงข้อมูลตัวเอง
  getCurrentUser: async (): Promise<User> => {
    const res = await api.get<User>("/users/me");
    return res.data;
  },

  // 🚩 อัปเดต preferences
  updateMyPreferences: async (preferences: UserPreferences): Promise<User> => {
    const res = await api.patch<User>("/users/me/preferences", preferences);
    return res.data;
  },

  createUser: async (payload: Partial<User>): Promise<User> => {
    const res = await api.post<User>("/users", payload);
    return res.data;
  },

  updateUser: async (id: number, payload: Partial<User>): Promise<User> => {
    const res = await api.put<User>(`/users/${id}`, payload);
    return res.data;
  },

  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

export default UserService;
