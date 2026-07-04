// src/services/pathologistService.ts
import api from "./httpClient";
import qs from "qs";
// import { SurgicalCase } from "../types/surgicalCase"; // 💡 แนะนำให้สร้าง Type นี้ไว้

const PathologistService = {
  /**
   * ดึงรายการงานที่ได้รับมอบหมายของพยาธิแพทย์คนนั้นๆ
   */
  getMyWorklist: async (
    pathologistId: number,
    skip: number = 0,
    limit: number = 20,
    search?: string,
    status?: string | string[],
    is_pending?: boolean,
    is_express?: boolean,
  ): Promise<any> => {
    const response = await api.get("/surgical-cases", {
      params: {
        pathologist_id: pathologistId,
        skip,
        limit,
        search,
        status: status === "ALL" ? undefined : status,
        has_specimens: true,
        is_pending: is_pending || undefined,
        is_express: is_express || undefined,
      },
      paramsSerializer: (params) => {
        return qs.stringify(params, { arrayFormat: "repeat", skipNulls: true });
      },
    });

    // ✅ ส่งเฉพาะข้อมูลกลับไปเหมือน Service ตัวอื่นๆ
    return response.data;
  },
};

export default PathologistService;
