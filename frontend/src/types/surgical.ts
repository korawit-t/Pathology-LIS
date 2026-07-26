import { SurgicalReport } from "./surgicalReport";
import { SurgicalDiagnosis } from "./surgicalDiagnosis";
import type { GrossImage } from "./image";
import { SpecimenStatusType } from "../constants/lab.constants";
// --- References ---
export interface PatientRef {
  id: number;
  name: string;
  ln?: string;
  hn?: string;
  cid?: string;
  gender?: string;
  title?: {
    title: string;
  };
  birth_date?: string;
}

export interface HospitalRef {
  id: number;
  name: string;
}

export interface UserRef {
  id: number;
  full_name?: string;
  report_name?: string;
}

export interface UserMinimal {
  id: number;
  full_name?: string;
  report_name?: string;
  role?: string;
}

export interface DepartmentRef {
  id: number;
  name: string;
}

export interface MedicalSchemeRef {
  id: number;
  name: string;
}

export interface RequestFile {
  id: number;
  file_name: string;
  file_path?: string;
  file_type?: string;
}

// --- Main Types ---

export interface SurgicalCase {
  id: number;
  accession_no: string;
  lab_number?: string;

  patient_id: number;
  hospital_id?: number | null;
  department_id?: number | null;
  medical_scheme_id?: number | null;

  hn?: string | null;
  an?: string | null;
  vn?: string | null;

  clinical_diagnosis?: string | null;
  clinician_name?: string | null;
  is_express: boolean;
  is_frozen_section: boolean;

  /* ---- Workflow & Tracking (Moved from Specimen to Case) ---- */
  status: string;
  diagnosis_mode?: "individual" | "integrated" | "clean";
  pathologist_id?: number | null;
  registrar_id: number;
  collect_at?: string | Date | null;
  registered_at: string;

  gross_at?: string | null;
  gross_examiner_id?: number | null;
  gross_assistant_id?: number | null;
  report_at?: string | null;
  published_at?: string | null;

  // Tracking Flags
  is_extended_fix: boolean;
  is_grossed: boolean;
  is_processed: boolean;
  is_slide_prepped: boolean;
  is_reported: boolean;
  is_out_lab_consult: boolean;
  consult_status: string;
  consult_reason?: string | null;
  consult_pdf_path?: string;
  consult_report_out_at?: string | null;
  consult_pdf_received_at?: string | null;
  consult_pdf_approved_by_id?: number | null;
  consult_pdf_approved_at?: string | null;
  consult_pdf_approver_name?: string | null;
  has_malignancy?: boolean | null;
  has_critical: boolean;
  is_pending: boolean;
  pending_reason?: string | null;

  specimen_storage_status?: string | null;
  specimen_storage_container?: string | null;
  specimen_storage_at?: string | null;
  specimen_storage_by_id?: number | null;
  
  discard_status?: boolean;
  discard_at?: string | null;
  discard_by_id?: number | null;

  // Quality Assessment
  stain_quality?: string | null;
  tissue_quality?: string | null;
  slide_quality?: string | null;

  is_cancelled: boolean;
  cancelled_at?: string;
  cancelled_by_id?: number;
  cancel_reason?: string;

  /* ---- Relations ---- */
  patient?: PatientRef;
  hospital?: HospitalRef;
  department?: DepartmentRef;
  medical_scheme?: MedicalSchemeRef;
  pathologist?: UserRef;
  registerer?: UserRef;
  gross_examiner?: UserRef;
  gross_assistant?: UserRef;
  specimen_storer?: UserRef;
  specimen_disposer?: UserRef;
  specimens?: SurgicalSpecimen[];
  diagnoses?: SurgicalDiagnosis[];
  reports?: SurgicalReport[];
  request_files?: RequestFile[];
}

export interface SurgicalSpecimen {
  id: number;
  case_id: number;
  specimen_label: string; // เช่น A, B, C
  specimen_name: string; // เช่น Appendix
  status?: string;
  gross_description?: string | null; // คำบรรยายรายชิ้นยังอยู่ที่นี่
  is_entirely_submitted?: boolean;

  // Relations
  case?: SurgicalCase;
  blocks?: SurgicalBlock[];
}

/* ---------------- Payloads ---------------- */

export interface SurgicalCaseCreatePayload {
  patient_id: number;
  // accession_no: string; // ❌ Backend เป็นคนเจน ไม่ต้องส่งไป
  lab_number?: string;
  hn?: string;
  an?: string;
  vn?: string;
  hospital_id?: number;
  department_id?: number;
  medical_scheme_id?: number;
  clinical_diagnosis?: string;
  clinician_name?: string;
  is_express?: boolean;
  is_frozen_section?: boolean;
  // ✅ ส่งชิ้นเนื้อไปพร้อมกันตอนสร้าง
  specimens: {
    specimen_label: string;
    specimen_name: string;
  }[];
}

