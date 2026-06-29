import api from "./httpClient";
import {
  SlideStorageRunResponse,
  SlideStorageBatchPayload,
  SlideStorageDetailResponse,
} from "../types/slideStorage";

const SlideStorageService = {
  getPendingSlidesTree: async (stain_category?: string): Promise<any> => {
    const res = await api.get("/slide-storage/pending-tree", {
      params: stain_category ? { stain_category } : {},
    });
    return res.data;
  },

  createStorageBatch: async (
    payload: SlideStorageBatchPayload,
  ): Promise<SlideStorageRunResponse> => {
    const res = await api.post<SlideStorageRunResponse>(
      "/slide-storage/batch",
      payload,
    );
    return res.data;
  },
  
  getAllRuns: async (
    params: Record<string, any> = {},
    stain_category?: string,
  ): Promise<SlideStorageRunResponse[]> => {
    const res = await api.get<SlideStorageRunResponse[]>("/slide-storage/runs", {
      params: { ...params, ...(stain_category ? { stain_category } : {}) },
    });
    return res.data;
  },

  getRunDetails: async (runId: number): Promise<SlideStorageRunResponse> => {
    const res = await api.get<SlideStorageRunResponse>(`/slide-storage/runs/${runId}`);
    return res.data;
  },

  searchByAccession: async (
    accessionNo: string,
    stainCategory?: string,
  ): Promise<SlideStorageRunResponse[]> => {
    const res = await api.get<SlideStorageRunResponse[]>("/slide-storage/search", {
      params: {
        accession_no: accessionNo,
        ...(stainCategory ? { stain_category: stainCategory } : {}),
      },
    });
    return res.data;
  },

  getStoredSlides: async (
    skip = 0,
    limit = 50,
    search = "",
    stainCategory?: string,
  ): Promise<{ items: SlideStorageDetailResponse[]; total: number }> => {
    const res = await api.get("/slide-storage/stored-slides", {
      params: { skip, limit, search, ...(stainCategory ? { stain_category: stainCategory } : {}) },
    });
    return res.data;
  },

  getDisposedSlides: async (
    skip = 0,
    limit = 50,
    search = "",
    stainCategory?: string,
  ): Promise<{ items: SlideStorageDetailResponse[]; total: number }> => {
    const res = await api.get("/slide-storage/disposed-slides", {
      params: { skip, limit, search, ...(stainCategory ? { stain_category: stainCategory } : {}) },
    });
    return res.data;
  },

  disposeSlides: async (detailIds: number[]): Promise<SlideStorageDetailResponse[]> => {
    const res = await api.post<SlideStorageDetailResponse[]>("/slide-storage/dispose-slides", {
      detail_ids: detailIds,
    });
    return res.data;
  },
};

export default SlideStorageService;
