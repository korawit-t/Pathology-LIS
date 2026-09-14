import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import CreateDisposalBatchModal from "./CreateDisposalBatchModal";
import SpecimenDisposalService from "../../services/specimenDisposalService";
import UserService from "../../services/userService";
import type { SurgicalCase } from "../../types/surgical";

const RETENTION = 30;
/** วันรายงานผลที่พ้นเกณฑ์แล้ว — ไม่งั้นทุกเคสติด retention gate ตั้งแต่ render */
const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString();

vi.mock("../../services/specimenDisposalService", () => ({
  default: { create: vi.fn(), openChecklistPdf: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn() },
}));

const users = [
  { id: 1, username: "somchai", full_name: "สมชาย ใจดี", status: true, roles: ["gross"] },
  { id: 2, username: "somying", full_name: "สมหญิง รักงาน", status: true, roles: ["histo"] },
  { id: 3, username: "prasert", full_name: "ประเสริฐ วงศ์ดี", status: true, roles: ["lab_manager"] },
  // บัญชีฝั่งผู้ส่งตรวจ ไม่ควรโผล่ในช่องลงนาม
  { id: 4, username: "drsuda", full_name: "พญ.สุดา คนไข้ส่ง", status: true, roles: ["clinician"] },
  { id: 5, username: "rphosp", full_name: "งานเวชระเบียน รพ.ข", status: true, roles: ["hospital"] },
  { id: 6, username: "mixed", full_name: "ปนัดดา สองบทบาท", status: true, roles: ["gross", "clinician"] },
  { id: 7, username: "resigned", full_name: "อดีตเจ้าหน้าที่", status: false, roles: ["gross"] },
];

const cases = [
  {
    id: 11,
    accession_no: "S26-00123",
    hn: "0012345",
    specimen_storage_container: "B-12",
    report_at: longAgo,
    patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจงาม" },
  },
  {
    id: 12,
    accession_no: "S26-00124",
    hn: "0012346",
    specimen_storage_container: "B-13",
    report_at: longAgo,
    patient: { name: "วิชัย", ln: "ศรีสุข" },
  },
] as unknown as SurgicalCase[];

const renderModal = (
  props: Partial<React.ComponentProps<typeof CreateDisposalBatchModal>> = {},
) =>
  render(
    <AntdApp>
      <CreateDisposalBatchModal
        open
        cases={cases}
        retentionDays={RETENTION}
        onCancel={vi.fn()}
        onCreated={vi.fn()}
        {...props}
      />
    </AntdApp>,
  );

/** เปิด Select ของ field แล้วเลือก option — ผูกกับ id ของ form field ไม่ใช่
 *  ลำดับใน DOM เพราะ dropdown ของ Select ที่เลือกไปแล้วยังค้างอยู่ และทั้งสามช่อง
 *  ใช้รายชื่อชุดเดียวกัน คลิกผิดกล่องจึงไปแก้ค่าช่องเดิมโดยไม่มีอะไรฟ้อง */
const pickSigner = async (
  field: "disposer_id" | "verifier_id" | "approver_id",
  optionText: string,
) => {
  const select = document.getElementById(field)?.closest(".ant-select");
  // antd v6 เปลี่ยนจาก .ant-select-selector เป็น .ant-select-content
  fireEvent.mouseDown(select?.querySelector(".ant-select-content") as Element);

  const dropdown = await waitFor(() => {
    const listbox = document.getElementById(`${field}_list`);
    const el = listbox?.closest(".ant-select-dropdown");
    if (!el) throw new Error(`dropdown for ${field} not open`);
    return el as HTMLElement;
  });
  fireEvent.click(within(dropdown).getByTitle(optionText));

  await waitFor(() =>
    expect(
      select?.querySelector(".ant-select-content-value")?.textContent,
    ).toBe(optionText),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue(users);
});

