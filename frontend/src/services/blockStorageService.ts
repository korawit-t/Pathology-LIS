import api from "./httpClient";
import {
  BlockStorageRunResponse,
  BlockStorageBatchPayload,
  BlockStorageDetailResponse,
} from "../types/blockStorage";

const BlockStorageService = {
  getPendingBlocksTree: async (): Promise<any> => {
    const res = await api.get("/block-storage/pending-tree");
    return res.data;
  },

  createStorageBatch: async (
    payload: BlockStorageBatchPayload,
  ): Promise<BlockStorageRunResponse> => {
    const res = await api.post<BlockStorageRunResponse>(
      "/block-storage/batch",
      payload,
    );
    return res.data;
  },
  
  getAllRuns: async (
    params: Record<string, any> = {},
  ): Promise<BlockStorageRunResponse[]> => {
    const res = await api.get<BlockStorageRunResponse[]>("/block-storage/runs", {
      params,
    });
    return res.data;
  },

  searchByAccession: async (
    accessionNo: string,
  ): Promise<BlockStorageRunResponse[]> => {
    const res = await api.get<BlockStorageRunResponse[]>("/block-storage/search", {
      params: { accession_no: accessionNo },
    });
    return res.data;
  },

  getStoredBlocks: async (
    skip = 0,
    limit = 50,
    search = "",
  ): Promise<{ items: BlockStorageDetailResponse[]; total: number }> => {
    const res = await api.get("/block-storage/stored-blocks", { params: { skip, limit, search } });
    return res.data;
  },

  getDisposedBlocks: async (
    skip = 0,
    limit = 50,
    search = "",
  ): Promise<{ items: BlockStorageDetailResponse[]; total: number }> => {
    const res = await api.get("/block-storage/disposed-blocks", { params: { skip, limit, search } });
    return res.data;
  },

  disposeBlocks: async (detailIds: number[]): Promise<BlockStorageDetailResponse[]> => {
    const res = await api.post<BlockStorageDetailResponse[]>("/block-storage/dispose-blocks", {
      detail_ids: detailIds,
    });
    return res.data;
  },
};

export default BlockStorageService;
