import api from "./httpClient";
import {
  StainRequest,
  HEStainRunCreate,
  StainingRunResponse,
  StainCategory,
  PendingStainNode,
} from "../types/stains";

export interface OutlabRun {
  id: number;
  run_no?: string;
  sent_at?: string;
  received_at?: string;
  destination_lab?: string;
  tracking_number?: string;
  status: string;
  details?: unknown[];
}

interface StainQueryParams {
  status?: "pending" | "stained" | "completed";
  category?: StainCategory;
  test_id?: number;
  block_id?: number;
  is_external?: boolean;
  skip?: number;
  limit?: number;
}

const SurgicalBlockStainService = {
  // 0. จำนวน recut ที่ยังค้างอยู่
  getRecutCount: async (): Promise<number> => {
    const res = await api.get<{ count: number }>("/surgical-block-stains/recut-count");
    return res.data.count;
  },

  // 1. ดึงรายการย้อมทั้งหมด
  getAllStains: async (
    params: StainQueryParams = {},
  ): Promise<StainRequest[]> => {
    const res = await api.get<StainRequest[]>("/surgical-block-stains", {
      params,
    });
    return res.data;
  },

  // 2. ดึงสไลด์ที่ยังไม่ได้พิมพ์ (ถ้า Backend รองรับ)
  getUnprintedStains: async (
    category?: StainCategory,
  ): Promise<StainRequest[]> => {
    const res = await api.get<StainRequest[]>(
      "/surgical-block-stains/unprinted",
      {
        params: { category },
      },
    );
    return res.data;
  },

  // 3. สร้างรอบการย้อม H&E (Batch Run)
  createHEBatchRun: async (
    payload: HEStainRunCreate,
  ): Promise<StainingRunResponse> => {
    const res = await api.post<StainingRunResponse>(
      "/surgical-block-stains/batch-run",
      payload,
    );
    return res.data;
  },

  // 4. 🚩 แก้ไข: ดึงข้อมูล Tree สำหรับงานค้างย้อม (เปลี่ยนเป็น test_id)
  getPendingHETree: async (params?: {
    test_id?: number;
  }): Promise<PendingStainNode[]> => {
    const res = await api.get<PendingStainNode[]>(
      "/surgical-block-stains/pending-tree",
      {
        params,
      },
    );
    return res.data;
  },

  // 5. สร้างรายการย้อมใหม่ (Special Stain / IHC)
  // 🚩 ส่ง test_id เข้าไปใน payload แทน stain_type
  createStain: async (
    payload: Partial<StainRequest>,
  ): Promise<StainRequest> => {
    const res = await api.post<StainRequest>(
      "/surgical-block-stains",
      payload,
    );
    return res.data;
  },

  // 6. อัปเดตข้อมูลการย้อม
  updateStain: async (
    id: number,
    payload: Partial<StainRequest>,
  ): Promise<StainRequest> => {
    const res = await api.put<StainRequest>(
      `/surgical-block-stains/${id}`,
      payload,
    );
    return res.data;
  },

  // 7. อัปเดตสถานะการพิมพ์สติกเกอร์ (ตรวจสอบว่า Backend มี Patch นี้ไหม)
  markAsPrinted: async (id: number): Promise<unknown> => {
    const res = await api.patch(`/surgical-block-stains/${id}/print-status`, {
      is_printed: true,
      printed_at: new Date().toISOString(),
    });
    return res.data;
  },

  // 8. ลบรายการย้อมรายแผ่น
  deleteStain: async (id: number): Promise<void> => {
    await api.delete(`/surgical-block-stains/${id}`);
  },

  // 9. ดึงประวัติรอบการย้อมทั้งหมด
  getStainingRuns: async (): Promise<StainingRunResponse[]> => {
    const res = await api.get<StainingRunResponse[]>(
      "/surgical-block-stains/runs",
    );
    return res.data;
  },

  // 10. ลบรอบการย้อม
  deleteStainingRun: async (id: number): Promise<void> => {
    await api.delete(`/surgical-block-stains/runs/${id}`);
  },

  // 11. ดึงไฟล์ PDF สำหรับพิมพ์สติกเกอร์ (คืนค่าเป็น Blob)
  printStickers: async (runId: number): Promise<Blob> => {
    const res = await api.get(
      `/surgical-block-stains/run/${runId}/print-stickers`,
      {
        responseType: "blob",
      },
    );
    return res.data;
  },

  // 12. 🚩 แก้ไข: ดึงคำสั่งย้อมตาม Accession No (ปรับ Type Return)
  getStainOrdersByAccession: async (
    accessionNo: string,
  ): Promise<StainRequest[]> => {
    const res = await api.get<StainRequest[]>(
      `/surgical-block-stains/stain-orders/${accessionNo}`,
    );
    return res.data;
  },

  markStainsPrinted: async (stainIds: number[]): Promise<void> => {
    await api.post("/surgical-block-stains/mark-printed", { stain_ids: stainIds });
  },

  // 13. พิมพ์สไลด์ H&E รายแผ่น (Quick Print)
  printHEStickerQuick: async (stainIds: number[]): Promise<Blob> => {
    const res = await api.post(
      `/surgical-block-stains/print-he-quick`,
      { stain_ids: stainIds },
      { responseType: "blob" },
    );
    return res.data;
  },

  // --- Outlab Runs ---
  createOutlabRun: async (payload: { destination_lab: string; stain_ids: number[]; tracking_number?: string }): Promise<unknown> => {
    const res = await api.post("/surgical-block-stains/outlab-runs", payload);
    return res.data;
  },

  updateOutlabRun: async (id: number, payload: { tracking_number?: string }): Promise<unknown> => {
    const res = await api.patch(`/surgical-block-stains/outlab-runs/${id}`, payload);
    return res.data;
  },

  getOutlabRuns: async (params?: { skip?: number; limit?: number }): Promise<OutlabRun[]> => {
    const res = await api.get("/surgical-block-stains/outlab-runs", { params });
    return res.data;
  },

  /**
   * Not-yet-HosXP-keyed outlab items grouped by HN, in one backend query —
   * used by TodayPatientsTab instead of fetching all runs + an N+1
   * per-accession case-search loop.
   */
  getPendingOutlabByHn: async (): Promise<Record<string, {
    patient_name: string;
    items: {
      id: number;
      accession_no: string | null;
      block_code: string | null;
      stain_name: string;
      destination_lab: string | null;
    }[];
  }>> => {
    const res = await api.get("/surgical-block-stains/outlab-runs/pending-by-hn");
    return res.data;
  },

  deleteOutlabRun: async (id: number): Promise<void> => {
    await api.delete(`/surgical-block-stains/outlab-runs/${id}`);
  },

  receiveOutlabRun: async (id: number): Promise<unknown> => {
    const res = await api.patch(`/surgical-block-stains/outlab-runs/${id}/receive`);
    return res.data;
  },

  receiveOutlabRunDetails: async (runId: number, detailIds: number[]): Promise<unknown> => {
    const res = await api.patch(`/surgical-block-stains/outlab-runs/${runId}/receive-details`, {
      detail_ids: detailIds,
    });
    return res.data;
  },

  toggleHosxpKeyed: async (detailId: number, keyed: boolean): Promise<unknown> => {
    const res = await api.patch(`/surgical-block-stains/outlab-run-details/${detailId}/hosxp-key`, { keyed });
    return res.data;
  },
};

export default SurgicalBlockStainService;
