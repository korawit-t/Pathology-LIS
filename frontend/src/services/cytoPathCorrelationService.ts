import api from "./httpClient";

export type CytoPathResult =
  | "concordant"
  | "minor_discrepancy"
  | "major_discrepancy"
  | "not_applicable";

export type CytoPathStatus =
  | "awaiting_signout"
  | "pending_review"
  | "reviewed"
  | "no_screening_data";

export type DiscrepancyCategory =
  | "interpretive"
  | "screening_miss"
  | "sampling"
  | "wording"
  | "other";

export interface UserRef {
  id: number;
  full_name: string;
}

export interface CytoPathCorrelation {
  id: number;
  case_type: "gyne" | "nongyne";
  gyne_case_id: number | null;
  nongyne_case_id: number | null;
  case_id: number | null;
  accession_no: string | null;

  cytotechnologist: UserRef | null;
  screening_diagnosis: string | null;
  screening_summary: string | null;
  screening_flags: Record<string, unknown> | null;
  screened_at: string | null;

  pathologist: UserRef | null;
  final_diagnosis: string | null;
  final_summary: string | null;
  final_flags: Record<string, unknown> | null;
  signed_out_at: string | null;
  version_no: number | null;

  /** Wording hint only — "did the text move at all", never a clinical verdict. */
  auto_result: "identical" | "changed" | null;
  result: CytoPathResult | null;
  status: CytoPathStatus;
  discrepancy_category: DiscrepancyCategory | null;
  comment: string | null;
  reviewed_by: UserRef | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CytoPathBucket {
  total: number;
  concordant: number;
  minor_discrepancy: number;
  major_discrepancy: number;
  not_applicable: number;
  pending: number;
  /** Rows with a verdict. Every rate below is over this, not over `total`. */
  graded: number;
  concordance_rate: number | null;
  major_rate: number | null;
  discrepancy_rate: number | null;
}

export interface CytoPathUserBucket extends CytoPathBucket {
  user_id: number | null;
  full_name: string;
}

export interface CytoPathMonthBucket extends CytoPathBucket {
  month: string;
}

export interface CytoPathSummary {
  overall: CytoPathBucket;
  by_cytotechnologist: CytoPathUserBucket[];
  monthly: CytoPathMonthBucket[];
}

export interface CytoPathListParams {
  skip?: number;
  limit?: number;
  case_type?: "gyne" | "nongyne";
  status?: CytoPathStatus;
  result?: CytoPathResult;
  cytotechnologist_id?: number;
  pathologist_id?: number;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface VerdictPayload {
  result?: CytoPathResult | null;
  discrepancy_category?: DiscrepancyCategory | null;
  comment?: string | null;
}

const BASE = "/cyto-path-correlations";

const CytoPathCorrelationService = {
  getAll: async (
    params?: CytoPathListParams,
  ): Promise<{ items: CytoPathCorrelation[]; total: number }> => {
    const res = await api.get(BASE, { params });
    return res.data;
  },

  getSummary: async (
    params?: Omit<CytoPathListParams, "skip" | "limit">,
  ): Promise<CytoPathSummary> => {
    const res = await api.get<CytoPathSummary>(`${BASE}/summary`, { params });
    return res.data;
  },

  getByCase: async (
    caseType: "gyne" | "nongyne",
    caseId: number,
  ): Promise<CytoPathCorrelation | null> => {
    const res = await api.get<CytoPathCorrelation | null>(`${BASE}/by-case`, {
      params: { case_type: caseType, case_id: caseId },
    });
    return res.data;
  },

  setVerdict: async (
    correlationId: number,
    payload: VerdictPayload,
  ): Promise<CytoPathCorrelation> => {
    const res = await api.put<CytoPathCorrelation>(`${BASE}/${correlationId}`, payload);
    return res.data;
  },
};

export default CytoPathCorrelationService;
