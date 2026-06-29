export type GyneStainStatus = "pending" | "stained" | "completed" | "cancelled";

// 1. เพิ่ม Interface สำหรับ Master Data ของการทดสอบ
export interface APTestSimple {
  id: number;
  name: string;
  price_tier_1: number;
  category?: string;
}

export interface GyneCytologyStain {
  id: number;
  case_id: number;

  // 2. เปลี่ยน/เพิ่มฟิลด์ให้ตรงกับ Backend
  test_id: number | null;
  slide_no: number;
  status: GyneStainStatus;

  // 3. เพิ่ม property 'test' เพื่อรองรับข้อมูลที่ Join มาจาก Backend
  test?: APTestSimple | null;

  // ข้อมูลเดิม
  is_printed: boolean;
  printed_at?: string | null;
  printed_by_id?: number | null;
  created_at: string;
  updated_at: string;
  accession_no?: string;

  case?: {
    id: number;
    accession_no: string;
  } | null;
}

// 4. อัปเดต Create/Update ให้ใช้ test_id แทน stain_type
export interface GyneStainCreate {
  case_id: number;
  test_id: number;
  slide_no: number;
}

export interface GyneStainUpdate {
  status?: GyneStainStatus;
  is_printed?: boolean;
  test_id?: number;
  slide_no?: number;
}

export interface GyneStainRunDetail {
  id: number;
  stain_id: number;
  stain_order?: GyneCytologyStain; // ข้อมูลสไลด์และ Accession No
}

export interface GyneStainRun {
  id: number;
  run_no: string;
  stainer_id: string;
  status: string;
  operator_id: number;
  operator?: { full_name?: string; name?: string };
  created_at: string;
  details: GyneStainRunDetail[];
}

export interface GyneStainRunPagination {
  total: number;
  items: GyneStainRun[];
}
