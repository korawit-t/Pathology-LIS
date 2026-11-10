import api from "./httpClient";

const BASE = "/legacy-imports";

export type LegacyImportReportType = "surgical" | "gyne" | "nongyne";
export type LegacyFieldKind = "text" | "longtext" | "date" | "int" | "bool" | "full_name" | "hospital";

export interface LegacyTargetField {
  key: string;
  label: string;
  kind: LegacyFieldKind;
  required: boolean;
  group: "key" | "patient" | "source" | "diagnosis" | "meta" | string;
  help?: string | null;
}

/** Where a target field takes its value: a column of the file, or the same value on every row. */
export interface LegacyFieldSource {
  column?: string | null;
  value?: string | null;
}

export interface LegacyImportMapping {
  report_type: LegacyImportReportType;
  source_system: string;
  sheet?: string | null;
  header_row: number;
  fields: Record<string, LegacyFieldSource>;
  hospital_values: Record<string, number>;
  default_hospital_id?: number | null;
  on_duplicate: "skip" | "update";
}

export interface LegacyInspectResult {
  file_name?: string | null;
  sheets: string[];
  sheet?: string | null;
  headers: string[];
  sample_rows: (string | null)[][];
  total_rows: number;
  suggested_fields: Record<string, string>;
}

export interface LegacyImportIssue {
  row: number;
  level: "error" | "warning";
  field?: string | null;
  message: string;
}

export interface LegacyHospitalValueMatch {
  value: string;
  count: number;
  hospital_id?: number | null;
  hospital_name?: string | null;
  matched_by?: "mapping" | "code" | "name" | null;
}

export interface LegacyPreviewResult {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  new_rows: number;
  existing_rows: number;
  issues: LegacyImportIssue[];
  issues_truncated: boolean;
  sample: { row: number; existing: boolean; values: Record<string, unknown> }[];
  hospital_values: LegacyHospitalValueMatch[];
  same_file_batches: { id: number; created_at?: string | null; inserted_count: number }[];
}

export interface LegacyImportBatch {
  id: number;
  report_type: LegacyImportReportType;
  source_system: string;
  file_name?: string | null;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  status: "committed" | "rolled_back";
  created_at?: string | null;
  created_by_name?: string | null;
  rolled_back_at?: string | null;
  rolled_back_by_name?: string | null;
  rolled_back_count?: number | null;
}

export interface LegacyImportProfile {
  id: number;
  name: string;
  report_type: LegacyImportReportType;
  mapping: LegacyImportMapping;
  created_at?: string | null;
  updated_at?: string | null;
}

const fileForm = (file: File, extra: Record<string, string>) => {
  const form = new FormData();
  form.append("file", file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return form;
};

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const legacyImportService = {
  getFields: async (): Promise<Record<LegacyImportReportType, LegacyTargetField[]>> => {
    const res = await api.get(`${BASE}/fields`);
    return res.data;
  },

  inspect: async (
    file: File,
    reportType: LegacyImportReportType,
    sheet?: string | null,
    headerRow = 1,
  ): Promise<LegacyInspectResult> => {
    const extra: Record<string, string> = { report_type: reportType, header_row: String(headerRow) };
    if (sheet) extra.sheet = sheet;
    const res = await api.post(`${BASE}/inspect`, fileForm(file, extra), multipart);
    return res.data;
  },

  preview: async (file: File, mapping: LegacyImportMapping): Promise<LegacyPreviewResult> => {
    const res = await api.post(`${BASE}/preview`, fileForm(file, { mapping: JSON.stringify(mapping) }), multipart);
    return res.data;
  },

  commit: async (file: File, mapping: LegacyImportMapping, skipInvalid: boolean): Promise<LegacyImportBatch> => {
    const res = await api.post(
      `${BASE}/commit`,
      fileForm(file, { mapping: JSON.stringify(mapping), skip_invalid: String(skipInvalid) }),
      multipart,
    );
    return res.data;
  },

  getBatches: async (params: { skip?: number; limit?: number }): Promise<{ total: number; items: LegacyImportBatch[] }> => {
    const res = await api.get(`${BASE}/batches`, { params });
    return res.data;
  },

  rollback: async (id: number): Promise<LegacyImportBatch> => {
    const res = await api.post(`${BASE}/batches/${id}/rollback`);
    return res.data;
  },

  getProfiles: async (reportType?: LegacyImportReportType): Promise<LegacyImportProfile[]> => {
    const res = await api.get(`${BASE}/profiles`, { params: { report_type: reportType } });
    return res.data;
  },

  createProfile: async (name: string, mapping: LegacyImportMapping): Promise<LegacyImportProfile> => {
    const res = await api.post(`${BASE}/profiles`, { name, mapping });
    return res.data;
  },

  updateProfile: async (id: number, name: string, mapping: LegacyImportMapping): Promise<LegacyImportProfile> => {
    const res = await api.put(`${BASE}/profiles/${id}`, { name, mapping });
    return res.data;
  },

  deleteProfile: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/profiles/${id}`);
  },
};

export default legacyImportService;
