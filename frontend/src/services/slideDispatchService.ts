import api from "./httpClient";

/**
 * Interface สำหรับรายการเคสย่อยในใบส่ง
 */
export interface DispatchItem {
  case_id: number;
  case_type: string;
}

/**
 * Interface สำหรับการส่งแบบกลุ่ม (สร้าง SlideDispatchRun)
 */
export interface SlideDispatchBulkPayload {
  items: DispatchItem[];
  pathologist_id: number;
  remark?: string;
}

const SlideDispatchService = {
  /**
   * 🚩 สแกนตรวจสอบ Accession No.
   */
  verifyAccession: async (accessionNo: string) => {
    const res = await api.get(`/slide-dispatches/verify/${accessionNo}`);
    return res.data;
  },

  /**
   * 🚩 บันทึกการส่งสไลด์แบบกลุ่ม (สร้าง 1 Run และหลาย Items)
   * จะได้ Response กลับมาเป็น SlideDispatchRunResponse (มี dispatch_no)
   */
  bulkDispatch: async (payload: SlideDispatchBulkPayload) => {
    const res = await api.post("/slide-dispatches/bulk", payload);
    return res.data;
  },

  /**
   * 🚩 ดึงประวัติการส่งสไลด์ทั้งหมด (แบบ Run-based)
   * รองรับ Pagination เพื่อประสิทธิภาพข้อมูลหลักแสน
   */
  getAllDispatches: async (skip: number = 0, limit: number = 15, pathologist_id?: number) => {
    const res = await api.get("/slide-dispatches", {
      params: { skip, limit, ...(pathologist_id != null ? { pathologist_id } : {}) },
    });
    return res.data;
  },

  /**
   * 🚩 ยกเลิกการส่งสไลด์ (ลบทั้งใบส่ง SlideDispatchRun)
   * @param runId ID ของหัวใบส่ง (Run)
   */
  deleteDispatch: async (runId: number): Promise<void> => {
    await api.delete(`/slide-dispatches/${runId}`);
  },

  /**
   * ดึงรายการเคสที่ส่งมาให้แพทย์ที่ Login อยู่ (Worklist)
   */
  getMyWorklist: async (status?: string) => {
    const res = await api.get("/slide-dispatches/my-worklist", {
      params: { status },
    });
    return res.data;
  },

  /**
   * ดึงประวัติการส่งสไลด์ของเคสที่ระบุ (กรณีดูจากหน้า Case Detail)
   */
  getDispatchesByCase: async (caseType: string, caseId: number) => {
    const res = await api.get(`/slide-dispatches/case/${caseType}/${caseId}`);
    return res.data;
  },
};

export default SlideDispatchService;
