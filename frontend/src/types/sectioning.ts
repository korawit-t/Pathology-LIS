/**
 * ================================
 * Sectioning (Microtomy) Types
 * ================================
 */

/* =====================================================
 * 1. SHARED / COMMON
 * ===================================================== */

export interface SectioningUser {
  username: string;
  full_name?: string;
}

export interface BlockInfo {
  id: number;
  block_code: string;
  accession_no: string;
}

/* =====================================================
 * 2. API PAYLOADS (Frontend → Backend)
 * ===================================================== */

export interface SectioningDetailPayload {
  block_id: number;
  slide_count: number;
  is_recut?: boolean;
  remark?: string;
}

export interface SectioningRunCreatePayload {
  microtome_id: string;
}

export interface SectioningBatchPayload {
  user_id: number;
  microtome_id: string;
  items: SectioningDetailPayload[];
}

/* =====================================================
 * 3. API RESPONSES (Backend → Frontend)
 * ===================================================== */

/**
 * รายการตัดแต่ละ block ภายใน run
 */
export interface SectioningRunDetailResponse {
  id: number;
  block_id: number;
  slide_count: number;
  is_recut: boolean;
  remark?: string;

  created_at: string;

  block?: BlockInfo;
}

/**
 * รอบการตัด (Sectioning Run)
 */
export interface SectioningRunResponse {
  id: number;
  run_no: string;

  microtome_id: string;

  started_at: string;
  finished_at?: string;

  user?: SectioningUser;
  details: SectioningRunDetailResponse[];
}

/* =========================
 * Pending Sectioning Tree
 * ========================= */

export interface PendingBlockNode {
  key: string | number;
  id: number;
  code: string; // ✅ backend ใช้จริง
  isCase: boolean;
  is_decal?: boolean;
  children?: PendingBlockNode[];
}

// ====== Data ที่สแกนแล้ว / ส่ง backend ======
export interface ScannedBlock {
  id: number;
  code: string;
  accession_no: string;
  slide_count: number;
  scannedAt?: string;
  is_decal?: boolean;
}
