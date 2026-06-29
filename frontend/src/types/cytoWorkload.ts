export interface CytoWorkloadDayStats {
  user_id: number;
  user_full_name: string;
  work_date: string;
  gyne_slides: number;
  nongyne_conv_slides: number;
  nongyne_liquid_slides: number;
  effective_count: number;
  reading_hours: number | null;
  adjusted_limit: number;
  is_compliant: boolean;
  note?: string;
}

export interface CytoWorkloadLogUpsert {
  user_id: number;
  work_date: string;
  reading_hours: number;
  note?: string;
}

export interface CytoWorkloadLogResponse {
  id: number;
  user_id: number;
  work_date: string;
  reading_hours: number;
  note?: string;
  recorded_by_id?: number;
  created_at: string;
  updated_at: string;
}
