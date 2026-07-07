// src/types/hospital.ts
export interface Hospital {
  id: number;
  code?: string;
  name: string;
  address?: string;
  use_custom_report_header?: boolean;
  report_name_en?: string;
  report_short_name_en?: string;
  logo_path?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HospitalPayload {
  name: string;
  code?: string;
  address?: string;
  use_custom_report_header?: boolean;
  report_name_en?: string;
  report_short_name_en?: string;
}