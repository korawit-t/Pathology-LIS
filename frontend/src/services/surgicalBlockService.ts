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
  has_pending_outlab?: boolean;
  /** Blocks carrying at least one in-house (non-external, non-routine-H&E)
   * stain. Like has_pending_outlab, the backend returns every match rather
   * than a page of them. */
  has_internal_stain?: boolean;
}

export type InternalStainBucket = "all" | "pending" | "completed" | "recut";

export interface InternalStainCasesParams {
  /** Matched against accession number and specimen label. */
  search?: string;
  bucket?: InternalStainBucket;
  skip?: number;
  limit?: number;
}

export interface InternalStainCase {
  accession_no: string;
  blocks: SurgicalBlock[];
}

export interface InternalStainCasePage {
  items: InternalStainCase[];
  total: number;
  /** Across every matching case, not just this page — they label the
   * segmented filter and must not change as you page. */
  bucket_counts: Record<InternalStainBucket, number>;
  slide_totals: { pending: number; stained: number };
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

  /**
   * One page of the Internal Stain Orders worklist. Paginated by *case*, not
   * by block: the page groups blocks under their accession number, so a
   * block-level page would cut a case in half.
   */
  getInternalStainCases: async (
    params: InternalStainCasesParams = {},
  ): Promise<InternalStainCasePage> => {
    const res = await api.get("/surgical-blocks/internal-stain-cases", { params });
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
