export type ConsultCaseType = "surgical" | "gyne" | "nongyne";
export type ConsultStatus = "pending" | "responded" | "closed";

export interface UserMini {
  id: number;
  full_name?: string;
  report_name?: string;
}

export interface InternalConsult {
  id: number;
  case_type: ConsultCaseType;
  report_id: number;
  requester_id: number;
  consultant_id: number;
  reason: string;
  opinion?: string | null;
  accession_no_snapshot?: string | null;
  status: ConsultStatus;
  promoted_to_signer: boolean;
  created_at: string;
  responded_at?: string | null;
  closed_at?: string | null;
  requester?: UserMini;
  consultant?: UserMini;
}

export interface InternalConsultCreate {
  case_type: ConsultCaseType;
  report_id: number;
  consultant_id: number;
  reason: string;
}

export interface InternalConsultRespondRequest {
  opinion: string;
}

export interface InternalConsultPromoteRequest {
  role?: string;
  consult_note?: string;
}

export interface InternalConsultListResponse {
  items: InternalConsult[];
  total: number;
}
