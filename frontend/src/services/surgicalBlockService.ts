// src/services/surgicalBlockService.ts
import api from "./httpClient";
import type { SurgicalBlock } from "../types/surgical";

interface GetBlocksParams {
  skip?: number;
  limit?: number;
  specimen_id?: number;
  case_id?: number;
  is_decal?: boolean;
  is_fixing?: boolean;
  decal_history?: boolean;
  fix_history?: boolean;
}

const SurgicalBlockService = {
  // ✅ 1. แก้เป็น async/await และ return res.data
  createBlock: async (payload: Partial<SurgicalBlock>) => {
    const res = await api.post("/surgical-blocks", payload);
    return res.data;
  },

  /**
   * ดึง blocks พร้อมรองรับ Filtering: specimen_id
   */
  getBlocks: async (params: GetBlocksParams = {}) => {
    const finalParams = { skip: 0, limit: 100, ...params };
    const res = await api.get("/surgical-blocks", {
      params: finalParams,
    });
    return res.data;
  },

  // ✅ 2. แก้เป็น async/await และ return res.data
  getBlockById: async (id: number) => {
    const res = await api.get(`/surgical-blocks/${id}`);
    return res.data;
  },

  // ✅ 3. แก้เป็น async/await และ return res.data
  updateBlock: async (id: number, payload: Partial<SurgicalBlock>) => {
    const res = await api.put(`/surgical-blocks/${id}`, payload);
    return res.data;
  },

  // ✅ 4. แก้เป็น async/await และ return res.data
  deleteBlock: async (id: number): Promise<void> => {
    await api.delete(`/surgical-blocks/${id}`);
  },

  // ✅ 5. แก้เป็น async/await และ return res.data
  getBlocksWithStains: async (params: GetBlocksParams = {}) => {
    const res = await api.get("/surgical-blocks", { params });
    return res.data;
  },
};

export default SurgicalBlockService;
