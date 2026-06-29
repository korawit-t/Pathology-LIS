import api from "./httpClient";
import {
  TissueProcessingRun,
  CreateTissueProcessingRunPayload,
  UpdateTissueProcessingRunStatusPayload,
  PendingDataNode,
} from "../types/tissueProcessing";

export interface ProcessingMachine { id: number; name: string; is_active?: boolean; }
export interface ProcessingProgram { id: number; name: string; duration_hours?: number; is_active?: boolean; }

const TissueProcessingService = {
  createRun: async (
    payload: CreateTissueProcessingRunPayload,
  ): Promise<TissueProcessingRun> => {
    const res = await api.post<TissueProcessingRun>(
      "/tissue-processing",
      payload,
    );
    return res.data;
  },

  getPendingBlocks: async (): Promise<PendingDataNode[]> => {
    const res = await api.get<PendingDataNode[]>(
      "/tissue-processing/pending-blocks",
    );
    return res.data;
  },

  getRuns: async (
    params: Partial<{ status: string; skip: number; limit: number }> = {},
  ): Promise<TissueProcessingRun[]> => {
    const res = await api.get<TissueProcessingRun[]>("/tissue-processing", {
      params,
    });
    return res.data;
  },

  getRunById: async (id: number): Promise<TissueProcessingRun> => {
    const res = await api.get<TissueProcessingRun>(`/tissue-processing/${id}`);
    return res.data;
  },

  updateRun: async (id: number, payload: { processor_name?: string; program_name?: string; start_at?: string; remark?: string; block_ids?: number[] }): Promise<TissueProcessingRun> => {
    const res = await api.patch<TissueProcessingRun>(`/tissue-processing/${id}`, payload);
    return res.data;
  },

  updateRunStatus: async (
    id: number,
    payload: UpdateTissueProcessingRunStatusPayload,
  ): Promise<TissueProcessingRun> => {
    const res = await api.patch<TissueProcessingRun>(
      `/tissue-processing/${id}/status`,
      payload,
    );
    return res.data;
  },

  getActiveRuns: async (): Promise<TissueProcessingRun[]> => {
    const res = await api.get<TissueProcessingRun[]>("/tissue-processing", {
      params: { status: "processing" },
    });
    return res.data;
  },

  getMachines: async (): Promise<ProcessingMachine[]> => {
    const res = await api.get<ProcessingMachine[]>("/tissue-processing/machines");
    return res.data;
  },

  getPrograms: async (): Promise<ProcessingProgram[]> => {
    const res = await api.get<ProcessingProgram[]>("/tissue-processing/programs");
    return res.data;
  },

  createMachine: async (payload: {name: string, is_active?: boolean}) => {
    const res = await api.post("/tissue-processing/machines", payload);
    return res.data;
  },

  updateMachine: async (id: number, payload: {name?: string, is_active?: boolean}) => {
    const res = await api.patch(`/tissue-processing/machines/${id}`, payload);
    return res.data;
  },

  deleteMachine: async (id: number) => {
    await api.delete(`/tissue-processing/machines/${id}`);
  },

  createProgram: async (payload: {name: string, duration_hours?: number, is_active?: boolean}) => {
    const res = await api.post("/tissue-processing/programs", payload);
    return res.data;
  },

  updateProgram: async (id: number, payload: {name?: string, duration_hours?: number, is_active?: boolean}) => {
    const res = await api.patch(`/tissue-processing/programs/${id}`, payload);
    return res.data;
  },

  deleteProgram: async (id: number) => {
    await api.delete(`/tissue-processing/programs/${id}`);
  },
};

export default TissueProcessingService;
