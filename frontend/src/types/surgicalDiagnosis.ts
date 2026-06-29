export interface SurgicalDiagnosis {
  id: number;
  case_id: number;
  previous_version_id?: number | null;

  // 🚩 แก้: Integrated mode จะไม่มี specimen_id รายชิ้น
  surgical_specimen_id: number | null;

  diagnosis_order: number;
  entry_type: "Original" | "Addendum" | "Revised";
  diagnosis_level: "SPECIMEN" | "CASE"; // 🚩 เพิ่ม: เพื่อแยกโหมดชัดเจน

  microscopic_description?: string | null;
  diagnosis: string;
  comment?: string | null;
  revision_reason?: string | null;

  linked_specimen_ids?: number[] | null; // 🚩 เพิ่ม: สำหรับ CASE level

  is_malignancy: boolean;
  is_critical: boolean;

  status: "draft" | "signed" | "cancelled";
  diagnosis_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDiagnosisPayload {
  case_id: number;
  diagnosis_level: "SPECIMEN" | "CASE";
  surgical_specimen_id?: number | null; // NULL ถ้าเป็นระดับ CASE
  linked_specimen_ids?: number[] | null; // มีค่าถ้าเป็นระดับ CASE
  diagnosis: string;
  microscopic_description?: string;
  comment?: string;
  status: "signed" | "draft" | "cancelled";
  entry_type?: "Original" | "Addendum" | "Revised";
}

export interface UpdateDiagnosisPayload extends Partial<SurgicalDiagnosis> {
  status?: "draft" | "signed" | "cancelled";
  diagnosis?: string;
  microscopic_description?: string;
  comment?: string;
  revision_reason?: string;
}

export type SurgicalDiagnosisCreate = Omit<
  SurgicalDiagnosis,
  "id" | "created_at" | "updated_at" | "diagnosis_order"
> & {
  // 🚩 ระบุ pathologists ที่เป็น Array สำหรับส่งไปบันทึก
  pathologists?: { user_id: number; role: string }[];
};
