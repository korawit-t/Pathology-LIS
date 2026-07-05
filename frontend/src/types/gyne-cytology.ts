import { Patient } from "./patient";
import { Hospital } from "./hospital";
import { RequestFile } from "./surgical";

export interface GyneCytologyCase {
  id: number;
  accession_no: string;
  hn: string;
  patient_id: number;
  hospital_id?: number;
  department_id?: number;
  medical_scheme_id?: number;

  // Relationship
  patient?: Patient;
  hospital?: Hospital;
  department?: { id: number; name: string };
  medical_scheme?: { id: number; name: string };
  pathologist?: { id: number; full_name: string };
  cytotechnologist?: { id: number; full_name: string };

  // เพิ่ม 2 บรรทัดนี้ครับ
  collect_at: string | null;

  // ข้อมูลทางนรีเวช
  last_menstrual_period: string | null;
  is_postmenopausal: boolean;
  is_pregnant: boolean;
  hormone_therapy: string | null;
  contraception: string | null;
  previous_abnormal_pap: boolean;
  clinical_history: string | null;

  clinician_name?: string;

  // ประเภทสิ่งส่งตรวจ
  specimen_type: "Liquid Based" | "Conventional" | string;
  collection_site: string;

  // สถานะและเจ้าหน้าที่
  status: "registered" | "screened" | "reported" | "revised" | "cancelled" | "pending_review" | "pending_approval" | "published";
  cytotechnologist_id: number | null;
  pathologist_id: number | null;
  registrar_id: number;

  registered_at: string;
  screened_at: string | null;
  reported_at: string | null;

  // สรุปผลเบื้องต้น (เพื่อใช้ในหน้า Dashboard)
  bethesda_category?: string;
  is_express: boolean;
  is_satisfied_specimen: boolean;
  is_out_lab_consult: boolean;
  is_out_lab: boolean;
  out_lab_result_pdf_path: string | null;
  consult_status: "pending" | "processing" | "received" | string;
  consult_pdf_path?: string | null;
  consult_reason?: string | null;
  consult_pdf_received_at?: string | null;
  consult_report_out_at?: string | null;

  created_at: string;
  updated_at: string;
  
  request_files?: RequestFile[];

  // 10% QC Review
  needs_review: boolean;
  review_reason: "random_10pct" | "abnormal" | "manual" | null;
  reviewed_by_id: number | null;
  reviewed_at: string | null;
  reviewed_by?: { id: number; full_name: string | null } | null;
  review_result: "agree" | "disagree" | null;
  review_note: string | null;
  discrepancy_level: "minor" | "major" | null;

  // Relationship with Diagnosis
  diagnosis?: {
    id: number;
    signers: Array<{
      user_id: number;
      role: string;
      signed_at: string | null;
      user?: {
        id: number;
        full_name: string;
      }
    }>;
  };
  has_correlation?: boolean;
}

export interface GyneCytologyCaseCreate {
  accession_no: string;
  hn: string;
  patient_id: number;
  hospital_id?: number;
  last_menstrual_period?: string;
  is_postmenopausal?: boolean;
  is_pregnant?: boolean;
  specimen_type?: string;
  collection_site?: string;
  clinical_history?: string;
  is_out_lab_consult?: boolean;
  is_out_lab?: boolean;
}

export interface GyneCytologyCaseUpdate extends Partial<GyneCytologyCaseCreate> {
  status?: string;
  cytotechnologist_id?: number;
  pathologist_id?: number;
  is_out_lab_consult?: boolean;
  is_out_lab?: boolean;
  out_lab_result_pdf_path?: string | null;
  consult_status?: string;
  consult_pdf_path?: string | null;
  consult_reason?: string | null;
  consult_pdf_received_at?: string | null;
  consult_report_out_at?: string | null;
  slide_quality?: string;
  stain_quality?: string;
}
