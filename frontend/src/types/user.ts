// src/types/user.ts
import { BaseEntity } from "./common";
import type { UserRole } from "../constants/roles.constants";
import { Hospital } from "./hospital";
import { Position } from "./position";

export interface UserPreferences {
  layout_mode?: "side" | "top";
  theme?: "light" | "dark";
  show_navigator?: boolean;
  ihc_text_prefix?: string;
  ihc_line_format?: string;
  ihc_marker_order?: number[];
  default_diagnosis_mode?: "individual" | "integrated" | "clean";
  is_split_mode?: boolean;
  patient_info_expanded?: boolean;
  auto_save?: boolean;
  auto_save_interval?: number;
  editor_font_size?: "small" | "medium" | "large";
  show_specimen_category?: boolean;
  [key: string]: unknown;
}

export interface User extends BaseEntity {
  username: string;
  email?: string; // เพิ่มให้ตรงกับ Model
  full_name?: string;
  report_name?: string;

  // Roles & Status
  roles: UserRole[];
  is_temporary_password: boolean;
  is_password_expired?: boolean;
  status: boolean;

  // Foreign Keys (ID)
  hospital_ids: number[];
  hospital_names?: string[];  // eager-loaded from login response
  position_id?: number;
  position_name?: string;  // eager-loaded from login response

  // 🚩 Nested Relationships (จาก relationship ใน SQLAlchemy)
  hospitals?: Hospital[];
  position?: Position;

  // Preferences & Timestamps
  preferences?: UserPreferences;
  last_login?: string;
  last_update_password?: string;
}
