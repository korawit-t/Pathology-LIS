import api from "./httpClient";

export interface PerformedByInfo {
  id: number;
  full_name?: string;
  username: string;
}

export interface HEControlSlide {
  id: number;
  control_no: string;
  control_date: string;
  performed_by_id: number;
  performed_by?: PerformedByInfo;
  performed_at: string;
  created_at?: string;
}

export interface HEControlSlideListParams {
  skip?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
}

const HEControlSlideService = {
  getAll: async (
    params: HEControlSlideListParams = {},
  ): Promise<HEControlSlide[]> => {
    const res = await api.get<HEControlSlide[]>("/he-control-slides", {
      params,
    });
    return res.data;
  },

  create: async (): Promise<HEControlSlide> => {
    const res = await api.post<HEControlSlide>("/he-control-slides");
    return res.data;
  },

  printSticker: async (id: number): Promise<Blob> => {
    const res = await api.get(`/he-control-slides/${id}/print-sticker`, {
      responseType: "blob",
    });
    return res.data;
  },
};

export default HEControlSlideService;
