// src/types/nongyneSpecimenDisposal.ts
//
// ใบตรวจสอบและทำลายสิ่งส่งตรวจ Non-Gyne Cytology
// โครงเดียวกับ types/specimenDisposal.ts ของ surgical ต่างกันตรงที่ item
// ไม่มีกล่อง (non-gyne ไม่มีขั้นตอนจัดเก็บ) แต่พก specimen_type / วันรายงานผลมาแทน
//
// PRINTED = พิมพ์แล้ว รอนำไปตรวจสอบหน้างานและเซ็นสามช่อง
// DISPOSED = กลับมาบันทึกยืนยันแล้ว สิ่งส่งตรวจในใบถูกทำลายทั้งชุด
// CANCELLED = ยกเลิกใบ เคสกลับไปเลือกทำใบใหม่ได้

export type NongyneDisposalBatchStatus = "PRINTED" | "DISPOSED" | "CANCELLED";

export interface NongyneDisposalBatchUser {
  id: number;
  username: string;
  full_name?: string | null;
}

export interface NongyneDisposalBatchItem {
  id: number;
  case_id: number;
  accession_no?: string | null;
  hn?: string | null;
  patient_name?: string | null;
  specimen_type?: string | null;
  collection_site?: string | null;
  report_at?: string | null;
  days_since_report?: number | null;
}

export interface NongyneDisposalBatch {
  id: number;
  batch_no: string;
  status: NongyneDisposalBatchStatus;
  retention_days?: number | null;
  disposal_method?: string | null;
  remark?: string | null;

  printed_at?: string | null;
  printed_by?: NongyneDisposalBatchUser | null;

  disposer_id?: number | null;
  verifier_id?: number | null;
  approver_id?: number | null;
  disposer_name?: string | null;
  verifier_name?: string | null;
  approver_name?: string | null;

  disposed_at?: string | null;
  disposed_by?: NongyneDisposalBatchUser | null;

  cancelled_at?: string | null;
  cancelled_by?: NongyneDisposalBatchUser | null;
  cancel_reason?: string | null;

  item_count: number;
  items: NongyneDisposalBatchItem[];
}

// ไม่มี retention_days — เกณฑ์มาจาก SystemSetting ฝั่ง server เท่านั้น
export interface NongyneDisposalBatchCreatePayload {
  case_ids: number[];
  disposer_id: number;
  verifier_id: number;
  approver_id: number;
}

export type NongyneDisposalBucket = "due" | "not_due" | "blocked";

export interface NongyneDisposalCandidate {
  id: number;
  accession_no: string;
  hn?: string | null;
  status: string;
  specimen_type?: string | null;
  collection_site?: string | null;
  registered_at?: string | null;
  report_at?: string | null;
  is_pending: boolean;
  pending_reason?: string | null;

  // คำนวณจาก backend ทั้งหมด — ตัวเลขเดียวกับที่ใช้บล็อกตอนสร้างใบ
  days_since_report?: number | null;
  is_due: boolean;
  block_reason?: string | null;

  discard_status: boolean;
  discard_at?: string | null;
  specimen_disposer?: NongyneDisposalBatchUser | null;

  patient?: {
    id: number;
    name?: string | null;
    ln?: string | null;
    title?: { title?: string | null } | null;
  } | null;
}

export interface NongyneDisposalCandidateList {
  items: NongyneDisposalCandidate[];
  total: number;
  retention_days: number;
}
