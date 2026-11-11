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

export interface StaffRegistrationRow {
  user_id: number;
  full_name: string;
  username: string;
  surgical: number;
  gyne: number;
  nongyne: number;
  total: number;
}

export interface StaffGrossItem {
  specimen_name: string;
  count: number;
}

export interface StaffGrossRow {
  user_id: number;
  full_name: string;
  specimen_count: number;
  items: StaffGrossItem[];
}

export interface StaffGrossStats {
  examiners: StaffGrossRow[];
  assistants: StaffGrossRow[];
}

export interface TissueProcessEmbedRow {
  user_id: number;
  full_name: string;
  block_count: number;
}

export interface TissueProcessSectionRow {
  user_id: number;
  full_name: string;
  block_count: number;
  slide_count: number;
}

export interface TissueProcessStainRow {
  user_id: number;
  full_name: string;
  slide_count: number;
}

export interface BlockStorageWorkloadRow {
  user_id: number;
  full_name: string;
  block_count: number;
}

export interface SlideStorageWorkloadRow {
  user_id: number;
  full_name: string;
  HE: number;
  Special: number;
  IHC: number;
  Gyne: number;
  NonGyne: number;
  total: number;
}

export interface StorageStats {
  block_storage: BlockStorageWorkloadRow[];
  slide_storage: SlideStorageWorkloadRow[];
}

export interface TissueProcessingRunRow {
  user_id: number;
  full_name: string;
  run_count: number;
  block_count: number;
}

export interface TissueProcessStats {
  embedding: TissueProcessEmbedRow[];
  sectioning: TissueProcessSectionRow[];
  staining: TissueProcessStainRow[];
  tissue_processing: TissueProcessingRunRow[];
}

export interface OutlabStainWorkloadRow {
  user_id: number;
  full_name: string;
  run_count: number;
  slide_count: number;
}

export interface OutlabConsultWorkloadRow {
  user_id: number;
  full_name: string;
  run_count: number;
  case_count: number;
}

export interface OutlabStats {
  outlab_stain: OutlabStainWorkloadRow[];
  outlab_consult: OutlabConsultWorkloadRow[];
}


// --- IHC TAT dashboard (GET /surgical-reports/ihc-tat[/outstanding]) ---
// An IHC request = a case's IHC slides signed off together (same reported_at).
// "Out" = that report published (released_at). Days are working days, as on
// the surgical TAT dashboard.

export type IhcTatBucket = "lt3" | "t3_5" | "t5_10" | "gt10";

export interface IhcTatRequest {
  case_id: number;
  accession_no: string | null;
  patient_title: string | null;
  patient_name: string | null;
  patient_ln: string | null;
  markers: string[];
  slides: number;
  source: "outlab" | "in-house";
  lab: string | null;
  ordered_at: string;
  sent_at: string | null;
  ready_at: string | null;
  // The pathologist's sign-off
  signed_at: string;
  // Out: the report was published (= signed_at with the approve system off)
  released_at: string;
  total_days: number;
  outlab_days: number | null;
  // slide ready → sign-off
  reading_days: number | null;
  // sign-off → published (approval wait)
  approval_days: number | null;
  bucket: IhcTatBucket;
  // total_days within the IHC target (Admin → Workflow → ihc_tat_days)
  on_time: boolean;
}

export interface IhcTatStats {
  summary: {
    requests: number;
    slides: number;
    outlab_requests: number;
    inhouse_requests: number;
    median_total_days: number | null;
    median_outlab_days: number | null;
    median_reading_days: number | null;
    median_approval_days: number | null;
    target_days: number;
    on_time_count: number;
    on_time_pct: number | null;
  };
  distribution: Record<IhcTatBucket, number>;
  monthly: { month: string; requests: number; median_total_days: number | null; on_time_pct: number | null }[];
  by_lab: { lab: string; requests: number; median_outlab_days: number | null; max_outlab_days: number }[];
  requests: IhcTatRequest[];
}

// "signed" = signed off, waiting for the approval that publishes it
export type IhcOutstandingStage = "pending" | "sent" | "stained" | "completed" | "signed";

export interface IhcOutstandingCase {
  case_id: number;
  accession_no: string | null;
  patient_title: string | null;
  patient_name: string | null;
  patient_ln: string | null;
  markers: { name: string | null; status: string; is_external: boolean }[];
  stage: IhcOutstandingStage;
  ordered_at: string;
  sent_at: string | null;
  lab: string | null;
  // Set once signed off (stage "signed": waiting for approval)
  signed_at: string | null;
  age_days: number;
  // Waited longer than the IHC target already
  overdue: boolean;
}
