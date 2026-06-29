// frontend/src/services/notificationRuleService.ts
import api from "./httpClient";

export interface NotificationRule {
  id: number;
  event_key: string;
  channel_id: number | null;
  channel_ids: number[] | null;
  message_template: string | null;
  is_active: boolean;
}

// Label mapping for display
export const EVENT_LABELS: Record<string, string> = {
  stain_order_ihc:     "สั่ง IHC (Immunohistochemistry)",
  stain_order_special: "สั่ง Special Stain",
  malignancy_result:   "ผลออก Malignancy",
  critical_case:       "เคสวิกฤต (Critical)",
  case_signed_out:     "Sign-out เคส",
  outlab_consult:      "ส่ง Consult นอกโรงพยาบาล",
};

const NotificationRuleService = {
  getRules: async (): Promise<NotificationRule[]> => {
    const response = await api.get("/notification-rules");
    return response.data;
  },

  upsertRule: async (
    event_key: string,
    data: { channel_ids: number[] | null; is_active: boolean; message_template?: string | null }
  ): Promise<NotificationRule> => {
    const response = await api.put(`/notification-rules/${event_key}`, data);
    return response.data;
  },

  /**
   * Trigger an event notification with real case data.
   * The backend looks up the rule to find channel + template.
   */
  triggerEvent: async (
    event_key: string,
    data: Record<string, string>
  ): Promise<{ success: boolean; detail: string }> => {
    const response = await api.post(`/notification-rules/trigger/${event_key}`, { data });
    return response.data;
  },
};

export default NotificationRuleService;

