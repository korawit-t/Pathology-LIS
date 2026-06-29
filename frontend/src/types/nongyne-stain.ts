export type NongyneStainStatus = "pending" | "stained" | "completed" | "cancelled";

// 1. เพิ่ม Interface สำหรับ Master Data ของการทดสอบ
export interface APTestSimple {
  id: number;
  name: string;
  price_tier_1: number;
  category?: string;
}

export interface NongyneCytologyStain {
  id: number;
  case_id: number;

  // 2. เปลี่ยน/เพิ่มฟิลด์ให้ตรงกับ Backend
  test_id: number | null;
  slide_no: number;
  status: NongyneStainStatus;

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
export interface NongyneStainCreate {
  case_id: number;
  test_id: number;
  slide_no: number;
}

export interface NongyneStainUpdate {
  status?: NongyneStainStatus;
  is_printed?: boolean;
  test_id?: number;
  slide_no?: number;
}

export interface NongyneStainRunDetail {
  id: number;
  stain_id: number;
  stain_order?: NongyneCytologyStain; // ข้อมูลสไลด์และ Accession No
}

export interface NongyneStainRun {
  id: number;
  run_no: string;
  stainer_id: string;
  status: string;
  operator_id: number;
  operator?: { full_name?: string; name?: string };
  created_at: string;
  details: NongyneStainRunDetail[]; // รายการสไลด์ใน Batch นี้
}

export interface NongyneStainRunPagination {
  total: number;
  items: NongyneStainRun[];
}
