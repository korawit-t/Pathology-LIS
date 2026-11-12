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

export type Concordance = "concordant" | "minor_discordant" | "major_discordant";

export const CONCORDANCE_LABELS: Record<Concordance, string> = {
  concordant: "Concordant",
  minor_discordant: "Minor discordance",
  major_discordant: "Major discordance",
};

export interface ConsultRoundDetailsPatch {
  destination_lab?: string | null;
  external_ref?: string | null;
  external_pathologist?: string | null;
  concordance?: Concordance | null;
  reason?: string | null;
}

const OPEN_STATUSES: ConsultRoundStatus[] = ["requested", "sent", "result_received", "approved"];

/** True while the round hasn't been released or cancelled. */
export const isOpenRound = (round: OutlabConsultRound): boolean => OPEN_STATUSES.includes(round.status);

/** "S26-02890-C2" → "C2"; null when there is no round. */
export const consultRound = (consultNo?: string | null): string | null =>
  consultNo?.match(/-(C\d+)$/)?.[1] ?? null;

/** The round still in progress, else the latest one that wasn't cancelled. */
export function currentRound(rounds: OutlabConsultRound[]): OutlabConsultRound | undefined {
  const live = rounds.filter((r) => r.status !== "cancelled");
  return live.find(isOpenRound) ?? live[live.length - 1];
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

  /** Opens the case's next round (409 while one is still open). */
  request: async (
    caseType: ConsultCaseType,
    caseId: number,
    reason: string,
    destinationLab?: string | null,
  ): Promise<OutlabConsultRound> => {
    const res = await api.post("/outlab-consults", {
      case_type: caseType,
      case_id: caseId,
      reason,
      destination_lab: destinationLab || null,
    });
    return res.data;
  },

  cancel: async (consultId: number, reason?: string): Promise<OutlabConsultRound> => {
    const res = await api.post(`/outlab-consults/${consultId}/cancel`, { reason: reason || null });
    return res.data;
  },

  updateDetails: async (consultId: number, patch: ConsultRoundDetailsPatch): Promise<OutlabConsultRound> => {
    const res = await api.patch(`/outlab-consults/${consultId}`, patch);
    return res.data;
  },

  getResultPdfBlob: async (consultId: number): Promise<Blob> => {
    const res = await api.get(`/outlab-consults/${consultId}/result-pdf`, { responseType: "blob" });
    return res.data;
  },
};
