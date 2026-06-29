import api from "./httpClient";
import {
  StainRunCreate,
  StainingRunResponse,
  StainingRunDetailResponse,
} from "../types/stains";

const SurgicalStainRunService = {
  /**
   * ดึงรายการ Run ทั้งหมด (Active Runs)
   * สามารถ filter ตามประเภทได้ เช่น ?stain_type=IHC
   */
  getAllRuns: async (stainType?: string): Promise<StainingRunResponse[]> => {
    const res = await api.get<StainingRunResponse[]>("/stain-runs", {
      params: { stain_type: stainType },
    });
    return res.data;
  },

  /**
   * ดึงรายละเอียดของ Run พร้อมรายการสไลด์ภายใน
   */
  getRunDetail: async (runId: number): Promise<StainingRunDetailResponse> => {
    const res = await api.get<StainingRunDetailResponse>(
      `/stain-runs/${runId}`,
    );
    return res.data;
  },

  /**
   * สร้าง Run ใหม่ และผูกสไลด์เข้าไป
   */
  createRun: async (payload: StainRunCreate): Promise<StainingRunResponse> => {
    const res = await api.post<StainingRunResponse>("/stain-runs", payload);
    return res.data;
  },

  /**
   * อัปเดตสถานะของ Run
   */
  updateRunStatus: async (
    runId: number,
    status: "in_progress" | "completed" | "cancelled",
  ): Promise<StainingRunResponse> => {
    const res = await api.patch<StainingRunResponse>(
      `/stain-runs/${runId}/status`,
      null,
      { params: { status } },
    );
    return res.data;
  },

  /**
   * ลบหรือยกเลิก Run
   */
  deleteRun: async (runId: number): Promise<void> => {
    await api.delete(`/stain-runs/${runId}`);
  },
};

export default SurgicalStainRunService;
