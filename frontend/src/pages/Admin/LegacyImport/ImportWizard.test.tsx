import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ImportWizard from "./ImportWizard";
import legacyImportService from "../../../services/legacyImportService";
import HospitalService from "../../../services/hospitalService";

vi.mock("../../../services/legacyImportService", () => ({
  default: {
    getFields: vi.fn(),
    getProfiles: vi.fn(),
    inspect: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  },
}));

vi.mock("../../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn() },
}));

const svc = vi.mocked(legacyImportService);
const hospitals = vi.mocked(HospitalService);

const surgicalFields = [
  { key: "source_ref", label: "รหัสอ้างอิงในระบบเดิม", kind: "text", required: true, group: "key" },
  { key: "accession_no", label: "Accession No.", kind: "text", required: true, group: "key" },
  { key: "patient_full_name", label: "ชื่อ-นามสกุล", kind: "full_name", required: false, group: "patient" },
  { key: "patient_name", label: "ชื่อ", kind: "text", required: false, group: "patient" },
  { key: "hospital", label: "โรงพยาบาลผู้ส่ง", kind: "hospital", required: false, group: "source" },
  { key: "reported_at", label: "วันที่ออกรายงาน", kind: "date", required: true, group: "meta" },
] as const;

const inspectResult = {
  file_name: "export.csv",
  sheets: [],
  sheet: null,
  headers: ["No", "Name", "Date", "Hosp"],
  sample_rows: [["S1", "นาย ก ข", "1/1/2567", "H07"]],
  total_rows: 3,
  suggested_fields: { accession_no: "No", source_ref: "No", patient_full_name: "Name", reported_at: "Date", hospital: "Hosp" },
};

const previewResult = {
  total_rows: 3,
  valid_rows: 2,
  error_rows: 1,
  warning_rows: 0,
  new_rows: 2,
  existing_rows: 0,
  issues: [{ row: 4, level: "error" as const, field: "patient_name", message: "ไม่มีชื่อผู้ป่วย" }],
  issues_truncated: false,
  sample: [
    {
      row: 2,
      existing: false,
      values: { accession_no: "S1", patient_title: "นาย", patient_name: "ก", patient_ln: "ข", hospital_name: "รพ.ตัวอย่าง", reported_at: "2024-01-01T00:00:00" },
    },
  ],
  hospital_values: [{ value: "H07", count: 2, hospital_id: 7, hospital_name: "รพ.ตัวอย่าง", matched_by: "code" as const }],
  same_file_batches: [],
};

const file = new File(["No,Name,Date,Hosp\n"], "export.csv", { type: "text/csv" });

async function uploadAndGoToMapping() {
  await screen.findByText("คลิกหรือลากไฟล์มาวางที่นี่");
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("export.csv");
  fireEvent.click(screen.getByText("ถัดไป").closest("button")!);
  await screen.findByTestId("source-system");
}

describe("ImportWizard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hospitals.getHospitals.mockResolvedValue([{ id: 7, name: "รพ.ตัวอย่าง", code: "H07" }]);
    svc.getFields.mockResolvedValue({ surgical: [...surgicalFields], gyne: [], nongyne: [] });
    svc.getProfiles.mockResolvedValue([]);
    svc.inspect.mockResolvedValue(inspectResult);
    svc.preview.mockResolvedValue(previewResult);
  });

  it("reads the file, previews with the suggested mapping, and commits only after skipping bad rows is chosen", async () => {
    const onCommitted = vi.fn();
    svc.commit.mockResolvedValue({
      id: 12, report_type: "surgical", source_system: "old-lis", total_rows: 3,
      inserted_count: 2, updated_count: 0, skipped_count: 0, error_count: 1, status: "committed",
    });
    render(<ImportWizard onCommitted={onCommitted} onShowHistory={vi.fn()} />);

    await uploadAndGoToMapping();
    expect(svc.inspect).toHaveBeenCalledWith(file, "surgical", null, 1);

    // No source system yet: the check button stays disabled.
    const check = screen.getByText("ตรวจสอบข้อมูล").closest("button")!;
    expect(check).toBeDisabled();
    fireEvent.change(screen.getByTestId("source-system"), { target: { value: "old-lis" } });
    expect(check).not.toBeDisabled();
    fireEvent.click(check);

    await screen.findByText("ไม่มีชื่อผู้ป่วย");
    const sentMapping = svc.preview.mock.calls[0][1];
    expect(sentMapping.source_system).toBe("old-lis");
    expect(sentMapping.fields).toEqual({
      accession_no: { column: "No" },
      source_ref: { column: "No" },
      patient_full_name: { column: "Name" },
      reported_at: { column: "Date" },
      hospital: { column: "Hosp" },
    });
    // The patient's whole name, not the first name alone.
    expect(screen.getByText("นาย ก ข")).toBeInTheDocument();

    const importButton = screen.getByText(/^นำเข้า 2 รายงาน$/).closest("button")!;
    expect(importButton).toBeDisabled();
    fireEvent.click(screen.getByText(/นำเข้าเฉพาะแถวที่ไม่มีข้อผิดพลาด/));
    expect(importButton).not.toBeDisabled();

    fireEvent.click(importButton);
    const confirm = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm") as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(within(confirm).getByText("นำเข้า").closest("button")!);

    await screen.findByText("นำเข้าเรียบร้อย");
    expect(svc.commit).toHaveBeenCalledWith(file, expect.objectContaining({ source_system: "old-lis" }), true);
    expect(onCommitted).toHaveBeenCalled();
  });

  it("keeps the check disabled while a required field is unmapped", async () => {
    svc.inspect.mockResolvedValue({ ...inspectResult, suggested_fields: { accession_no: "No", source_ref: "No" } });
    render(<ImportWizard onCommitted={vi.fn()} onShowHistory={vi.fn()} />);
    await uploadAndGoToMapping();
    fireEvent.change(screen.getByTestId("source-system"), { target: { value: "old-lis" } });
    expect(screen.getByText("ตรวจสอบข้อมูล").closest("button")).toBeDisabled();
    expect(svc.preview).not.toHaveBeenCalled();
  });

  it("applies a saved mapping to the file it reads", async () => {
    svc.getProfiles.mockResolvedValue([
      {
        id: 3,
        name: "LIS เดิม",
        report_type: "surgical",
        mapping: {
          report_type: "surgical",
          source_system: "lis-2558",
          header_row: 1,
          fields: { accession_no: { column: "No" }, reported_at: { column: "Report Date" } },
          hospital_values: { "รพ.เก่า": 7 },
          default_hospital_id: null,
          on_duplicate: "update",
        },
      },
    ]);
    render(<ImportWizard onCommitted={vi.fn()} onShowHistory={vi.fn()} />);
    await waitFor(() => expect(svc.getProfiles).toHaveBeenCalledWith("surgical"));

    const select = screen.getByTestId("profile-select").closest(".ant-select")!;
    await waitFor(() => expect(select).not.toHaveClass("ant-select-disabled"));
    fireEvent.mouseDown(select.querySelector(".ant-select-content")!);
    fireEvent.click(await screen.findByText("LIS เดิม"));

    await uploadAndGoToMapping();
    expect((screen.getByTestId("source-system") as HTMLInputElement).value).toBe("lis-2558");
    // "Report Date" is not in this file, so the page says so.
    expect(screen.getByText("Report Date")).toBeInTheDocument();
  });
});
