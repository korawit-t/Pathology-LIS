/**
 * app/schemas/embedding.py -> TypeScript Interfaces
 */

// --- Backend Schema Interfaces ---

export interface EmbeddingBlockLite {
  accession_no?: string | null;
  specimen_label?: string | null;
  block_no?: number | null;
  block_code?: string | null;
  is_decal?: boolean | null;
}

export interface EmbeddingDetailResponse {
  id: number;
  run_id: number;
  block_id: number;
  embedded_at: string; // ISO DateTime string
  block?: EmbeddingBlockLite | null;
}

export interface EmbeddingRunResponse {
  id: number;
  run_no: string;
  started_at: string; // ISO DateTime string
  user_id: number;
  user_full_name?: string | null;
  station_id?: string | null;
  details?: EmbeddingDetailResponse[]; // ปรับเป็น Optional เผื่อกรณี List หน้าแรกไม่ส่งรายละเอียดมา
}

export interface EmbeddingRunCreate {
  user_id: number;
  station_id?: string;
}

export interface ScanBlockRequest {
  run_id: number;
  block_no: string; // บาร์โค้ดที่สแกนมา (เช่น A1 หรือ Barcode ID)
}

// --- Interfaces สำหรับ Pending Data (Modal Tree) ---

export interface PendingBlock {
  key: number; // id ของ block
  id: number;
  code: string; // block_code เช่น "A1"
  isCase: boolean; // false
  is_decal: boolean;
  accession_no: string;
}

export interface PendingTree {
  key: string; // case-{id}
  id: number;
  code: string; // accession_no เช่น "S26-00001"
  isCase: boolean; // true
  children: PendingBlock[]; // สำหรับ Ant Design Table Tree
}

// --- Component Props Interfaces ---

export interface EmbeddingRunListProps {
  onCreateClick: () => void;
  onSelectRun: (id: number) => void;
  refreshKey?: number;
}

export interface CreateEmbeddingRunProps {
  onBack: () => void;
}

// --- Local UI Types ---

export type EmbeddingViewMode = "list" | "create" | "details";
