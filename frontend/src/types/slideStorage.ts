export type StainCategory = "HE" | "Special" | "IHC" | "Gyne" | "NonGyne";

export interface SlideStorageBatchPayload {
  user_id: number;
  stain_category?: StainCategory;
  items: { stain_id: number; storage_location?: string; remark?: string }[];
  remark?: string;
}

export interface SlideStorageRunResponse {
  id: number;
  run_no: string;
  started_at: string;
  finished_at?: string;
  user_id: number;
  operator?: { id: number; full_name: string };
  stain_category?: StainCategory;
  remark?: string;
  details: SlideStorageDetailResponse[];
  discard_status?: boolean;
  discard_at?: string;
  discard_by?: { id: number; full_name: string };
}

export interface SlideStorageDetailResponse {
  id: number;
  run_id: number;
  stain_id?: number;
  gyne_stain_id?: number;
  nongyne_stain_id?: number;
  storage_location?: string;
  remark?: string;
  stored_at: string;
  stain?: {
    slide_no?: string | number;
    test?: { name?: string };
    block?: { block_code?: string; specimen?: { case?: { accession_no?: string } } };
  };
  gyne_stain?: {
    slide_no?: string | number;
    test?: { name?: string };
    case?: { accession_no?: string };
  };
  nongyne_stain?: {
    slide_no?: string | number;
    test?: { name?: string };
    case?: { accession_no?: string };
  };
  run?: { id: number; run_no: string; stain_category?: string };
  discard_status?: boolean;
  discard_at?: string;
  discard_by?: { id: number; full_name: string };
}

export interface PendingStorageSlideNode {
  key: string | number;
  id: number;
  /** Human-readable label, e.g. `S26-00123 A1 (H&E #1)`. Not what a scanner
   * reads — the sticker's QR holds `barcodes` instead. */
  code: string;
  /** Every QR payload a sticker for this slide could carry (the backend keeps
   * the padded and unpadded block code, since filed slides outlive a sticker
   * layout change). Absent on case nodes. */
  barcodes?: string[];
  isCase: boolean;
  children?: PendingStorageSlideNode[];
}

export interface ScannedStorageSlide {
  id: number;
  code: string;
  accession_no: string;
  storage_location?: string;
  scannedAt: string;
}
