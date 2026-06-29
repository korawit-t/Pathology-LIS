export type StainCategory = "ROUTINE" | "SPECIAL" | "IHC";
export type StainStatus = "pending" | "stained" | "completed";

// --- รายละเอียดสไลด์รายแผ่น (Detail) ---
export interface StainRequest {
  id: number;
  run_id?: number;
  block_id: number;
  block_no?: string;
  block_code?: string;
  accession_no?: string;
  test_id?: number | null;
  test_name?: string;
  test_category?: string;
  stain_name?: string;
  stain_type?: string;
  category?: StainCategory;
  slide_no: number;
  status: StainStatus;
  is_printed: boolean;
  printed_at?: string;
  created_at: string;
  is_recut?: boolean;
  recut_note?: string | null;
}

// --- สำหรับการสร้างรอบการย้อม (Create Payload) ---
export interface HEStainItem {
  block_id: number;
  slide_count: number;
}

export interface HEStainRunCreate {
  user_id: number;
  stainer_id?: string;
  items: HEStainItem[];
}

export interface APTestSimple {
  id: number;
  name: string;
  category: string;
}

// --- สำหรับแสดงประวัติรอบการย้อม (Header) ---
export interface UserInfo {
  id: number;
  full_name?: string | null;
  username?: string | null;
}

export interface StainingRunResponse {
  id: number;
  run_no: string;
  operator_id: number;
  operator?: UserInfo; // ข้อมูลผู้ใช้ที่ดึงมาจากการ Join ใน Backend
  stainer_id?: string;
  started_at: string;
  completed_at?: string;
  details: {
    id: number;
    stain_order: StainRequest & {
      test: APTestSimple;
      block?: {
        specimen_label?: string;
        block_no?: number;
        block_code?: string;
        accession_no?: string;
        is_decal?: boolean;
        specimen?: { specimen_label?: string; case?: { accession_no?: string } };
      };
    };
  }[];
}

// --- สำหรับโครงสร้าง Tree ในหน้าจอ HEManager ---
export interface PendingStainNode {
  key: string; // unique key เช่น 'spec-1'
  title: string; // แสดง Accession No หรือ Block Name
  id?: number; // block_id จริงๆ ใน DB
  block_code?: string; // 🚩 เปลี่ยนจาก block_no เพื่อให้ตรงกับ Backend
  test_name?: string;
  isCase: boolean;
  children?: PendingStainNode[];
}

export interface StainRunCreate {
  stain_ids: number[];
  stainer_id?: string;
  note?: string;
}

/**
 * สำหรับการอัปเดตสถานะของ Run
 */
export interface StainRunUpdate {
  status: StainStatus; // 'pending' | 'stained' | 'completed'
  note?: string;
}

/**
 * สำหรับข้อมูลรายละเอียด Run พร้อมรายการสไลด์ข้างใน (Extended Response)
 * ใช้ในหน้าดูรายละเอียดประวัติการย้อม (Run Detail View)
 */
export interface StainingRunDetailResponse {
  run_info: StainingRunResponse;
  stains: StainRequest[]; // รายชื่อสไลด์ทั้งหมดที่ถูกผูกไว้ใน Run นี้
}

/**
 * สำหรับ Parameter ในการค้นหา (Query Params)
 */
export interface StainRunQueryParams {
  category?: StainCategory;
  status?: string;
  user_id?: number;
}

// --- View Modes สำหรับ Index Manager ---
export type StainingViewMode = "list" | "create" | "details";
