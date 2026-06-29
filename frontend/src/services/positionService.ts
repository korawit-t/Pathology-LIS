// src/services/positionService.ts
import api from "./httpClient";

/**
 * Interface สำหรับข้อมูลตำแหน่ง (Position)
 */
export interface Position {
  id: number;
  name: string;
  description?: string;
  level?: number;
}

const PositionService = {
  /**
   * ดึงรายการตำแหน่งทั้งหมด
   */
  getPositions: async (): Promise<Position[]> => {
    const res = await api.get("/org/positions");
    return res.data;
  },

  /**
   * ดึงข้อมูลตำแหน่งรายบุคคลตาม ID
   */
  getPositionById: async (id: number): Promise<Position> => {
    const res = await api.get(`/org/positions/${id}`);
    return res.data;
  },

  /**
   * สร้างตำแหน่งใหม่
   */
  createPosition: async (payload: Partial<Position>): Promise<Position> => {
    const res = await api.post("/org/positions", payload);
    return res.data;
  },

  /**
   * อัปเดตข้อมูลตำแหน่ง
   */
  updatePosition: async (
    id: number,
    payload: Partial<Position>,
  ): Promise<Position> => {
    const res = await api.put(`/org/positions/${id}`, payload);
    return res.data;
  },

  /**
   * ลบตำแหน่ง
   */
  deletePosition: async (id: number): Promise<void> => {
    await api.delete(`/org/positions/${id}`);
  },
};

export default PositionService;
