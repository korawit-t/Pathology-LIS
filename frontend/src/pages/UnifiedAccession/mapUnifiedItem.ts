import { UnifiedCaseItem } from "../../services/unifiedCaseService";
import { UnifiedRow } from "./types";

export const mapUnifiedItem = (
  item: UnifiedCaseItem,
  hasPendingIhc: boolean,
): UnifiedRow => ({
  _key: `${item.case_type[0]}-${item.id}`,
  type: item.case_type,
  id: item.id,
  accession_no: item.accession_no,
  hn: item.hn || "-",
  patient_name: item.patient_name || "-",
  specimen: item.specimen || "-",
  status: item.status,
  registered_at: item.registered_at || "",
  clinician: item.clinician_name || "-",
  hospital: item.hospital_name || "-",
  department: item.department_name || "-",
  coverage: item.medical_scheme_name || undefined,
  is_express: item.is_express,
  consult: item.consult,
  has_pending_ihc: hasPendingIhc,
  wf_grossed: item.wf_grossed,
  wf_processed: item.wf_processed,
  wf_slide_prepped: item.wf_slide_prepped,
  wf_screened: item.wf_screened,
  wf_reported: item.wf_reported,
});
