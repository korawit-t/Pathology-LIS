// src/types/surgical_bulk.ts

export interface DiagnosisData {
  diagnosis: string | null;
  microscopic_description: string | null;
  is_active?: boolean;
  pathologists?: PathologistAssignment[];
}

export interface PathologistAssignment {
  user_id: number;
  role: string;
}

export interface BulkSaveDraft {
  case_id: number;

  // 🚩 1. ข้อมูลระดับ CASE (ที่จะไปอัปเดตลงตาราง SurgicalCase)
  diagnosis_mode: "individual" | "integrated" | "clean";
  clinical_diagnosis: string | null;
  has_malignancy: boolean;
  has_critical: boolean;
  is_pending: boolean;
  pending_reason: string | null;
  is_out_lab_consult?: boolean;
  consult_reason?: string | null;
  consult_report_out_at?: string | null;

  // New Quality Assessment
  stain_quality?: string;
  tissue_quality?: string;
  slide_quality?: string;

  // 🚩 2. ข้อมูลระดับ SPECIMEN (ที่จะไปอัปเดตลงตาราง SurgicalSpecimen)
  gross_descriptions: { [specimen_id: string]: string };

  // 🚩 3. ข้อมูลระดับ DIAGNOSIS (ที่จะไปลงตาราง SurgicalDiagnosis)
  diagnoses: { [specimen_id: string]: DiagnosisData }; // สำหรับรายชิ้น
  case_diagnosis_text?: string | null; // สำหรับ Integrated Mode (CASE level)

  pathologists: PathologistAssignment[];
  signed_by_id?: number | null;
  global_revision_reason?: string | null;
}
