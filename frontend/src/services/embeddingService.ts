import api from "./httpClient";
import {
  EmbeddingRunResponse, // เปลี่ยนจาก EmbeddingRun
  EmbeddingDetailResponse, // เปลี่ยนจาก EmbeddingDetail
  EmbeddingRunCreate,
  ScanBlockRequest,
  PendingBlock,
  PendingTree,
} from "../types/embedding";

const EmbeddingService = {
  /**
   * --- Run Management ---
   */

  createRun: async (
    payload: EmbeddingRunCreate,
  ): Promise<EmbeddingRunResponse> => {
    const res = await api.post<EmbeddingRunResponse>(
      "/embedding/runs",
      payload,
    );
    return res.data;
  },

  deleteRun: async (id: number): Promise<void> => {
    await api.delete(`/embedding/runs/${id}`);
  },

  getRuns: async (params = {}): Promise<EmbeddingRunResponse[]> => {
    const res = await api.get<EmbeddingRunResponse[]>("/embedding/runs", {
      params,
    });
    return res.data;
  },

  getRunById: async (id: number): Promise<EmbeddingRunResponse> => {
    const res = await api.get<EmbeddingRunResponse>(`/embedding/runs/${id}`);
    return res.data;
  },

  finishRun: async (
    id: number,
    payload: { finish_time?: string },
  ): Promise<EmbeddingRunResponse> => {
    const res = await api.patch<EmbeddingRunResponse>(
      `/embedding/runs/${id}/finish`,
      payload,
    );
    return res.data;
  },

  /**
   * --- Block Operations ---
   */

  // สแกนตลับเนื้อ (ใช้ ScanBlockRequest ตามที่คุณนิยามไว้)
  scanBlock: async (
    payload: ScanBlockRequest,
  ): Promise<EmbeddingDetailResponse> => {
    const res = await api.post<EmbeddingDetailResponse>(
      "/embedding/scan",
      payload,
    );
    return res.data;
  },

  batchAddBlocks: async (payload: {
    run_id: number;
    block_ids: number[];
  }): Promise<EmbeddingDetailResponse[]> => {
    const res = await api.post<EmbeddingDetailResponse[]>(
      "/embedding/batch-add",
      payload,
    );
    return res.data;
  },

  removeBlockFromRun: async (detailId: number): Promise<void> => {
    await api.delete(`/embedding/details/${detailId}`);
  },

  /**
   * --- Pending / Backlog Data ---
   */

  // สำหรับดึงรายการตลับเนื้อที่รอหล่อบล็อก (Flat List)
  getPendingBlocks: async (): Promise<PendingBlock[]> => {
    const res = await api.get<PendingBlock[]>("/embedding/pending-blocks");
    return res.data;
  },

  // สำหรับ Modal ที่ต้องการโครงสร้าง Case > Blocks
  // ตัวนี้จะคืนค่าเป็น Array ของ Case ที่มี field 'children' เป็นรายการ Blocks
  getPendingBlocksTree: async (): Promise<PendingTree[]> => {
    const res = await api.get<PendingTree[]>("/embedding/pending-tree");
    return res.data;
  },
};

export default EmbeddingService;