export interface SurgicalCaseUpdatePayload extends Partial<SurgicalCaseCreatePayload> {
  status?: string;
  pathologist_id?: number;
  gross_examiner_id?: number;
  gross_assistant_id?: number;
  gross_at?: string;
  is_extended_fix?: boolean;
  is_grossed?: boolean;
  is_reported?: boolean;
  is_out_lab_consult?: boolean;
  consult_status?: string;
  consult_reason?: string | null;
  consult_pdf_path?: string;
  consult_report_out_at?: string | null;
  consult_pdf_received_at?: string | null;
  consult_pdf_approved_by_id?: number | null;
  consult_pdf_approved_at?: string | null;
  consult_pdf_approver_name?: string | null;
  has_malignancy?: boolean;
  has_critical?: boolean;
  is_pending?: boolean;
  pending_reason?: string;
}

export interface SurgicalSpecimen {
  id: number;
  case_id: number;
  specimen_label: string;
  specimen_name: string;
  status?: string;
  gross_description?: string | null;

  // --- Audit Fields ---
  created_at?: string;
  updated_at?: string;
  updated_by_id?: number;
  updated_by_user?: UserMinimal;

  // --- Additional Sections ---
  needs_additional_sections?: boolean;
  additional_sections_note?: string | null;
  additional_sections_ordered_by?: UserMinimal;
  additional_sections_ordered_at?: string | null;

  // --- Relations ---
  case?: SurgicalCase;
  blocks?: SurgicalBlock[];
  gross_images?: GrossImage[];
}

export interface SurgicalSpecimenUpdatePayload {
  specimen_label?: string;
  specimen_name?: string;
  gross_description?: string | null;
  is_entirely_submitted?: boolean;
}

/* ---------------- Blocks & Reports ---------------- */

export interface SurgicalBlock {
  id: number;
  specimen_id: number;
  specimen_label: string;
  block_no: string;
  block_code?: string;
  accession_no?: string;
  status: string;
  is_fixing: boolean;
  fix_start_at?: string;
  fix_start_by_id?: number | null;
  fix_end_at?: string;
  fix_end_by_id?: number | null;
  is_decal: boolean;
  decal_start_at?: string;
  decal_end_at?: string;
  decal_start_by_id?: number | null;
  decal_end_by_id?: number | null;
  tissue_count?: number | null;
  is_tissue_uncountable?: boolean;
  tissue_description?: string | null;
  specimen?: {
    id: number;
    case_id: number;
    specimen_name: string;
    specimen_label: string;
    accession_no?: string;
  };
  stains?: Array<{
    id: number;
    stain_type: string;
    status: string;
    stain_name?: string;
    is_recut?: boolean;
    recut_note?: string | null;
    test?: { id?: number; name?: string; system_code?: string; category?: string; is_external?: boolean };
  }>;
}

/* ---------------- Processing Tree Types ---------------- */

export interface PendingDataNode {
  key: string | number; // สำหรับ Ant Design Table (เช่น "case-1" หรือ block_id)
  id: number; // ID จริงของ Block (ใช้ตอนส่งไป Backend)
  code: string; // แสดงผลในตาราง (A1, B1)
  full_code?: string; // แสดงผลแบบเต็ม (S26-00001 A1) ✅ เพิ่มฟิลด์นี้ตามที่ Backend ส่งมา
  isCase: boolean; // แยกแยะว่าเป็นหัวข้อ Case หรือลูกที่เป็น Block
  is_decal: boolean;
  children?: PendingDataNode[]; // สำหรับโครงสร้าง Tree
}

// สำหรับข้อมูลที่ถูกเลือกมาแล้วในหน้าหลัก
export interface ScannedBlock {
  id: number;
  code: string;
  is_decal: boolean;
  scannedAt: string;
}

/* ---------------- Public Search & Portal Types ---------------- */

/**
 * โครงสร้างข้อมูลสำหรับหน้า Search Portal (Clinician/Public)
 * เป็นการรวมร่างระหว่างข้อมูล Case และสถานะ Report ล่าสุด
 */
export interface PublicSearchItem {
  case_id: number;
  report_id: number | null;
  accession_no: string;
  patient_title?: string;
  patient_name: string;
  patient_ln?: string;
  patient_hn: string;
  specimen_name: string;
  registered_at: string;
  published_at: string | null;
  is_express: boolean;
  status: SpecimenStatusType | "published" | "processing";
  pathologist_name: string;
  clinician_name: string;
  is_read?: boolean;
  read_at?: string | null;
  is_pending?: boolean;
  pending_reason?: string | null;
}

/**
 * โครงสร้าง Response แบบมี Pagination สำหรับหน้า Search
 */
export interface PublicSearchPaginationResponse {
  items: PublicSearchItem[];
  total: number;
  page: number;
  size: number;
}

export interface UnifiedPublicSearchItem extends PublicSearchItem {
  case_type: "SURGICAL" | "GYNE" | "NONGYNE";
}
