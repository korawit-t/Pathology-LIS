import dayjs from "dayjs";
import { SurgicalCase } from "../../types/surgical";
import { GyneCytologyCase } from "../../types/gyne-cytology";
import { NongyneCytologyCase } from "../../types/nongyne";
import { UnifiedRow } from "./types";

export const buildUnifiedRows = (
  surgCases: SurgicalCase[],
  gyneCases: GyneCytologyCase[],
  ngCases: NongyneCytologyCase[],
  ihcAccessions: Set<string> = new Set(),
): UnifiedRow[] => {
  const rows: UnifiedRow[] = [
    ...surgCases.map((c) => ({
      _key: `s-${c.id}`,
      type: "surgical" as const,
      id: c.id,
      accession_no: c.accession_no,
      hn: c.hn || "-",
      patient_name:
        [c.patient?.title?.title, c.patient?.name, c.patient?.ln]
          .filter(Boolean)
          .join(" ") || "-",
      specimen: c.specimens?.[0]?.specimen_name || "-",
      status: c.status,
      registered_at: c.registered_at,
      clinician: c.clinician_name || "-",
      hospital: c.hospital?.name || "-",
      department: c.department?.name || "-",
      coverage: c.medical_scheme?.name || undefined,
      is_express: !!c.is_express,
      consult: !!c.is_out_lab_consult && !c.consult_pdf_path,
      has_pending_ihc: ihcAccessions.has(c.accession_no),
      wf_grossed: !!c.is_grossed,
      wf_processed: !!c.is_processed,
      wf_slide_prepped: !!c.is_slide_prepped,
      wf_reported: !!c.is_reported,
    })),
    ...gyneCases.map((c) => ({
      _key: `g-${c.id}`,
      type: "gyne" as const,
      id: c.id,
      accession_no: c.accession_no,
      hn: c.hn || "-",
      patient_name:
        [c.patient?.title?.title, c.patient?.name, c.patient?.ln]
          .filter(Boolean)
          .join(" ") || "-",
      specimen: c.specimen_type || "-",
      status: c.status,
      registered_at: c.registered_at,
      clinician: c.clinician_name || "-",
      hospital: c.hospital?.name || "-",
      department: c.department?.name || "-",
      coverage: c.medical_scheme?.name || undefined,
      is_express: !!c.is_express,
      wf_screened: !!c.screened_at,
      wf_reported: !!c.reported_at,
    })),
    ...ngCases.map((c) => ({
      _key: `n-${c.id}`,
      type: "nongyne" as const,
      id: c.id,
      accession_no: c.accession_no,
      hn: c.hn || "-",
      patient_name:
        [c.patient?.title?.title, c.patient?.name, c.patient?.ln]
          .filter(Boolean)
          .join(" ") || "-",
      specimen: c.specimen_type || "-",
      status: c.status,
      registered_at: c.registered_at,
      clinician: c.clinician_name || "-",
      hospital: c.hospital?.name || "-",
      department: c.department?.name || "-",
      coverage: c.medical_scheme?.name || undefined,
      is_express: !!c.is_express,
      wf_screened: !!c.screened_at,
      wf_reported: !!c.reported_at,
    })),
  ];
  return rows.sort(
    (a, b) => dayjs(b.registered_at).unix() - dayjs(a.registered_at).unix(),
  );
};
