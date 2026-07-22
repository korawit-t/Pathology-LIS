export interface ReportListItem {
  id: number;
  status: string;
  published_at?: string | null;
}

export interface OutlabRunDetail {
  id: number;
  block_id: number;
  block_code?: string;
  accession_no?: string;
  stain_order?: { id: number; test?: { name: string; category?: string } };
}

export interface OutlabStainRun {
  id: number;
  run_no?: string;
  destination_lab?: string;
  sent_at?: string;
  received_at?: string;
  details?: OutlabRunDetail[];
}

export type UnifiedRow = {
  _key: string;
  type: "surgical" | "gyne" | "nongyne" | "molecular";
  id: number;
  accession_no: string;
  hn: string;
  patient_name: string;
  specimen: string;
  status: string;
  registered_at: string;
  clinician?: string;
  hospital?: string;
  department?: string;
  coverage?: string;
  is_express?: boolean;
  consult?: boolean;
  has_pending_ihc?: boolean;
  wf_grossed?: boolean;
  wf_processed?: boolean;
  wf_slide_prepped?: boolean;
  wf_reported?: boolean;
  wf_screened?: boolean;
};
