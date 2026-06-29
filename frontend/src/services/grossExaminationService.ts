// frontend/src/services/grossExaminationService.ts
import api from "./httpClient";
import { User } from "../types/user";
import { Patient } from "../types/patient";
import { SurgicalCase } from "../types/surgical"; // สมมติว่าเก็บไว้ที่นี่

// นิยามโครงสร้างการตอบกลับของ Pagination
interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

const GrossExaminationService = {
  /**
   * ดึงข้อมูล cases ทั้งหมดสำหรับงาน Gross
   * @returns { items: SurgicalCase[], total: number }
   */
  getCases: async (
    skip: number = 0,
    limit: number = 20,
    search: string = "",
    status?: string[],
    hospital_id?: number,
  ): Promise<PaginatedResponse<SurgicalCase>> => {
    const res = await api.get<PaginatedResponse<SurgicalCase>>(
      "/surgical-cases",
      {
        params: {
          skip,
          limit,
          search,
          ...(status?.length ? { status } : {}),
          ...(hospital_id != null ? { hospital_id } : {}),
        },
      },
    );
    return res.data;
  },

  /**
   * ดึงข้อมูลคนไข้
   */
  getPatients: async (limit: number = 1000): Promise<Patient[]> => {
    const res = await api.get<Patient[]>("/patients", {
      params: { limit },
    });
    return res.data;
  },

  /**
   * ดึงข้อมูลผู้ใช้งาน (เช่น พยาธิแพทย์, Gross Examiner)
   */
  getUsers: async (limit: number = 1000): Promise<User[]> => {
    const res = await api.get<User[]>("/users", {
      params: { limit },
    });
    return res.data;
  },

  /**
   * อัปเดตข้อมูล case (ใช้ PATCH สำหรับการลงผล Gross เฉพาะส่วน)
   */
  updateCase: async (
    id: number,
    payload: Partial<SurgicalCase>,
  ): Promise<SurgicalCase> => {
    const res = await api.patch<SurgicalCase>(`/surgical-cases/${id}`, payload);
    return res.data;
  },

  /**
   * ดึงข้อมูล case รายบุคคล
   */
  getCaseById: async (id: number): Promise<SurgicalCase> => {
    const res = await api.get<SurgicalCase>(`/surgical-cases/${id}`);
    return res.data;
  },
};

export default GrossExaminationService;
