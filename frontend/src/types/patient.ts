import { BaseEntity } from "./common";
import { Title } from "./title";

export interface Patient extends BaseEntity {
  title_id?: number;
  name: string;
  ln?: string;
  gender?: "Male" | "Female" | string;
  cid?: string;
  hn?: string;
  birth_date?: string; // ISO Date (YYYY-MM-DD)

  // 🚩 ฟิลด์พิเศษจาก @property ใน Backend
  age_display?: string;

  // Relationships
  title?: Title;

  // Timestamps (สืบทอดมาจาก BaseEntity ถ้าคุณตั้งค่าไว้)
  created_at?: string;
  updated_at?: string;
}

/**
 * สำหรับใช้ในหน้าค้นหา หรือ Table ที่ต้องการข้อมูลสรุป
 */
export interface PatientListItem extends Patient {
  surgical_cases_count?: number;
}
