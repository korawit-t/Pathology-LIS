import api from "./httpClient";
import logger from "../utils/logger";

export interface Holiday {
  id: number;
  holiday_date: string; // YYYY-MM-DD
  name: string;
}

export interface GoogleCalendarConfig {
  api_key: string;
  calendar_id: string;
}

const HolidayService = {
  /**
   * 🔓 ดึงรายการวันหยุดทั้งหมด
   */
  getHolidays: async (): Promise<Holiday[]> => {
    const res = await api.get<Holiday[]>("/org/holidays");
    return res.data;
  },

  /**
   * 🔒 เพิ่มวันหยุดใหม่
   */
  createHoliday: async (payload: {
    holiday_date: string;
    name: string;
  }): Promise<Holiday> => {
    const res = await api.post<Holiday>("/org/holidays", payload);
    return res.data;
  },

  /**
   * 🔒 ลบวันหยุด
   */
  deleteHoliday: async (id: number): Promise<void> => {
    await api.delete(`/org/holidays/${id}`);
  },

  getGoogleCalendarConfig: async (): Promise<GoogleCalendarConfig> => {
    const res = await api.get<GoogleCalendarConfig>("/org/config/google-calendar");
    return res.data;
  },

  saveGoogleCalendarConfig: async (config: GoogleCalendarConfig): Promise<void> => {
    await api.put("/org/config/google-calendar", config);
  },

  importFromGoogleCalendar: async (
    year: number,
    calendarId?: string,
  ): Promise<{ created: number; skipped: number; total_fetched: number }> => {
    const res = await api.post("/org/holidays/import-google-calendar", {
      year,
      calendar_id: calendarId,
    });
    return res.data;
  },

  /**
   * 💡 Helper สำหรับหน้า Worklist
   */
  getHolidayDateList: async (): Promise<string[]> => {
    try {
      const holidays = await HolidayService.getHolidays();
      return holidays.map((h) => h.holiday_date);
    } catch (error) {
      logger.error("Failed to fetch holiday dates", error);
      return [];
    }
  },
};

export default HolidayService;
