import { describe, expect, it } from "vitest";
import type { LegacyImportMapping, LegacyTargetField } from "../../../services/legacyImportService";
import { apiErrorText, buildMapping, cleanFields, initialFields, missingRequired, sampleValues } from "./mappingUtils";

const targets: LegacyTargetField[] = [
  { key: "source_ref", label: "รหัสอ้างอิง", kind: "text", required: true, group: "key" },
  { key: "accession_no", label: "Accession No.", kind: "text", required: true, group: "key" },
  { key: "patient_full_name", label: "ชื่อ-นามสกุล", kind: "full_name", required: false, group: "patient" },
  { key: "patient_name", label: "ชื่อ", kind: "text", required: false, group: "patient" },
  { key: "reported_at", label: "วันที่ออกรายงาน", kind: "date", required: true, group: "meta" },
];

const profile = (fields: LegacyImportMapping["fields"]): LegacyImportMapping => ({
  report_type: "surgical",
  source_system: "old",
  header_row: 1,
  fields,
  hospital_values: {},
  on_duplicate: "skip",
});

describe("initialFields", () => {
  it("uses the backend's suggestions when no profile is chosen", () => {
    const { fields, missingColumns } = initialFields(["No", "Name"], { accession_no: "No", source_ref: "No" });
    expect(fields).toEqual({ accession_no: { column: "No" }, source_ref: { column: "No" } });
    expect(missingColumns).toEqual([]);
  });

  it("keeps a profile's columns this file has and lists the ones it lacks", () => {
    const { fields, missingColumns } = initialFields(
      ["No", "Date"],
      { accession_no: "No" },
      profile({
        accession_no: { column: "No" },
        reported_at: { column: "Report Date" },
        pathologist_name: { value: "นพ. ก" },
      }),
    );
    expect(fields).toEqual({ accession_no: { column: "No" }, pathologist_name: { value: "นพ. ก" } });
    expect(missingColumns).toEqual(["Report Date"]);
  });
});

describe("missingRequired", () => {
  it("lists required fields and the patient-name rule", () => {
    expect(missingRequired(targets, {})).toEqual([
      "รหัสอ้างอิง",
      "Accession No.",
      "วันที่ออกรายงาน",
      "ชื่อผู้ป่วย (ชื่อ หรือ ชื่อ-นามสกุล)",
    ]);
  });

  it("accepts either name field and a fixed value", () => {
    expect(
      missingRequired(targets, {
        source_ref: { column: "No" },
        accession_no: { column: "No" },
        patient_full_name: { column: "Name" },
        reported_at: { value: "2024-01-01" },
      }),
    ).toEqual([]);
  });

  it("does not count a fixed value left blank", () => {
    expect(missingRequired(targets, { reported_at: { value: "  " } })).toContain("วันที่ออกรายงาน");
  });
});

describe("cleanFields / buildMapping", () => {
  it("drops unset fields and trims the source system", () => {
    expect(cleanFields({ a: { column: "A" }, b: { value: "" }, c: { value: "x" } })).toEqual({
      a: { column: "A" },
      c: { value: "x" },
    });
    const m = buildMapping({
      reportType: "gyne",
      sourceSystem: "  old  ",
      sheet: "",
      headerRow: 2,
      fields: { a: { column: "A" } },
      hospitalValues: { H1: 3 },
      defaultHospitalId: undefined,
      onDuplicate: "update",
    });
    expect(m).toEqual({
      report_type: "gyne",
      source_system: "old",
      sheet: null,
      header_row: 2,
      fields: { a: { column: "A" } },
      hospital_values: { H1: 3 },
      default_hospital_id: null,
      on_duplicate: "update",
    });
  });
});

describe("sampleValues", () => {
  it("returns the first non-empty values of a column", () => {
    const inspect = {
      sheets: [],
      headers: ["No", "Name"],
      sample_rows: [["1", null], ["2", "A"], ["3", "B"], ["4", "C"], ["5", "D"]],
      total_rows: 5,
      suggested_fields: {},
    };
    expect(sampleValues(inspect, "Name")).toEqual(["A", "B", "C"]);
    expect(sampleValues(inspect, "Missing")).toEqual([]);
    expect(sampleValues(null, "Name")).toEqual([]);
  });
});

describe("apiErrorText", () => {
  it("reads a string detail, a validation list, or falls back", () => {
    expect(apiErrorText({ response: { data: { detail: "ไฟล์ว่าง" } } }, "x")).toBe("ไฟล์ว่าง");
    expect(apiErrorText({ response: { data: { detail: [{ msg: "a" }, { msg: "b" }] } } }, "x")).toBe("a; b");
    expect(apiErrorText(new Error("boom"), "fallback")).toBe("fallback");
  });
});
