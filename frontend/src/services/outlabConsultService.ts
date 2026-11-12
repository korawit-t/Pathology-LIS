import api from "./httpClient";

export type ConsultCaseType = "surgical" | "gyne" | "nongyne";

export type ConsultRoundStatus =
  | "requested"
  | "sent"
  | "result_received"
  | "approved"
  | "reported"
  | "cancelled";

/** One out-lab consult round of a case (S26-01234-C1, -C2, …). */
export interface OutlabConsultRound {
  id: number;
  case_type: ConsultCaseType;
  case_id: number;
  seq: number;
  consult_no: string;
  status: ConsultRoundStatus;
  reason?: string | null;
  destination_lab?: string | null;
  requested_by_name?: string | null;
  requested_at?: string | null;
  has_result_pdf: boolean;
  result_received_at?: string | null;
  external_ref?: string | null;
  external_pathologist?: string | null;
  concordance?: string | null;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  reported_in_report_id?: number | null;
  reported_at?: string | null;
}

const OPEN_STATUSES: ConsultRoundStatus[] = ["requested", "sent", "result_received", "approved"];

/** The round still in progress, else the latest one that wasn't cancelled. */
export function currentRound(rounds: OutlabConsultRound[]): OutlabConsultRound | undefined {
  const live = rounds.filter((r) => r.status !== "cancelled");
  return live.find((r) => OPEN_STATUSES.includes(r.status)) ?? live[live.length - 1];
}

export const OutlabConsultService = {
  listForCase: async (caseType: ConsultCaseType, caseId: number): Promise<OutlabConsultRound[]> => {
    const res = await api.get("/outlab-consults", { params: { case_type: caseType, case_id: caseId } });
    return res.data;
  },

  approve: async (consultId: number): Promise<OutlabConsultRound> => {
    const res = await api.post(`/outlab-consults/${consultId}/approve`);
    return res.data;
  },
};
