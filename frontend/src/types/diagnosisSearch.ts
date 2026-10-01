// src/types/diagnosisSearch.ts
export type DiagnosisSearchMatchMode = "all" | "any";
export type DiagnosisSearchDateField = "registered" | "reported";

export interface DiagnosisSearchParams {
  specimen_terms: string[];
  diagnosis_terms: string[];
  match_mode: DiagnosisSearchMatchMode;
  include_gross: boolean;
  include_microscopic: boolean;
  date_field: DiagnosisSearchDateField;
  date_from?: string;
  date_to?: string;
  hospital_id?: number;
  only_reported: boolean;
}

export interface DiagnosisSearchCriteria extends DiagnosisSearchParams {
  hospital_name: string | null;
}

export interface DiagnosisSearchRow {
  case_id: number;
  accession_no: string;
  hn: string | null;
  patient_name: string;
  gender: string | null;
  hospital_name: string | null;
  registered_at: string | null;
  report_at: string | null;
  status: string | null;
  is_reported: boolean;
  has_malignancy: boolean | null;
  pathologist_name: string | null;
  /** The specimen rows that satisfied the specimen terms ("A: Colon, biopsy"). */
  matched_specimens: string[];
  /** Trimmed diagnosis text that satisfied the diagnosis terms. */
  matched_diagnoses: string[];
}

export interface DiagnosisSearchResponse {
  /** Real match count — may exceed `items.length`, which the API caps. */
  total: number;
  malignant_count: number;
  items: DiagnosisSearchRow[];
  criteria: DiagnosisSearchCriteria;
}