describe("CreateDisposalBatchModal", () => {
  it("summarises the selection by container so the count can be checked before printing", async () => {
    renderModal();
    await screen.findByText("B-12 · 1");
    expect(screen.getByText("B-13 · 1")).toBeInTheDocument();
  });

  it("shows the patient's title and last name, not the first name alone", async () => {
    renderModal();
    expect(await screen.findByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
    expect(screen.getByText("วิชัย ศรีสุข")).toBeInTheDocument();
  });

  it("refuses to print when the verifier is the same person as the disposer", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());

    await pickSigner("disposer_id", "สมชาย ใจดี (somchai)");
    await pickSigner("verifier_id", "สมชาย ใจดี (somchai)");
    await pickSigner("approver_id", "ประเสริฐ วงศ์ดี (prasert)");

    fireEvent.click(screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }));

    expect(
      await screen.findByText("ผู้ตรวจสอบต้องเป็นคนละคนกับผู้ทิ้ง"),
    ).toBeInTheDocument();
    expect(SpecimenDisposalService.create).not.toHaveBeenCalled();
  });

  it("creates the sheet with all three signers, then opens the PDF", async () => {
    (SpecimenDisposalService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      batch_no: "DSP-2026-0007",
    });
    const onCreated = vi.fn();
    renderModal({ onCreated });
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());

    await pickSigner("disposer_id", "สมชาย ใจดี (somchai)");
    await pickSigner("verifier_id", "สมหญิง รักงาน (somying)");
    await pickSigner("approver_id", "ประเสริฐ วงศ์ดี (prasert)");

    fireEvent.click(screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }));

    await waitFor(() => expect(SpecimenDisposalService.create).toHaveBeenCalled());
    const [payload] = (SpecimenDisposalService.create as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        case_ids: [11, 12],
        disposer_id: 1,
        verifier_id: 2,
        approver_id: 3,
      }),
    );

    await waitFor(() =>
      expect(SpecimenDisposalService.openChecklistPdf).toHaveBeenCalledWith(7),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("requires every signer before it will submit", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }));

    // ข้อความ validation ของแต่ละช่องโผล่คนละจังหวะ (motion) จึงต้อง await ทีละอัน
    expect(await screen.findByText("กรุณาเลือกผู้ทิ้ง")).toBeInTheDocument();
    expect(await screen.findByText("กรุณาเลือกผู้ตรวจสอบ")).toBeInTheDocument();
    expect(await screen.findByText("กรุณาเลือกผู้อนุมัติ")).toBeInTheDocument();
    expect(SpecimenDisposalService.create).not.toHaveBeenCalled();
  });

  it("states the criterion the server enforces instead of asking for it", async () => {
    renderModal();
    expect(
      await screen.findByText(`${RETENTION} วันนับจากวันรายงานผล`),
    ).toBeInTheDocument();
    // ช่องกรอกเกณฑ์เองถูกถอดออกแล้ว — ถ้ากรอกได้ ก็ส่ง 0 มาข้ามเกณฑ์ได้
    expect(document.getElementById("retention_days")).toBeNull();
  });
});


describe("CreateDisposalBatchModal retention gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue(users);
  });

  const withCases = (overrides: Partial<SurgicalCase>[]) =>
    cases.map((c, i) => ({ ...c, ...overrides[i] })) as SurgicalCase[];

  it("refuses to print when a case has not reached the retention period", async () => {
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    renderModal({ cases: withCases([{}, { report_at: recent }]) });

    expect(
      await screen.findByText(`S26-00124 — ยังไม่ครบ ${RETENTION} วัน (5 วัน)`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }),
    ).toBeDisabled();
  });

  it("refuses to print a case that has no report date yet", async () => {
    renderModal({ cases: withCases([{}, { report_at: null }]) });

    expect(
      await screen.findByText("S26-00124 — ยังไม่ได้รายงานผล"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }),
    ).toBeDisabled();
  });

  it("refuses to print a case still marked pending", async () => {
    renderModal({ cases: withCases([{}, { is_pending: true }]) });

    expect(
      await screen.findByText("S26-00124 — ยังค้าง Pending"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }),
    ).toBeDisabled();
  });

  it("prints normally once every case is past the criterion", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());

    expect(
      screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }),
    ).toBeEnabled();
  });
});


describe("CreateDisposalBatchModal signer eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue(users);
  });

  const openDisposerOptions = async () => {
    const select = document.getElementById("disposer_id")?.closest(".ant-select");
    fireEvent.mouseDown(select?.querySelector(".ant-select-content") as Element);
    return await waitFor(() => {
      const el = document
        .getElementById("disposer_id_list")
        ?.closest(".ant-select-dropdown");
      if (!el) throw new Error("dropdown not open");
      return el as HTMLElement;
    });
  };

  it("leaves clinician and hospital accounts out of the signer list", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());
    const dropdown = await openDisposerOptions();

    expect(within(dropdown).queryByTitle(/พญ.สุดา/)).toBeNull();
    expect(within(dropdown).queryByTitle(/งานเวชระเบียน/)).toBeNull();
  });

  it("also excludes an account that holds an external role alongside a lab role", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());
    const dropdown = await openDisposerOptions();

    expect(within(dropdown).queryByTitle(/ปนัดดา/)).toBeNull();
  });

  it("keeps lab staff, and still drops deactivated accounts", async () => {
    renderModal();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());
    const dropdown = await openDisposerOptions();

    expect(within(dropdown).getByTitle("สมชาย ใจดี (somchai)")).toBeInTheDocument();
    expect(within(dropdown).getByTitle("สมหญิง รักงาน (somying)")).toBeInTheDocument();
    expect(within(dropdown).getByTitle("ประเสริฐ วงศ์ดี (prasert)")).toBeInTheDocument();
    expect(within(dropdown).queryByTitle(/อดีตเจ้าหน้าที่/)).toBeNull();
  });
});
