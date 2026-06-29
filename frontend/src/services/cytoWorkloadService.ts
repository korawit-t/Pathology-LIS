import api from "./httpClient";
import {
  CytoWorkloadDayStats,
  CytoWorkloadLogUpsert,
  CytoWorkloadLogResponse,
} from "../types/cytoWorkload";

const CytoWorkloadService = {
  getStats: async (params: {
    start_date: string;
    end_date: string;
    user_ids?: number[];
  }): Promise<CytoWorkloadDayStats[]> => {
    const query: Record<string, unknown> = {
      start_date: params.start_date,
      end_date: params.end_date,
    };
    if (params.user_ids?.length) query.user_ids = params.user_ids;
    const res = await api.get<CytoWorkloadDayStats[]>("/cyto-workload/stats", { params: query });
    return res.data;
  },

  upsertHours: async (payload: CytoWorkloadLogUpsert): Promise<CytoWorkloadLogResponse> => {
    const res = await api.post<CytoWorkloadLogResponse>("/cyto-workload/hours", payload);
    return res.data;
  },

  getHours: async (userId: number, workDate: string): Promise<CytoWorkloadLogResponse | null> => {
    const res = await api.get<CytoWorkloadLogResponse | null>("/cyto-workload/hours", {
      params: { user_id: userId, work_date: workDate },
    });
    return res.data;
  },
};

export default CytoWorkloadService;
