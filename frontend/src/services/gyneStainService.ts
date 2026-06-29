import api from "./httpClient";
import {
  GyneCytologyStain,
  GyneStainCreate,
  GyneStainUpdate,
  GyneStainRun,
} from "../types/gyne-stain";

const GyneStainService = {
  /**
   * ดึงรายการสไลด์ทั้งหมดของ Case หนึ่งๆ
   */
  getByCaseId: async (caseId: number): Promise<GyneCytologyStain[]> => {
    const res = await api.get<GyneCytologyStain[]>(
      `/gyne-stains/case/${caseId}`,
    );
    return res.data;
  },

  /**
   * สร้างสไลด์เพิ่ม (Manual Add เช่น ขอ Cell Block เพิ่ม)
   */
  create: async (payload: GyneStainCreate): Promise<GyneCytologyStain> => {
    const res = await api.post<GyneCytologyStain>("/gyne-stains", payload);
    return res.data;
  },

  /**
   * อัปเดตสถานะ (Status / Printed)
   */
  update: async (
    stainId: number,
    payload: GyneStainUpdate,
  ): Promise<GyneCytologyStain> => {
    const res = await api.patch<GyneCytologyStain>(
      `/gyne-stains/${stainId}`,
      payload,
    );
    return res.data;
  },

  /**
   * ดึงรายการสไลด์ที่ "เพิ่งลงทะเบียน" เพื่อนำมาจัด Batch ย้อม
   * 🚩 เปลี่ยนมาใช้ /registered-queue ให้ตรงกับ Backend ล่าสุด
   */
  getRegisteredQueue: async (): Promise<GyneCytologyStain[]> => {
    const res = await api.get<GyneCytologyStain[]>(
      "/gyne-stains/registered-queue",
    );
    return res.data;
  },

  /**
   * ดึงรายการสไลด์ที่รอพิมพ์ Label
   */
  getPendingPrint: async (): Promise<GyneCytologyStain[]> => {
    const res = await api.get<GyneCytologyStain[]>(
      "/gyne-stains/pending-print",
    );
    return res.data;
  },

  /**
   * ยืนยันการส่งย้อมแบบกลุ่ม (Batch) ของแผนก Gyne โดยเฉพาะ
   * 🚩 ชี้ไปที่ Endpoint ใหม่ที่แยกออกจาก Surgical
   */
  createStainRun: async (
    stainerId: string,
    stainIds: number[],
    runName: string,
  ): Promise<any> => {
    // 🚩 ยิงไปที่ /gyne-stains/runs (หรือตามที่คุณตั้งใน Backend)
    // สังเกตว่าเราไม่ต้องส่ง type: "gyne" แล้ว เพราะ Endpoint นี้จัดการ Gyne โดยตรง
    const res = await api.post("/gyne-stains/runs", {
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
  ): Promise<{ total: number; items: GyneStainRun[] }> => {
    const res = await api.get<{ total: number; items: GyneStainRun[] }>(
      "/gyne-stains/runs",
      { params: { skip, limit } },
    );
    return res.data;
  },

  printRunStickers: async (runId: number): Promise<Blob> => {
    const res = await api.get(`/gyne-stains/runs/${runId}/print-stickers`, {
      responseType: "blob",
    });
    return res.data;
  },

  getRunById: async (runId: number): Promise<GyneStainRun> => {
    const res = await api.get<GyneStainRun>(`/gyne-stains/runs/${runId}`);
    return res.data;
  },

  completeRun: async (runId: number): Promise<GyneStainRun> => {
    const res = await api.patch<GyneStainRun>(`/gyne-stains/runs/${runId}`, {
      status: "completed",
    });
    return res.data;
  },
};

export default GyneStainService;
