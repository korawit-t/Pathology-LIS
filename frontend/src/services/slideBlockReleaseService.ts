import api from "./httpClient";

export interface SlideBlockReleaseCreatePayload {
  case_id: number;
  case_type: "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";
  release_type: "SLIDE" | "BLOCK" | "BOTH";
  recipient_name: string;
  requester_name?: string;
  reference_doc_no?: string;
  remark?: string;
  pathologist_id?: number;
  pathologist_name?: string;
}

const SlideBlockReleaseService = {
  verifyAccession: async (accessionNo: string) => {
    const res = await api.get(`/slide-block-releases/verify/${accessionNo}`);
    return res.data;
  },

  create: async (payload: SlideBlockReleaseCreatePayload) => {
    const res = await api.post("/slide-block-releases", payload);
    return res.data;
  },

  getAll: async (params: {
    skip?: number;
    limit?: number;
    case_type?: string;
    release_type?: string;
  } = {}) => {
    const res = await api.get("/slide-block-releases", { params });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/slide-block-releases/${id}`);
  },

  openFormPdf: async (id: number, releaseNo: string): Promise<void> => {
    const res = await api.get(`/slide-block-releases/${id}/form-pdf`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
    URL.revokeObjectURL(url);
  },
};

export default SlideBlockReleaseService;
