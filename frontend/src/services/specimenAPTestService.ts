// src/services/specimenAPTestService.ts
import api from "./httpClient";

// กำหนด Interface สำหรับ Payload และการจัดการข้อมูล
interface CreateSpecimenTestPayload {
  surgical_specimen_id: number;
  ap_test_id: number;
}

const SpecimenAPTestService = {
  /**
   * ✅ เพิ่มรายการตรวจ (เช่น สั่งย้อมสีพิเศษ) ให้กับ Specimen
   * @param payload { surgical_specimen_id, ap_test_id }
   */
  addTestToSpecimen: async (payload: CreateSpecimenTestPayload) => {
    const res = await api.post("/specimen-ap-tests", payload);
    return res.data;
  },

  /**
   * ✅ ดึงรายการตรวจทั้งหมดที่สั่งไว้สำหรับ Specimen นั้นๆ
   */
  getTestsBySpecimenId: async (specimenId: number) => {
    const res = await api.get(`/specimen-ap-tests/${specimenId}`);
    return res.data;
  },

  /**
   * ✅ ลบรายการตรวจออกจาก Specimen (ยกเลิกรายการย้อม)
   */
  deleteSpecimenTest: async (itemId: number): Promise<void> => {
    await api.delete(`/specimen-ap-tests/${itemId}`);
  },
};

export default SpecimenAPTestService;
