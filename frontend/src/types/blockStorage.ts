export interface BlockStorageBatchPayload {
  user_id: number;
  items: { block_id: number; storage_location?: string; remark?: string }[];
  remark?: string;
}

export interface BlockStorageDetailResponse {
  id: number;
  run_id: number;
  block_id?: number;
  storage_location?: string;
  remark?: string;
  stored_at?: string;
  block?: { id?: number; accession_no?: string; block_code?: string };
  run?: { id: number; run_no: string };
  discard_status?: boolean;
  discard_at?: string;
  discard_by?: { id: number; full_name: string };
}

export interface BlockStorageRunResponse {
  id: number;
  run_no: string;
  started_at: string;
  finished_at?: string;
  user_id: number;
  operator?: { id: number; full_name: string };
  remark?: string;
  details: BlockStorageDetailResponse[];
  discard_status?: boolean;
  discard_at?: string;
  discard_by?: { id: number; full_name: string };
}

export interface PendingStorageBlockNode {
  key: string | number;
  id: number;
  code: string;
  isCase: boolean;
  is_decal?: boolean;
  children?: PendingStorageBlockNode[];
}

export interface ScannedStorageBlock {
  id: number;
  code: string;
  accession_no: string;
  storage_location?: string;
  scannedAt: string;
}
