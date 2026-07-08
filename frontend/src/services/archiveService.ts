export interface ArchiveItem {
  source: "current" | "legacy";
  id: number;
  accession_no?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  patient_gender?: string;
  patient_age?: number;
  hospital_name?: string;
  department_name?: string;
  clinician_name?: string;
  pathologist_name?: string;
  date?: string;
  registered_date?: string;
  status?: string;
  has_malignancy?: boolean;
  adequacy_text?: string;
  category_1_text?: string;
  interpretation?: string;
  specimen?: string;
  collection_site?: string;
  case_id?: number;
  has_outlab_result?: boolean;
}

export interface ArchivePage {
  items: ArchiveItem[];
  total: number;
}
