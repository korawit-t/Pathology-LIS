// เกณฑ์ว่าเคสหนึ่งพร้อมขึ้นใบตรวจสอบก่อนทำลายหรือยัง
//
// ตัวบังคับจริงอยู่ที่ backend (app/crud/specimen_disposal_batch.py create_batch)
// ไฟล์นี้แค่สะท้อนเงื่อนไขเดียวกันขึ้นจอ เพื่อไม่ให้ผู้ใช้เลือกเคสที่จะโดนปฏิเสธ
// อยู่แล้ว — เงื่อนไขและลำดับต้องตรงกับฝั่ง server เสมอ
import dayjs from "dayjs";
import type { SurgicalCase } from "../../types/surgical";

/** จำนวนวันนับจากวันรายงานผล — null ถ้ายังไม่มีวันรายงานผล
 *
 * ใช้ report_at อย่างเดียวเหมือน backend ไม่ fallback ไป published_at
 * ไม่งั้นตัวเลขบนจอจะไม่ใช่ตัวเดียวกับที่ใช้บล็อก
 */
export const daysSinceReport = (c: SurgicalCase): number | null => {
  if (!c.report_at) return null;
  return dayjs().startOf("day").diff(dayjs(c.report_at).startOf("day"), "day");
};

/** เหตุผลที่ยังทำลายไม่ได้ — null ถ้าพร้อมทำลาย */
export const disposalBlockReason = (
  c: SurgicalCase,
  retentionDays: number
): string | null => {
  const days = daysSinceReport(c);
  if (days === null) return "ยังไม่ได้รายงานผล";
  if (c.is_pending) return "ยังค้าง Pending";
  if (days < retentionDays) return `ยังไม่ครบ ${retentionDays} วัน (${days} วัน)`;
  return null;
};
