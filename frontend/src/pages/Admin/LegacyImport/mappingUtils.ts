import type {
  LegacyFieldSource,
  LegacyImportMapping,
  LegacyImportReportType,
  LegacyInspectResult,
  LegacyTargetField,
} from "../../../services/legacyImportService";

/** Select value meaning "type a fixed value for every row". */
export const FIXED_VALUE = "__fixed__";

export const REPORT_TYPE_LABEL: Record<LegacyImportReportType, string> = {
  surgical: "Surgical",
  gyne: "Gyne Cytology",
  nongyne: "Non-Gyne Cytology",
};

export const REPORT_TYPE_COLOR: Record<LegacyImportReportType, string> = {
  surgical: "blue",
  gyne: "magenta",
  nongyne: "orange",
};

export const GROUP_LABEL: Record<string, string> = {
  key: "ข้อมูลอ้างอิง",
  patient: "ผู้ป่วย",
  source: "ผู้ส่งตรวจ",
  diagnosis: "ผลตรวจ",
  meta: "ข้อมูลรายงาน",
};

export const GROUP_ORDER = ["key", "patient", "source", "diagnosis", "meta"];

export const isSet = (src?: LegacyFieldSource | null): boolean =>
  !!src && (!!src.column?.trim() || (src.value != null && src.value.trim() !== ""));

/** Drop fields left empty, so the backend sees only what was chosen. */
export const cleanFields = (fields: Record<string, LegacyFieldSource>): Record<string, LegacyFieldSource> =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([, src]) => isSet(src))
      .map(([key, src]) => [key, src.column ? { column: src.column } : { value: src.value }]),
  );

/**
 * The starting mapping for a file just read: a saved profile's fields when one
 * is chosen (minus columns this file does not have), otherwise the backend's
 * guesses from the header names.
 */
export const initialFields = (
  headers: string[],
  suggested: Record<string, string>,
  profile?: LegacyImportMapping | null,
): { fields: Record<string, LegacyFieldSource>; missingColumns: string[] } => {
  if (!profile) {
    return {
      fields: Object.fromEntries(Object.entries(suggested).map(([key, column]) => [key, { column }])),
      missingColumns: [],
    };
  }
  const headerSet = new Set(headers);
  const fields: Record<string, LegacyFieldSource> = {};
  const missing = new Set<string>();
  Object.entries(profile.fields).forEach(([key, src]) => {
    if (src.column) {
      if (headerSet.has(src.column)) fields[key] = { column: src.column };
      else missing.add(src.column);
    } else if (src.value != null && src.value !== "") {
      fields[key] = { value: src.value };
    }
  });
  return { fields, missingColumns: [...missing] };
};

/** Labels of required fields not mapped yet (the backend refuses the same). */
export const missingRequired = (
  targets: LegacyTargetField[],
  fields: Record<string, LegacyFieldSource>,
): string[] => {
  const missing = targets.filter((f) => f.required && !isSet(fields[f.key])).map((f) => f.label);
  if (!isSet(fields.patient_name) && !isSet(fields.patient_full_name)) {
    missing.push("ชื่อผู้ป่วย (ชื่อ หรือ ชื่อ-นามสกุล)");
  }
  return missing;
};

/** The first few non-empty values of a column, to show next to the mapping. */
export const sampleValues = (inspect: LegacyInspectResult | null, column?: string | null, n = 3): string[] => {
  if (!inspect || !column) return [];
  const index = inspect.headers.indexOf(column);
  if (index < 0) return [];
  const out: string[] = [];
  for (const row of inspect.sample_rows) {
    const v = row[index];
    if (v) out.push(v);
    if (out.length >= n) break;
  }
  return out;
};

export const buildMapping = (state: {
  reportType: LegacyImportReportType;
  sourceSystem: string;
  sheet?: string | null;
  headerRow: number;
  fields: Record<string, LegacyFieldSource>;
  hospitalValues: Record<string, number>;
  defaultHospitalId?: number | null;
  onDuplicate: "skip" | "update";
}): LegacyImportMapping => ({
  report_type: state.reportType,
  source_system: state.sourceSystem.trim(),
  sheet: state.sheet || null,
  header_row: state.headerRow,
  fields: cleanFields(state.fields),
  hospital_values: state.hospitalValues,
  default_hospital_id: state.defaultHospitalId ?? null,
  on_duplicate: state.onDuplicate,
});

/** A FastAPI error detail as one line: a string as is, a validation list joined. */
export const apiErrorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : ""))
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return fallback;
};
