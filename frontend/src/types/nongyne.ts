import { Patient } from "./patient";
import { Hospital } from "./hospital";
import { RequestFile } from "./surgical";

export interface TitleRef {
  id: number;
  title: string;
}

export interface PatientRef {
  id: number;
  hn?: string;
  name: string;
  ln?: string;
  gender?: string;
  birth_date?: string;
  cid?: string;
  title?: TitleRef;
}

export interface UserRef {
  id: number;
  full_name?: string;
  report_name?: string;
}

export interface NongyneCytologyCase {
  id: number;
  accession_no: string;
  lab_number?: string;
  hn?: string;
  an?: string;
  vn?: string;
  patient_id: number;
  hospital_id?: number;
  department_id?: number;
  medical_scheme_id?: number;

  // Relationship
  patient?: PatientRef;
  hospital?: { id: number; name: string };
  department?: { id: number; name: string };
  medical_scheme?: { id: number; name: string };
  pathologist?: UserRef;
  cytotechnologist?: UserRef;

  collect_at: string | null;
  clinician_name?: string;
  clinical_diagnosis?: string;
  clinical_history?: string;

  // ประเภทสิ่งส่งตรวจ
  specimen_type: string;
  collection_site?: string;
  received_volume_ml?: string;

  // สถานะและเจ้าหน้าที่
  status: "registered" | "screened" | "reported" | "revised" | "cancelled" | string;
  is_screened?: boolean;
  is_reported?: boolean;
  is_pending?: boolean;
  pending_reason?: string | null;
  cytotechnologist_id: number | null;
  pathologist_id: number | null;
  registrar_id: number;

  registered_at: string;
  screened_at: string | null;
  reported_at: string | null;

  // สรุปผลเบื้องต้น
  has_malignancy?: boolean;
  has_critical?: boolean;
  is_express: boolean;
  is_rose: boolean;
  is_satisfied_specimen: boolean;
  is_out_lab_consult: boolean;
  is_out_lab: boolean;
  consult_status?: string | null;
  consult_pdf_path?: string | null;
  consult_reason?: string | null;
  consult_pdf_received_at?: string | null;
  consult_report_out_at?: string | null;

  // Cell Block
  is_cell_block: boolean;
  cell_block_status?: "pending" | "processing" | "ready" | "failed" | null;
  cell_block_prepared_at?: string | null;
  cell_block_prepared_by_id?: number | null;
  cell_block_prepared_by?: UserRef | null;

  slide_quality?: string;
  stain_quality?: string;
  slide_count?: number;

  request_files?: RequestFile[];

  created_at: string;
  updated_at: string;
  has_correlation?: boolean;
}

export interface NongyneCytologyCaseCreate {
  hn?: string;
  an?: string;
  vn?: string;
  patient_id: number;
  hospital_id?: number;
  department_id?: number;
  medical_scheme_id?: number;
  specimen_type?: string;
  collection_site?: string;
  received_volume_ml?: string;
  clinical_diagnosis?: string;
  clinical_history?: string;
  clinician_name?: string;
  collect_at?: string;
  is_out_lab_consult?: boolean;
  is_out_lab?: boolean;
  num_slides?: number;
}

export interface NongyneCytologyCaseUpdate extends Partial<NongyneCytologyCaseCreate> {
  status?: string;
  cytotechnologist_id?: number;
  pathologist_id?: number;
  is_screened?: boolean;
  is_reported?: boolean;
  has_malignancy?: boolean;
  has_critical?: boolean;
  is_pending?: boolean;
  pending_reason?: string;
  is_out_lab_consult?: boolean;
  is_out_lab?: boolean;
  consult_status?: string;
  consult_pdf_path?: string;
  consult_reason?: string;
  consult_report_out_at?: string;
  consult_pdf_received_at?: string;
  is_cell_block?: boolean;
  cell_block_status?: string;
  cell_block_prepared_at?: string;
  cell_block_prepared_by_id?: number;
  slide_quality?: string;
  stain_quality?: string;
}
