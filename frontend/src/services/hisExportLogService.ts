import api from "./httpClient";

export type HisExportLogStatus = "pending" | "processing" | "sent" | "dead_letter" | "cancelled";

export interface HisExportLogRecord {
  id: number;
  resource_type: string;
  resource_id: number;
  accession_no?: string | null;
  status: HisExportLogStatus;
  adapter_type?: string | null;
  payload_snapshot?: Record<string, unknown> | null;
  response_snapshot?: Record<string, unknown> | null;
  error_message?: string | null;
  his_reference_id?: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string | null;
  sent_at?: string | null;
  triggered_by: "auto" | "manual";
  created_by_user_id?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface HisExportLogList {
  total: number;
  items: HisExportLogRecord[];
}

const HisExportLogService = {
  getAll: async (params?: {
    status?: string;
    resource_type?: string;
    accession_no?: string;
    skip?: number;
    limit?: number;
  }): Promise<HisExportLogList> => {
    const res = await api.get<HisExportLogList>("/his-export-logs", { params });
    return res.data;
  },

  getById: async (id: number): Promise<HisExportLogRecord> => {
    const res = await api.get<HisExportLogRecord>(`/his-export-logs/${id}`);
    return res.data;
  },

  retry: async (id: number): Promise<HisExportLogRecord> => {
    const res = await api.post<HisExportLogRecord>(`/his-export-logs/${id}/retry`);
    return res.data;
  },
};

export default HisExportLogService;
