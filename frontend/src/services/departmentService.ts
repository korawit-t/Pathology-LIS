// src/services/departmentService.ts
import api from "./httpClient";
import { Department } from "../types/department";

const DepartmentService = {
  /**
   * ดึงรายชื่อแผนกทั้งหมด
   * @param activeOnly ถ้าเป็น true จะดึงเฉพาะแผนกที่ใช้งานอยู่
   */
  getDepartments: async (activeOnly = false): Promise<Department[]> => {
    const res = await api.get<Department[]>("/org/departments", {
      params: { active_only: activeOnly },
    });
    return res.data;
  },

  /**
   * ดึงข้อมูลแผนกรายตัวตาม ID
   */
  getDepartmentById: async (id: number): Promise<Department> => {
    const res = await api.get<Department>(`/org/departments/${id}`);
    return res.data;
  },

  /**
   * สร้างแผนกใหม่
   */
  createDepartment: async (
    payload: Partial<Department>,
  ): Promise<Department> => {
    const res = await api.post<Department>("/org/departments", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลแผนก (ใช้ PATCH ตาม Backend)
   */
  updateDepartment: async (
    id: number,
    payload: Partial<Department>,
  ): Promise<Department> => {
    const res = await api.patch<Department>(`/org/departments/${id}`, payload);
    return res.data;
  },

  /**
   * ลบแผนก
   */
  deleteDepartment: async (id: number): Promise<void> => {
    await api.delete(`/org/departments/${id}`);
  },
};

export default DepartmentService;
