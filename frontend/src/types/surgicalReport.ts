/**
 * Interface สำหรับรูปภาพ Microscopic ที่อยู่ใน Snapshot ของ Report
 */
export interface MicroscopicImageSnapshot {
  id: number;
  image_url: string;
  magnification?: string;
  stain?: string;
  description?: string;
}

/**
 * Interface สำหรับผู้ลงนามในรายงาน (Snapshot/Live Status)
 * เชื่อมโยงกับตาราง report_signers
 */
export interface ReportSignerResponse {
  id: number;
  report_id: number;
  user_id: number;
  role: "primary" | "co-signer" | "resident" | "consultant";
  diagnosis_order?: number;

  // สถานะการลงนาม
  signed_at: string | null; // ถ้าเป็น null แปลว่ายังไม่ได้กดเซ็น (Draft/Pending)
  assigned_at: string;

  // คำถาม/บริบทที่ primary ส่งมาให้ co-signer
  consult_note?: string | null;

  // ความเห็นของ co-signer
  agreement?: "agree" | "disagree" | null;
  agreement_note?: string | null;

  // ข้อมูล User (Join มาจากตาราง User)
  full_name?: string;
  user_full_name?: string;
  signature_path?: string;
}

/**
 * Interface หลักสำหรับ SurgicalReport (Snapshot)
 * อ้างอิงตาม SQLAlchemy Model: SurgicalReport
 */
export interface SurgicalReport {
  id: number;
  case_id: number;
  version_no: number;

  // --- ข้อมูลคนไข้ (Immutable Snapshot) ---
  accession_no: string; // เลขเบอร์เคส (S26-xxxx)
  patient_title?: string; // คำนำหน้า
  patient_name: string; // ชื่อ
  patient_ln: string; // นามสกุล (ln ใน model)
  patient_hn: string; // HN
  patient_cid: string; // เลขบัตรประชาชน
  patient_birth_date?: string; // ISO Date string
  patient_age_display?: string;
  patient_age: number; // อายุ ณ วันที่ออกผล
  patient_gender: string; // เพศ

  has_malignancy: boolean; // 🚩 เพิ่มตัวนี้
  has_critical: boolean; // 🚩 เพิ่มตัวนี้
  is_print: boolean;

  // --- ข้อมูลการรับสิ่งส่งตรวจ (Snapshot) ---
  collect_at?: string; // วันที่เก็บสิ่งส่งตรวจ
  registered_at?: string; // วันที่ลงทะเบียนรับเคส

  // --- แหล่งที่มาและผู้ส่ง (Snapshot) ---
  hospital_name?: string; // โรงพยาบาลต้นทาง
  department_name?: string; // แผนกที่ส่ง
  clinician_name?: string; // แพทย์เจ้าของไข้

  // --- เนื้อหารายงาน (Snapshot) ---
  clinical_history_snapshot?: string; // ประวัติทางคลินิก
  specimen_summary?: string; // รายการชิ้นเนื้อทั้งหมด
  gross_description_summary?: string; // รายละเอียดการตรวจด้วยตาเปล่า
  diagnosis_summary?: string; // ผลการวินิจฉัย
  microscopic_summary?: string; // รายละเอียดกล้องจุลทรรศน์
  comment_summary?: string; // ความเห็นเพิ่มเติม

  // --- ผู้ลงนามและประเภท ---
  report_type: "Final" | "Addendum" | "Correction";
  pathologist_name?: string; // ชื่อพยาธิแพทย์ ณ วันที่ลงนาม
  approved_by_id?: number;
  approver_name_snapshot?: string;

  // --- สถานะและเวลา ---
  status:
    | "draft"
    | "pending"
    | "published"
    | "cancelled"
    | "signed out"
    | "pending_approval";
  published_at?: string; // วันที่เผยแพร่ผล
  created_at: string;
  updated_at: string;

  // --- ความสัมพันธ์เพิ่มเติม (ถ้า Backend ส่งมา) ---
  gross_images?: MicroscopicImageSnapshot[];
  microscopic_images?: MicroscopicImageSnapshot[];
  approval_logs?: ApprovalLogResponse[];
  signers?: ReportSignerResponse[];
}

/**
 * Interface สำหรับการทำ Pagination
 */
export interface SurgicalReportPagination {
  items: SurgicalReport[];
  total: number;
  page: number;
  size: number;
}

/**
 * Interface สำหรับประวัติการอนุมัติ (Approval Log)
 */
export interface ApprovalLogResponse {
  id: number;
  report_id: number;
  approver_id: number;
  approver_name: string;
  action: "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
  comment?: string;
  created_at: string;
}

/**
 * Interface สำหรับส่งข้อมูลการอนุมัติไปยัง Backend
 */
export interface ReportApproveRequest {
  action: "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
  comment?: string;
  agreement?: "agree" | "disagree";
  agreement_note?: string;
}

/**
 * Interface สำหรับสถิติของ Surgical Cases
 */
export interface SurgicalStatResponse {
  total_cases: number;
  average_tt_days: number;
  average_tt_hours: number;
  daily_stats: {
    date: string;
    total_cases: number;
    average_tt_hours: number;
  }[];
  tt_distribution?: {
    tt_days: string;
    case_count: number;
  }[];
  complexity_breakdown?: {
    small: number;
    medium: number;
    large: number;
  };
}

export interface LabTechStatResponse {
  grossed_cases: number;
  embedded_blocks: number;
  sectioned_blocks: number;
  stained_blocks: number;
  total_slides: number;
  dispatched_cases: number;
  outlab_sent_blocks: number;
  complexity_breakdown?: {
    small: number;
    medium: number;
    large: number;
  };
}

