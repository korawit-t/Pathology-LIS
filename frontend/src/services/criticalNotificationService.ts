import api from "./httpClient";

export interface CriticalNotificationCreate {
  case_id: number;
  case_type: "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";
  notification_type: string;
  notified_at: string;
  accession_no?: string;
  recipient_name?: string;
  recipient_role?: string;
  note?: string;
  channel_ids?: number[];
}

export interface CriticalNotificationRecord {
  id: number;
  case_id: number;
  case_type: string;
  accession_no?: string;
  notification_type: string;
  notified_at: string;
  recipient_name?: string;
  recipient_role?: string;
  note?: string;
  notified_channel_names?: string[] | null;
  notified_by?: { id: number; full_name?: string; username: string } | null;
  created_at: string;
}

export interface CriticalNotificationList {
  total: number;
  items: CriticalNotificationRecord[];
}

const CriticalNotificationService = {
  getByCaseId: async (
    caseId: number,
    caseType: "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO",
  ): Promise<CriticalNotificationList> => {
    const res = await api.get<CriticalNotificationList>(
      `/critical-notification-logs/case/${caseId}/${caseType}`,
    );
    return res.data;
  },

  create: async (payload: CriticalNotificationCreate): Promise<CriticalNotificationRecord> => {
    const res = await api.post<CriticalNotificationRecord>(
      "/critical-notification-logs",
      payload,
    );
    return res.data;
  },

  updateRecipient: async (
    id: number,
    payload: { recipient_name?: string; recipient_role?: string },
  ): Promise<CriticalNotificationRecord> => {
    const res = await api.patch<CriticalNotificationRecord>(
      `/critical-notification-logs/${id}`,
      payload,
    );
    return res.data;
  },

  getAll: async (params?: {
    case_type?: string;
    notification_type?: string;
    skip?: number;
    limit?: number;
  }): Promise<CriticalNotificationList> => {
    const res = await api.get<CriticalNotificationList>("/critical-notification-logs", { params });
    return res.data;
  },
};

export default CriticalNotificationService;
