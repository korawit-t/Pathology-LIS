/* =========================
   Tissue Processing Types
========================= */

/**
 * สถานะของ Run
 */
export type TissueProcessingRunStatus = "processing" | "completed" | "aborted";

/**
 * สถานะของ Block รายชิ้น
 */
export type TissueProcessingItemStatus =
  | "processing"
  | "completed"
  | "missing"
  | "damaged";

/**
 * Item (ตลับเนื้อ) ภายใน Run
 * (TissueProcessingItem)
 */
export interface TissueProcessingItem {
  id: number;
  run_id: number;
  block_id: number;

  status: TissueProcessingItemStatus;

  processed_out_at?: string | null;
  out_remark?: string | null;

  created_at?: string;
}

/**
 * Run หลัก (TissueProcessingRun)
 */
export interface TissueProcessingRun {
  id: number;
  run_number: string;

  processor_name: string;
  program_name: string;

  start_at: string;
  created_by_id: number;

  block_in_total: number;
  block_out_total?: number | null;

  completed_at?: string | null;
  completed_by_id?: number | null;

  status: TissueProcessingRunStatus;
  remark?: string | null;

  created_at: string;
  updated_at: string;

  items?: TissueProcessingItem[];

  /** computed property จาก backend */
  block_count?: number;
}

/**
 * Payload สำหรับสร้าง Run (Processing In)
 */
export interface CreateTissueProcessingRunPayload {
  processor_name: string;
  program_name: string;
  start_at?: string;
  created_by_id: number;
  block_ids: number[];
  remark?: string;
}

/**
 * Payload สำหรับ update status Run
 */
export interface UpdateTissueProcessingRunStatusPayload {
  status: "completed" | "aborted";
  block_out_total?: number;
  completed_at?: string;
  completed_by_id?: number;
  remark?: string;
}

/**
 * Pending blocks สำหรับหน้าเลือกเข้าเครื่อง
 */
export interface PendingBlock {
  case_id: number;
  case_no: string;
  blocks: PendingBlockItem[];
}

export interface PendingDataNode {
  key: string | number;
  id?: number;
  code: string;
  full_code?: string;
  isCase: boolean;
  is_decal?: boolean;
  decal_start_at?: string; // 🚩 เพิ่มบรรทัดนี้
  decal_end_at?: string; // 🚩 เพิ่มบรรทัดนี้
  children?: PendingDataNode[];
}

export interface PendingBlockItem {
  block_id: number;
  block_label: string;
}

export interface SurgicalBlockLite {
  id: number;
  block_code: string;
  specimen_label: string;
  block_no: string;
  accession_no?: string;
  specimen?: {
    accession_no: string;
    lab_number?: string;
    hn?: string;
    clinician_name?: string;
    patient?: {
      full_name: string;
    };
  };
}

// สำหรับข้อมูลที่ถูกเลือกมาแล้วในหน้าหลัก
export interface ScannedBlock {
  id: number;
  code: string;
  is_decal: boolean;
  scannedAt: string;
}

export interface TissueProcessingItemView extends TissueProcessingItem {
  block?: SurgicalBlockLite;
}

export interface User {
  id: number;
  full_name: string;
  username?: string;
}
export interface TissueProcessingRunView extends TissueProcessingRun {
  creator?: User;
  completer?: User;
  items?: TissueProcessingItemView[];
}

// กำหนด Interface สำหรับข้อมูลที่ Group แล้วใน Detail Modal
export interface GroupedAccession {
  accession_no: string;
  patient_name: string;
  blocks: TissueProcessingItemView[];
  status_counts: {
    completed: number;
    missing: number;
    processing: number;
  };
}
