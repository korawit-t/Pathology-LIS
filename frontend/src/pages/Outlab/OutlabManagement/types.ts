export interface OutlabBlockStain {
  id: number;
  status: string;
  created_at?: string;
  test?: { name?: string; category?: string; is_external?: boolean };
}

export interface OutlabBlock {
  id: number;
  accession_no?: string;
  specimen_label?: string;
  block_no?: string;
  block_code?: string;
  specimen_name?: string;
  is_decal?: boolean;
  specimen?: { accession_no?: string };
  stains?: OutlabBlockStain[];
}

export interface CaseInfo {
  hn: string;
  patient_name: string;
  age?: number | null;
  scheme?: string;
  hospital?: string;
}

export interface ExternalLab {
  name: string;
}

// Note: this shape doesn't fully match HisService.getAppointments' declared
// return type (which has doctor/depcode/clinic instead of
// department/contact_point/app_cause) — kept loose here rather than
// silently reconciling the discrepancy as part of this pure file-move.
export interface OutlabAppointment {
  oapp_id: number;
  nextdate?: string | null;
  nexttime?: string | null;
  department?: string | null;
  contact_point?: string | null;
  app_cause?: string | null;
  note?: string | null;
}

export interface TodayPatientItem {
  id: number;
  accession_no: string | null;
  block_code: string | null;
  stain_name: string;
  destination_lab: string | null;
}

export interface TodayPatientRow {
  key: string;
  hn: string;
  patient_name: string;
  items: TodayPatientItem[];
}
