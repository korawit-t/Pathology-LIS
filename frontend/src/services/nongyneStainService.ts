import api from "./httpClient";
import {
  NongyneCytologyStain,
  NongyneStainCreate,
  NongyneStainUpdate,
  NongyneStainRun,
} from "../types/nongyne-stain";

const NongyneStainService = {
  /**
   * ดึงรายการสไลด์ทั้งหมดของ Case หนึ่งๆ
   */
  getByCaseId: async (caseId: number): Promise<NongyneCytologyStain[]> => {
    const res = await api.get<NongyneCytologyStain[]>(
      `/nongyne-stains/case/${caseId}`,
    );
    return res.data;
  },

  /**
   * สร้างสไลด์เพิ่ม (Manual Add เช่น ขอ Cell Block เพิ่ม)
   */
  create: async (payload: NongyneStainCreate): Promise<NongyneCytologyStain> => {
    const res = await api.post<NongyneCytologyStain>("/nongyne-stains", payload);
    return res.data;
  },

  /**
   * อัปเดตสถานะ (Status / Printed)
   */
  update: async (
    stainId: number,
    payload: NongyneStainUpdate,
  ): Promise<NongyneCytologyStain> => {
    const res = await api.patch<NongyneCytologyStain>(
      `/nongyne-stains/${stainId}`,
      payload,
    );
    return res.data;
  },

  /**
   * ดึงรายการสไลด์ที่ "เพิ่งลงทะเบียน" เพื่อนำมาจัด Batch ย้อม
   */
  getRegisteredQueue: async (): Promise<NongyneCytologyStain[]> => {
    const res = await api.get<NongyneCytologyStain[]>(
      "/nongyne-stains/registered-queue",
    );
    return res.data;
  },

  /**
   * ดึงรายการสไลด์ที่รอพิมพ์ Label
   */
  getPendingPrint: async (): Promise<NongyneCytologyStain[]> => {
    const res = await api.get<NongyneCytologyStain[]>(
      "/nongyne-stains/pending-print",
    );
    return res.data;
  },

  /**
   * ยืนยันการส่งย้อมแบบกลุ่ม (Batch) ของแผนก Nongyne โดยเฉพาะ
   */
  createStainRun: async (
    stainerId: string,
    stainIds: number[],
    runName: string,
  ): Promise<any> => {
    const res = await api.post("/nongyne-stains/runs", {
      stainer_id: stainerId,
      stain_ids: stainIds,
      run_name: runName,
    });
    return res.data;
  },

  /**
   * ดึงรายการประวัติการย้อมทั้งหมด (พร้อมระบบ Pagination)
   * @param skip จำนวนรายการที่ข้าม
   * @param limit จำนวนรายการที่ดึงต่อหน้า
   */
  getAllRuns: async (
    skip: number = 0,
    limit: number = 20,
  ): Promise<{ total: number; items: NongyneStainRun[] }> => {
    const res = await api.get<{ total: number; items: NongyneStainRun[] }>(
      "/nongyne-stains/runs",
      {
        params: { skip, limit },
      },
    );
    return res.data;
  },

  printRunStickers: async (runId: number): Promise<Blob> => {
    const res = await api.get(`/nongyne-stains/runs/${runId}/print-stickers`, {
      responseType: "blob",
    });
    return res.data;
  },
};

export default NongyneStainService;
