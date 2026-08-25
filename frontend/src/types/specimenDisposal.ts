// src/types/specimenDisposal.ts
//
// ใบตรวจสอบและทำลายชิ้นเนื้อ — หนึ่ง batch คือหนึ่งใบที่พิมพ์ออกไป
// PRINTED = พิมพ์แล้ว รอนำไปตรวจสอบหน้างานและเซ็นสามช่อง
// DISPOSED = กลับมาบันทึกยืนยันแล้ว เคสในใบถูกทำลายทั้งชุด
// CANCELLED = ยกเลิกใบ เคสกลับไปเลือกทำใบใหม่ได้

export type DisposalBatchStatus = "PRINTED" | "DISPOSED" | "CANCELLED";

export interface DisposalBatchUser {
  id: number;
  username: string;
  full_name?: string | null;
}

export interface DisposalBatchItem {
  id: number;
  case_id: number;
  container_snapshot?: string | null;
  accession_no?: string | null;
  hn?: string | null;
  patient_name?: string | null;
}

export interface DisposalBatch {
  id: number;
  batch_no: string;
  status: DisposalBatchStatus;
  retention_days?: number | null;
  disposal_method?: string | null;
  remark?: string | null;

  printed_at?: string | null;
  printed_by?: DisposalBatchUser | null;

  disposer_id?: number | null;
  verifier_id?: number | null;
  approver_id?: number | null;
  disposer_name?: string | null;
  verifier_name?: string | null;
  approver_name?: string | null;

  disposed_at?: string | null;
  disposed_by?: DisposalBatchUser | null;

  cancelled_at?: string | null;
  cancelled_by?: DisposalBatchUser | null;
  cancel_reason?: string | null;

  item_count: number;
  items: DisposalBatchItem[];
}

export interface DisposalBatchCreatePayload {
  case_ids: number[];
  disposer_id: number;
  verifier_id: number;
  approver_id: number;
  retention_days?: number | null;
}
