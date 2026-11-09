import api from "./httpClient";

export interface HisPatientResult {
  an: string;
  vn: string;
  hn: string;
  gender: string;
  gender_code: number | null;
  nationality: string;
  pname: string;
  fname: string;
  lname: string;
  birthday: string;
  cid: string;
  lab_order_number: string;
  doctor: string;
  order_date: string;
  department: string;
  form_name: string;
  ward: string;
  pttype: string;
  age: number | null;
}

/** Optional HIS capabilities — mirrors HisFeature in backend/app/his_adapters. */
export type HisFeature = "patient_search" | "appointments" | "visits_today" | "admission";

export interface HisInfo {
  /** A HIS connection is set up and usable. */
  configured: boolean;
  /** The backend's HIS_TYPE key, e.g. "hosxp", "custom". */
  his_type: string;
  /** Name to show users — the program the hospital runs (HOSxP, SSB, …). */
  display_name: string;
  /** What the connected HIS can do right now; all false when not configured. */
  features: Record<HisFeature, boolean>;
}

export interface HisSearchParams {
  hn?: string;
  date_start?: string;
  date_end?: string;
  case_type?: string; // 'surgical' | 'gyne' | 'nongyne'
}

const HisService = {
  /**
   * ค้นหาข้อมูลผู้ป่วยจากระบบ HIS ที่เชื่อมต่ออยู่ (HOSxP หรือระบบอื่นตาม HIS_TYPE)
   */
  searchPatients: async (params: HisSearchParams): Promise<HisPatientResult[]> => {
    const res = await api.get<HisPatientResult[]>("/his/patients", { params });
    return res.data;
  },

  getAppointments: async (hn: string): Promise<{
    oapp_id: number;
    hn: string;
    nextdate: string | null;
    nexttime: string | null;
    note: string | null;
    doctor: string | null;
    clinic: string | null;
    depcode: string | null;
  }[]> => {
    const res = await api.get("/his/appointments", { params: { hn } });
    return res.data;
  },

  /**
   * HNs with an actual visit recorded today (vn_stat), not merely a
   * scheduled appointment — one batched call, no per-HN loop needed.
   */
  getVisitsToday: async (): Promise<{ hns: string[] }> => {
    const res = await api.get("/his/visits-today");
    return res.data;
  },

  /**
   * What HIS, if any, this deployment is wired to, its display name, and
   * which features it offers. Answers from the backend's own configuration
   * without touching the HIS, so it is safe to call on a site that has none —
   * the other calls here 503 in that case (501 for a feature the HIS lacks).
   * Use the cached useHisInfo() hook rather than calling this directly.
   */
  getInfo: async (): Promise<HisInfo> => {
    const res = await api.get<HisInfo>("/his/info");
    return res.data;
  },
};

export default HisService;
