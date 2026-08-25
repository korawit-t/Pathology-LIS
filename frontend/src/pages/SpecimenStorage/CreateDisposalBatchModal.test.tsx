import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import CreateDisposalBatchModal from "./CreateDisposalBatchModal";
import SpecimenDisposalService from "../../services/specimenDisposalService";
import UserService from "../../services/userService";
import type { SurgicalCase } from "../../types/surgical";

vi.mock("../../services/specimenDisposalService", () => ({
  default: { create: vi.fn(), openChecklistPdf: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn() },
}));

const users = [
  { id: 1, username: "somchai", full_name: "สมชาย ใจดี", status: true },
  { id: 2, username: "somying", full_name: "สมหญิง รักงาน", status: true },
  { id: 3, username: "prasert", full_name: "ประเสริฐ วงศ์ดี", status: true },
];

const cases = [
  {
    id: 11,
    accession_no: "S26-00123",
    hn: "0012345",
    specimen_storage_container: "B-12",
    patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจงาม" },
  },
  {
    id: 12,
    accession_no: "S26-00124",
    hn: "0012346",
    specimen_storage_container: "B-13",
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
});
