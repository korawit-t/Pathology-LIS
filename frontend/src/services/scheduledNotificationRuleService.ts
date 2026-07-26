// frontend/src/services/scheduledNotificationRuleService.ts
import api from "./httpClient";

export interface ScheduledNotificationRule {
  id: number;
  rule_type: string;
  label: string | null;
  threshold_value: number;
  threshold_unit: string; // "hours" | "days"
  channel_ids: number[] | null;
  message_template: string | null;
  is_active: boolean;
}

// Label mapping for display (mirrors the backend's PREDEFINED_SCHEDULED_RULE_TYPES)
export const RULE_TYPE_LABELS: Record<string, string> = {
  outlab_pending_visit_today: "ผู้ป่วยมาโรงพยาบาลวันนี้ + ผลย้อมนอกยังไม่คีย์ HosXP",
};

const ScheduledNotificationRuleService = {
  getRules: async (): Promise<ScheduledNotificationRule[]> => {
    const response = await api.get("/scheduled-notification-rules");
    return response.data;
  },

  upsertRule: async (
    rule_type: string,
    data: {
      channel_ids: number[] | null;
      is_active: boolean;
      threshold_value?: number;
      threshold_unit?: string;
      message_template?: string | null;
    }
  ): Promise<ScheduledNotificationRule> => {
    const response = await api.put(`/scheduled-notification-rules/${rule_type}`, data);
    return response.data;
  },
};

export default ScheduledNotificationRuleService;
