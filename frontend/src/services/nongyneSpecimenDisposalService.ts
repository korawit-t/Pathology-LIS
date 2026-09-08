import api from "./httpClient";
import type {
  NongyneDisposalBatch,
  NongyneDisposalBatchCreatePayload,
  NongyneDisposalBatchStatus,
  NongyneDisposalBucket,
  NongyneDisposalCandidateList,
  NongyneDisposalCandidate,
  NongyneStorageBulkUpdatePayload,
} from "../types/nongyneSpecimenDisposal";

const BASE = "/nongyne-specimen-disposal-batches";

const NongyneSpecimenDisposalService = {
  create: async (
    payload: NongyneDisposalBatchCreatePayload
  ): Promise<NongyneDisposalBatch> => {
    const res = await api.post(BASE, payload);
    return res.data;
  },

  getAll: async (
    params: {
      skip?: number;
      limit?: number;
      status?: NongyneDisposalBatchStatus;
    } = {}
  ): Promise<{ items: NongyneDisposalBatch[]; total: number }> => {
    const res = await api.get(BASE, { params });
    return res.data;
  },

  getById: async (id: number): Promise<NongyneDisposalBatch> => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data;
  },

  getOpenCount: async (): Promise<number> => {
    const res = await api.get(`${BASE}/open-count`);
    return res.data.count;
  },

  confirm: async (
    id: number,
    payload: { disposal_method?: string; remark?: string } = {}
  ): Promise<NongyneDisposalBatch> => {
    const res = await api.post(`${BASE}/${id}/confirm`, payload);
    return res.data;
  },

  cancel: async (id: number, reason?: string): Promise<NongyneDisposalBatch> => {
    const res = await api.post(`${BASE}/${id}/cancel`, { reason });
    return res.data;
  },

  // เคสที่รอทิ้ง แยกตามถัง due / not_due / blocked — retention_days ติดมากับ
  // response เพื่อให้หน้าจอโชว์เกณฑ์ที่ backend ใช้จริง ไม่ต้อง hardcode
  getCandidates: async (
    params: {
      bucket?: NongyneDisposalBucket;
      skip?: number;
      limit?: number;
      search?: string;
    } = {}
  ): Promise<NongyneDisposalCandidateList> => {
    const res = await api.get("/nongyne-cytology/disposal/candidates", { params });
    return res.data;
  },

  getDisposed: async (
    params: { skip?: number; limit?: number; search?: string } = {}
  ): Promise<NongyneDisposalCandidateList> => {
    const res = await api.get("/nongyne-cytology/disposal/disposed", { params });
    return res.data;
  },

  // ---- Specimen storage ----
  // เคสที่ยังไม่ระบุที่เก็บ ไม่ต้อง paginate — คิวนี้ควรถูกเคลียร์ให้หมดอยู่แล้ว
  getUnstored: async (search?: string): Promise<NongyneDisposalCandidate[]> => {
    const res = await api.get("/nongyne-cytology/storage/unstored", {
      params: { search: search || undefined },
    });
    return res.data;
  },

  getStored: async (
    params: { skip?: number; limit?: number; search?: string } = {}
  ): Promise<NongyneDisposalCandidateList> => {
    const res = await api.get("/nongyne-cytology/storage/stored", { params });
    return res.data;
  },

  bulkUpdateStorage: async (
    payload: NongyneStorageBulkUpdatePayload
  ): Promise<NongyneDisposalCandidate[]> => {
    const res = await api.post("/nongyne-cytology/storage/bulk-update", payload);
    return res.data;
  },

  // เปิดใบใน tab ใหม่ให้สั่งพิมพ์ — pattern เดียวกับ SpecimenDisposalService
  openChecklistPdf: async (id: number): Promise<void> => {
    const res = await api.get(`${BASE}/${id}/checklist-pdf`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(
      new Blob([res.data], { type: "application/pdf" })
    );
    window.open(url, "_blank");
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  },
};

export default NongyneSpecimenDisposalService;
