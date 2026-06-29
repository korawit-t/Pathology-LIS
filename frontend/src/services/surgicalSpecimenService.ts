import api from "./httpClient";
import {
  SurgicalSpecimen,
  SurgicalSpecimenUpdatePayload,
} from "../types/surgical";

const SurgicalSpecimenService = {
  /**
   * 1. ดึงชิ้นเนื้อทั้งหมดของ Case หนึ่งๆ
   */
  getSpecimensByCase: async (
    caseId: number | string,
  ): Promise<SurgicalSpecimen[]> => {
    const res = await api.get<SurgicalSpecimen[]>("/surgical-specimens", {
      params: { case_id: caseId },
    });
    return res.data;
  },

  /**
   * สร้างชิ้นเนื้อใหม่
   */
  createSpecimen: async (payload: {
    surgical_case_id: number;
    specimen_name: string;
  }): Promise<SurgicalSpecimen> => {
    const res = await api.post<SurgicalSpecimen>(
      "/surgical-specimens",
      payload,
    );
    return res.data;
  },

  /**
   * 2. อัปเดตคำบรรยายลักษณะทางพยาธิวิทยา (Gross Description)
   */
  updateGrossDescription: async (
    id: number | string,
    payload: SurgicalSpecimenUpdatePayload,
  ): Promise<SurgicalSpecimen> => {
    const res = await api.patch<SurgicalSpecimen>(
      `/surgical-specimens/${id}/gross`,
      payload,
    );
    return res.data;
  },

  /**
   * 2b. บันทึกร่างคำบรรยาย Gross (ไม่เปลี่ยนสถานะเคส)
   */
  saveGrossDescriptionDraft: async (
    id: number | string,
    payload: SurgicalSpecimenUpdatePayload,
  ): Promise<SurgicalSpecimen> => {
    const res = await api.patch<SurgicalSpecimen>(
      `/surgical-specimens/${id}/gross/draft`,
      payload,
    );
    return res.data;
  },

  /**
   * 3. อัปเดตข้อมูลทั่วไปของชิ้นเนื้อ
   */
  updateSpecimen: async (
    id: number | string,
    payload: Partial<SurgicalSpecimen>,
  ): Promise<SurgicalSpecimen> => {
    const res = await api.patch<SurgicalSpecimen>(
      `/surgical-specimens/${id}`,
      payload,
    );
    return res.data;
  },

  /**
   * 4. ลบชิ้นเนื้อ
   */
  deleteSpecimen: async (id: number | string): Promise<void> => {
    await api.delete(`/surgical-specimens/${id}`);
  },

  /**
   * 5. Pathologist flags a specimen as needing additional sections
   */
  requestAdditionalSections: async (
    id: number,
    note: string,
  ): Promise<SurgicalSpecimen> => {
    const res = await api.patch<SurgicalSpecimen>(
      `/surgical-specimens/${id}/additional-sections`,
      { needs: true, note },
    );
    return res.data;
  },

  /**
   * 6. Clear additional sections flag (done or cancelled)
   */
  clearAdditionalSections: async (id: number): Promise<SurgicalSpecimen> => {
    const res = await api.patch<SurgicalSpecimen>(
      `/surgical-specimens/${id}/additional-sections`,
      { needs: false },
    );
    return res.data;
  },

  /**
   * 7. Grossing worklist — list specimens flagged for additional sections
   */
  getSpecimensNeedingAdditionalSections: async (): Promise<SurgicalSpecimen[]> => {
    const res = await api.get<SurgicalSpecimen[]>(
      "/surgical-specimens/additional-sections",
    );
    return res.data;
  },
};

export default SurgicalSpecimenService;
