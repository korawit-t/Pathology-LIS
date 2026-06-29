import dayjs from "dayjs";
import { CASE_STATUS } from "../../../constants/lab.constants";
import type { SurgicalCase } from "../../../types/surgical";

/**
 * เตรียมค่าเริ่มต้นสำหรับ Form Gross Examination
 */
export const prepareGrossInitialValues = (
  record: SurgicalCase,
  currentUserId: number,
) => {
  if (!record) return {};

  const descriptions: Record<number, string> = {};
  if (record.specimens && Array.isArray(record.specimens)) {
    record.specimens.forEach((spec) => {
      descriptions[spec.id] = spec.gross_description || "";
    });
  }

  return {
    ...record,
    gross_descriptions: descriptions,

    gross_at:
      record.status === CASE_STATUS.REGISTERED
        ? dayjs()
        : record.gross_at
          ? dayjs(record.gross_at)
          : dayjs(),

    collect_at: record.collect_at ? dayjs(record.collect_at) : null,

    // 🌟 แก้ไขจุดนี้: ดึง ID จาก Object (Relationship) ที่ Backend ส่งมา
    gross_examiner_id:
      record.gross_examiner?.id || record.gross_examiner_id || currentUserId,
    gross_assistant_id:
      record.gross_assistant?.id || record.gross_assistant_id || null,
    pathologist_id: record.pathologist?.id || record.pathologist_id || null, // เพิ่มบรรทัดนี้ด้วย

    status:
      record.status === CASE_STATUS.REGISTERED
        ? CASE_STATUS.GROSSED
        : record.status,
  };
};
