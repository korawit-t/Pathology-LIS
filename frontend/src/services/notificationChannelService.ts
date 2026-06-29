import api from "./httpClient";

export interface NotificationChannel {
  id: number;
  platform: string;
  name: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface NotificationChannelCreate {
  platform: string;
  name: string;
  credentials: Record<string, unknown>;
  is_active?: boolean;
}

export interface NotificationChannelUpdate {
  platform?: string;
  name?: string;
  credentials?: Record<string, any>;
  is_active?: boolean;
}

const NotificationChannelService = {
  getChannels: async (skip: number = 0, limit: number = 100): Promise<NotificationChannel[]> => {
    const response = await api.get("/notification-channels", {
      params: { skip, limit },
    });
    return response.data;
  },

  getChannel: async (id: number): Promise<NotificationChannel> => {
    const response = await api.get(`/notification-channels/${id}`);
    return response.data;
  },

  createChannel: async (data: NotificationChannelCreate): Promise<NotificationChannel> => {
    const response = await api.post("/notification-channels", data);
    return response.data;
  },

  updateChannel: async (id: number, data: NotificationChannelUpdate): Promise<NotificationChannel> => {
    const response = await api.put(`/notification-channels/${id}`, data);
    return response.data;
  },

  deleteChannel: async (id: number): Promise<void> => {
    await api.delete(`/notification-channels/${id}`);
  },

  testChannel: async (id: number): Promise<{ success: boolean; detail: string }> => {
    const response = await api.post(`/notification-channels/${id}/test`);
    return response.data;
  },

  sendNotification: async (
    id: number,
    data: { hn?: string; name?: string; clinician?: string; id_case?: string; [key: string]: unknown }
  ): Promise<{ success: boolean; detail: string }> => {
    const response = await api.post(`/notification-channels/${id}/send`, { data });
    return response.data;
  },
};

export default NotificationChannelService;
