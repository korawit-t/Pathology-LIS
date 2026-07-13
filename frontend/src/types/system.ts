/**
 * Interface สำหรับการตั้งค่าระบบ (System Settings)
 * สอดคล้องกับ Pydantic Schema และ SQLAlchemy Model ใน Backend
 */
export interface SystemSetting {
  id: number;
  hospital_slug?: string;

  // --- Branding ---
  lab_name_th: string;
  lab_name_en: string;
  lab_short_name_en?: string;
  lab_address?: string;

  // Path หรือ URL ของไฟล์รูปภาพ
  report_logo_url?: string;
  login_logo_url?: string;
  login_announcement?: string | null;

  // --- Turnaround Time (SLA) Settings (หน่วยเป็น "วัน") ---
  // 🚩 Routine Cases
  surgical_tat_days: number;
  non_gyne_tat_days: number;
  gyne_tat_days: number;

  // 🚩 Express/Urgent Cases (เพิ่มใหม่)
  surgical_express_tat_days: number;
  non_gyne_express_tat_days: number;
  gyne_express_tat_days: number;

  // --- Session / Security ---
  idle_timeout_minutes?: number;
  idle_warning_minutes?: number;

  // --- Workflow & Report Settings ---
  // True = แสดงประวัติเดิมต่อท้าย / False = แสดงเฉพาะผลปัจจุบัน
  is_cumulative_report: boolean;
  // True = เรียงรอบล่าสุดขึ้นก่อน (desc) / False = เรียงรอบเก่าขึ้นก่อน (asc) — ใช้กับ Surgical Pathology
  cumulative_report_newest_first: boolean;

  // ควบคุมการแสดงชื่อชิ้นเนื้อ (เช่น A: Appendix vs A:)
  show_specimen_name: boolean;

  report_footer_text?: string;
  surgical_report_footer?: string;
  gyne_report_footer?: string;
  nongyne_report_footer?: string;

  // เปิด/ปิด ระบบการ Approve ผลโดยพยาธิแพทย์
  enable_approve_system: boolean;
  enable_gyne_qc_system: boolean;
  enable_non_gyne_approve_system: boolean;
  nongyne_slide_dispatch_enabled: boolean;
  require_all_pathologists_sign: boolean;
  require_all_gyne_sign: boolean;
  require_all_non_gyne_sign: boolean;

  // --- Gyne Cytology QC Review ---
  nilm_review_every_n: number;

  surgical_accession_prefix?: string;
  gyne_accession_prefix?: string;
  nongyne_accession_prefix?: string;

  // 🚩 Default Test Selection (ID)
  default_gyne_test_id?: number | null;
  default_non_gyne_test_id?: number | null;

  // 🚩 เพิ่มฟิลด์เหล่านี้เพื่อให้ตรงกับ Pydantic model_validator (Backend)
  default_gyne_test_name?: string | null;
  default_non_gyne_test_name?: string | null;

  // --- Sticker / Label Print Settings ---
  sticker_width_cm?: number;
  sticker_height_cm?: number;
  sticker_orientation?: "portrait" | "landscape";
  sticker_font_accession?: number;
  sticker_font_block?: number;
  sticker_font_stain?: number;
  sticker_font_hospital?: number;
  sticker_font_date?: number;
  sticker_margin_top_cm?: number;

  // --- Report Template Selection ---
  surgical_report_template?: string | null;
  gyne_report_template?: string | null;
  nongyne_report_template?: string | null;

  // --- Report Color Scheme ---
  report_primary_color?: string | null;

  // --- AI / Tumor Registry ---
  tumor_registry_enabled?: boolean;
  tumor_registry_llm_profile_id?: number | null;
  tumor_registry_system_prompt?: string | null;
  show_icd_o_in_report?: boolean;
  report_gen_llm_profile_id?: number | null;
  report_gen_system_prompt?: string | null;

  // --- AI / Grossing Assistant ---
  grossing_assist_enabled?: boolean;
  grossing_assist_llm_profile_id?: number | null;
  grossing_assist_system_prompt?: string | null;
}

/**
 * Type สำหรับการอัปเดตข้อมูล (ทุกฟิลด์เป็น Optional)
 */
export type SystemSettingUpdate = Partial<Omit<SystemSetting, "id">>;

/**
 * Interface สำหรับการอัปโหลดโลโก้
 */
export interface LogoUploadResponse {
  message: string;
  url: string;
  setting: SystemSetting;
}

// --- WSI Settings ---

export interface WsiScannerProfile {
  id: number;
  name: string;
  filename_pattern: string;
  file_extensions: string[];
  separator?: string | null;
  is_active: boolean;
}

export type WsiScannerProfileCreate = Omit<WsiScannerProfile, "id">;
export type WsiScannerProfileUpdate = Partial<WsiScannerProfileCreate>;

export interface WsiSetting {
  id: number;
  hospital_slug?: string;
  wsi_root_path?: string | null;
  default_scanner_profile_id?: number | null;
  default_scanner_profile?: WsiScannerProfile | null;
}

export type WsiSettingUpdate = Partial<Pick<WsiSetting, "wsi_root_path" | "default_scanner_profile_id">>;

export interface WsiFileInfo {
  filename: string;
  path: string;
  size_mb: number;
  modified_at: string;
  extension: string;
}

export interface WsiSlideLink {
  id: number;
  wsi_file_id: number;
  surgical_block_id: number;
  stain_type: string;
  is_primary: boolean;
  link_method?: string;
  link_confidence?: number;
  status: "pending" | "confirmed" | "rejected";
  linked_at: string;
  confirmed_at?: string;
  notes?: string;
  block_code?: string;
  accession_no?: string;
}

export interface WsiSlideLinkCreate {
  wsi_file_id: number;
  surgical_block_id: number;
  stain_type?: string;
  is_primary?: boolean;
  notes?: string;
}

export interface WsiSlideLinkUpdate {
  status?: "confirmed" | "rejected";
  is_primary?: boolean;
  notes?: string;
}

export interface WsiFile {
  id: number;
  file_path: string;
  filename: string;
  file_size_bytes?: number;
  format?: string;
  width_px?: number;
  height_px?: number;
  mpp_x?: number;
  mpp_y?: number;
  level_count?: number;
  parsed_accession?: string;
  parsed_block?: string;
  parse_confidence?: string;
  discovered_at: string;
  last_seen_at?: string;
  slide_links: WsiSlideLink[];
}

export interface WsiScanResult {
  discovered: number;
  updated: number;
  auto_linked: number;
  pending_review: number;
}
