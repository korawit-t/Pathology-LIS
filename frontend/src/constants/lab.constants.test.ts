import { describe, it, expect } from "vitest";
import {
  CASE_STATUS,
  STATUS_OPTIONS,
  STATUS_WITHOUT_OPTION,
} from "./lab.constants";

/**
 * STATUS_OPTIONS ไม่ได้เป็นแค่รายการใน dropdown — SurgicalTable, GrossListTable,
 * NongyneTable และ UnifiedAccession ใช้มันหา label กับสีของ tag สถานะด้วย
 * (`STATUS_OPTIONS.find(o => o.value === status)`) สถานะที่ตกหล่นจึงเรนเดอร์เป็น
 * tag ไม่มีสีพร้อมค่าดิบตัวเล็ก และหายไปจากตัวกรองของคอลัมน์
 *
 * นั่นคือสิ่งที่เกิดกับ "sectioned" มาตลอด — มันอยู่ใน CASE_STATUS แต่ไม่เคยถูก
 * ใส่ใน STATUS_OPTIONS เทสต์นี้กันไม่ให้เกิดซ้ำ
 */
describe("STATUS_OPTIONS", () => {
  const optionValues = STATUS_OPTIONS.map((o) => o.value as string);

  it("covers every status a case can actually reach", () => {
    const missing = Object.values(CASE_STATUS).filter(
      (v) => !optionValues.includes(v) && !STATUS_WITHOUT_OPTION.includes(v),
    );

    expect(missing).toEqual([]);
  });

  it("offers Sectioned with a label and a colour", () => {
    const sectioned = STATUS_OPTIONS.find(
      (o) => o.value === CASE_STATUS.SECTIONED,
    );

    expect(sectioned).toBeDefined();
    expect(sectioned?.label).toBe("Sectioned");
    expect(sectioned?.color).toBe("orange");
  });

  it("does not offer statuses nothing can produce", () => {
    for (const value of STATUS_WITHOUT_OPTION) {
      expect(optionValues).not.toContain(value);
    }
  });

  it("has no duplicate values", () => {
    expect(new Set(optionValues).size).toBe(optionValues.length);
  });

  it("gives every option a non-empty label", () => {
    for (const option of STATUS_OPTIONS) {
      expect(option.label.trim()).not.toBe("");
    }
  });
});
