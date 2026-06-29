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

export interface HisSearchParams {
  hn?: string;
  date_start?: string;
  date_end?: string;
  case_type?: string; // 'surgical' | 'gyne' | 'nongyne'
}

const HisService = {
  /**
   * ค้นหาข้อมูลผู้ป่วยจากระบบ HIS (HOSxP)
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
};

export default HisService;
