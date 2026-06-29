import dayjs from "dayjs";
import type { SystemSetting } from "../types/system";

export const calculateTATProgress = (
  registerAt: string,
  labType: string,
  settings: SystemSetting | null,
  isExpress: boolean = false,
  holidays: string[] = [],
) => {
  if (!registerAt || !settings || !labType) return null;

  const typeKey = labType.toLowerCase();
  const suffix = isExpress ? "_express_tat_days" : "_tat_days";
  const settingKey = `${typeKey}${suffix}`;
  const slaDays = (settings as unknown as Record<string, number | undefined>)[settingKey];

  if (slaDays === undefined || slaDays === null || slaDays === 0) {
    return null;
  }

  const startTime = dayjs(registerAt);
  const now = dayjs();

  // --- 1. คำนวณวันครบกำหนด (Due Date) โดยหักวันหยุด ---
  let dueDate = startTime;
  let addedDays = 0;

  // วนลูปเพิ่มวันจนกว่าจะครบกำหนดวันทำการตาม SLA
  while (addedDays < slaDays) {
    dueDate = dueDate.add(1, "day");
    const isWeekend = dueDate.day() === 0 || dueDate.day() === 6;
    const isHoliday = holidays.includes(dueDate.format("YYYY-MM-DD"));

    if (!isWeekend && !isHoliday) {
      addedDays++;
    }
  }

  // --- 2. คำนวณ Working Hours ที่ใช้ไปจนถึงปัจจุบัน ---
  let workingHours = 0;
  let tempTime = startTime;
  while (tempTime.isBefore(now)) {
    const isWeekend = tempTime.day() === 0 || tempTime.day() === 6;
    const isHoliday = holidays.includes(tempTime.format("YYYY-MM-DD"));
    if (!isWeekend && !isHoliday) workingHours++;
    tempTime = tempTime.add(1, "hour");
  }

  const slaHours = slaDays * 24;
  const percent = Math.min(Math.round((workingHours / slaHours) * 100), 100);

  const workingDays = Math.floor(workingHours / 24);
  const displayTime =
    workingHours < 24
      ? `${workingHours} hr${workingHours > 1 ? "s" : ""}`
      : `${workingDays} day${workingDays > 1 ? "s" : ""}`;

  let statusColor = "#52c41a";
  if (percent >= 100) statusColor = "#f5222d";
  else if (percent > 75) statusColor = "#faad14";

  return {
    percent,
    slaDays,
    statusColor,
    displayTime,
    isOverdue: workingHours >= slaHours,
    dueDate: dueDate.toISOString(), // 🚩 เพิ่ม dueDate กลับไปเป็น ISO String
  };
};
