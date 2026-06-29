import api from "./httpClient";
import { AxiosResponse } from "axios";

// 🚩 กำหนดโครงสร้างข้อมูลให้ตรงกับตาราง Master Data ใน DB
export interface AnatomicalPathologyTest {
  id: number;
  name: string;
  code?: string;
  system_code?: string;
  category: "Surgical" | "Cytology" | string;
  price_tier_1?: number;
  price_tier_2?: number;
  price_tier_3?: number;
  is_active?: boolean;
  is_external?: boolean;
  is_default_for_category?: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

// 🚩 สำหรับการสร้างหรือแก้ไขข้อมูล (ไม่บังคับส่ง ID)
export type AnatomicalPathologyTestCreate = Omit<
  AnatomicalPathologyTest,
  "id" | "created_at" | "updated_at"
>;
export type AnatomicalPathologyTestUpdate =
  Partial<AnatomicalPathologyTestCreate>;

const AnatomicalPathologyTestService = {
  // ดึงรายการทั้งหมด
  getAllTests: (): Promise<AxiosResponse<AnatomicalPathologyTest[]>> => {
    return api.get<AnatomicalPathologyTest[]>("/anatomical-pathology-tests");
  },

  // ดึงข้อมูลรายตัว
  getTestById: (
    id: number,
  ): Promise<AxiosResponse<AnatomicalPathologyTest>> => {
    return api.get<AnatomicalPathologyTest>(
      `/anatomical-pathology-tests/${id}`,
    );
  },

  // สร้างรายการใหม่
  createTest: (
    payload: AnatomicalPathologyTestCreate,
  ): Promise<AxiosResponse<AnatomicalPathologyTest>> => {
    return api.post<AnatomicalPathologyTest>(
      "/anatomical-pathology-tests",
      payload,
    );
  },

  // อัปเดตข้อมูล
  updateTest: (
    id: number,
    payload: AnatomicalPathologyTestUpdate,
  ): Promise<AxiosResponse<AnatomicalPathologyTest>> => {
    return api.put<AnatomicalPathologyTest>(
      `/anatomical-pathology-tests/${id}`,
      payload,
    );
  },

  // ลบรายการ
  deleteTest: (id: number): Promise<AxiosResponse<{ message: string }>> => {
    return api.delete(`/anatomical-pathology-tests/${id}`);
  },
};

export default AnatomicalPathologyTestService;
