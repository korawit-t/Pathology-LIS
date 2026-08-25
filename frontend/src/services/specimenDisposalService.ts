import api from "./httpClient";
import type {
  DisposalBatch,
  DisposalBatchCreatePayload,
  DisposalBatchStatus,
} from "../types/specimenDisposal";

const SpecimenDisposalService = {
  create: async (payload: DisposalBatchCreatePayload): Promise<DisposalBatch> => {
    const res = await api.post("/specimen-disposal-batches", payload);
    return res.data;
  },

  getAll: async (
    params: { skip?: number; limit?: number; status?: DisposalBatchStatus } = {}
  ): Promise<{ items: DisposalBatch[]; total: number }> => {
    const res = await api.get("/specimen-disposal-batches", { params });
    return res.data;
  },

  getById: async (id: number): Promise<DisposalBatch> => {
    const res = await api.get(`/specimen-disposal-batches/${id}`);
    return res.data;
  },

  getOpenCount: async (): Promise<number> => {
    const res = await api.get("/specimen-disposal-batches/open-count");
    return res.data.count;
  },

  confirm: async (
    id: number,
    payload: { disposal_method?: string; remark?: string } = {}
  ): Promise<DisposalBatch> => {
    const res = await api.post(`/specimen-disposal-batches/${id}/confirm`, payload);
    return res.data;
  },

  cancel: async (id: number, reason?: string): Promise<DisposalBatch> => {
    const res = await api.post(`/specimen-disposal-batches/${id}/cancel`, { reason });
    return res.data;
  },

  // เปิดใบใน tab ใหม่ให้สั่งพิมพ์ — pattern เดียวกับ SlideBlockReleaseService.openFormPdf
  openChecklistPdf: async (id: number): Promise<void> => {
    const res = await api.get(`/specimen-disposal-batches/${id}/checklist-pdf`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(
      new Blob([res.data], { type: "application/pdf" })
    );
    window.open(url, "_blank");
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  },
};

export default SpecimenDisposalService;
