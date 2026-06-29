import api from "./httpClient";
import {
  SectioningRunResponse,
  SectioningBatchPayload,
  SectioningDetailPayload,
} from "../types/sectioning";

const SectioningService = {
  /**
   * ดึงรายการรอบการตัดทั้งหมด (Active / History)
   */
  getAllRuns: async (
    params: Record<string, string | number | boolean> = {},
  ): Promise<SectioningRunResponse[]> => {
    const res = await api.get<SectioningRunResponse[]>("/sectioning/runs", {
      params,
    });
    return res.data;
  },

  /**
   * ดึงรายละเอียดของรอบการตัด (พร้อม details)
   */
  getRunDetail: async (
    runId: number | string,
  ): Promise<SectioningRunResponse> => {
    const res = await api.get<SectioningRunResponse>(
      `/sectioning/runs/${runId}`,
    );
    return res.data;
  },

  /**
   * สร้างรอบการตัดใหม่
   */
  createRun: async (
    payload: Partial<SectioningBatchPayload>,
  ): Promise<SectioningRunResponse> => {
    const res = await api.post<SectioningRunResponse>(
      "/sectioning/runs",
      payload,
    );
    return res.data;
  },

  /**
   * สร้างรอบการตัดแบบ batch (สร้าง run + details)
   */
  createRunBatch: async (
    payload: SectioningBatchPayload,
  ): Promise<SectioningRunResponse> => {
    const res = await api.post<SectioningRunResponse>(
      "/sectioning/batch",
      payload,
    );
    return res.data;
  },

  /**
   * ปิดรอบการตัด
   */
  finishRun: async (runId: number | string): Promise<void> => {
    await api.put(`/sectioning/runs/${runId}/finish`);
  },

  /**
   * ลบรอบการตัด
   */
  deleteRun: async (runId: number | string): Promise<void> => {
    await api.delete(`/sectioning/runs/${runId}`);
  },

  /**
   * เพิ่มรายการตัด (detail) เข้า run
   */
  addDetail: async (
    runId: number | string,
    payload: SectioningDetailPayload,
  ): Promise<unknown> => {
    const res = await api.post(`/sectioning/runs/${runId}/details`, payload);
    return res.data;
  },

  /**
   * เพิ่ม details แบบ batch
   */
  batchAddDetails: async (
    runId: number | string,
    items: SectioningDetailPayload[],
  ): Promise<unknown> => {
    const res = await api.post(`/sectioning/runs/${runId}/batch-details`, {
      items,
    });
    return res.data;
  },

  /**
   * แก้ไขรายละเอียดการตัด
   */
  updateDetail: async (
    detailId: number | string,
    payload: Partial<SectioningDetailPayload>,
  ): Promise<unknown> => {
    const res = await api.patch(`/sectioning/details/${detailId}`, payload);
    return res.data;
  },

  /**
   * ลบ detail ออกจากรอบ
   */
  removeDetail: async (detailId: number | string): Promise<void> => {
    await api.delete(`/sectioning/details/${detailId}`);
  },

  /**
   * ดึงรายการตลับเนื้อที่พร้อมตัด
   */
  getPendingBlocks: async (): Promise<unknown[]> => {
    const res = await api.get("/sectioning/pending-blocks");
    return res.data;
  },

  /**
   * ดึง pending blocks แบบ tree (Case > Blocks)
   */
  getPendingBlocksTree: async (): Promise<unknown> => {
    const res = await api.get("/sectioning/pending-tree");
    return res.data;
  },
};

export default SectioningService;
