import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import CreateNongyneDisposalBatchModal from "./CreateNongyneDisposalBatchModal";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import UserService from "../../services/userService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";
import type { User } from "../../types/user";

vi.mock("../../services/nongyneSpecimenDisposalService", () => ({
  default: { create: vi.fn(), openChecklistPdf: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn() },
}));

const svc = NongyneSpecimenDisposalService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const users = UserService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const makeUser = (id: number, name: string, roles: string[]): User =>
  ({ id, username: `u${id}`, full_name: name, roles, status: true }) as User;

const LAB_USERS = [
  makeUser(1, "สมชาย ใจดี", ["cytotechnologist"]),
  makeUser(2, "สมหญิง รักงาน", ["lab_manager"]),
  makeUser(3, "ประเสริฐ วงศ์ดี", ["senior_pathologist"]),
];

const cases = [
  {
    id: 11,
    accession_no: "N26-00123",
    hn: "0012345",
    specimen_type: "Fluid",
    days_since_report: 65,
    patient: { id: 3, name: "สมศรี", ln: "ใจงาม", title: { title: "นาง" } },
  },
  {
    id: 12,
    accession_no: "N26-00124",
    hn: "0012346",
    specimen_type: "Sputum",
    days_since_report: 40,
    patient: { id: 4, name: "วิชัย", ln: "ศรีสุข", title: { title: "นาย" } },
  },
] as unknown as NongyneDisposalCandidate[];

const onCreated = vi.fn();

const renderModal = () =>
  render(
    <AntdApp>
      <CreateNongyneDisposalBatchModal
        open
        cases={cases}
        retentionDays={30}
        onCancel={vi.fn()}
        onCreated={onCreated}
      />
    </AntdApp>,
  );

const inAlert = () =>
  within(document.querySelector(".ant-alert") as HTMLElement);

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
  users.getUsers.mockResolvedValue(LAB_USERS);
  svc.create.mockResolvedValue({ id: 9, batch_no: "NDSP-2026-0009" });
});

describe("CreateNongyneDisposalBatchModal", () => {
  it("summarises the selection by specimen type, not by box", async () => {
    renderModal();
    expect(await screen.findByText("Fluid · 1")).toBeInTheDocument();
    expect(screen.getByText("Sputum · 1")).toBeInTheDocument();
  });

  it("states the retention rule the server will enforce", async () => {
    renderModal();
    await waitFor(() => expect(users.getUsers).toHaveBeenCalled());
    expect(inAlert().getByText(/รายงานผลแล้วเกิน/)).toBeInTheDocument();
    expect(inAlert().getByText("30")).toBeInTheDocument();
    expect(inAlert().getByText(/ไม่ค้าง Pending/)).toBeInTheDocument();
  });

  it("has no retention field to override — the rule lives on the server", async () => {
    renderModal();
    await waitFor(() => expect(users.getUsers).toHaveBeenCalled());
    // a number input here would let the operator dial the gate down to zero
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("shows the patient's title and last name, not the first name alone", async () => {
    renderModal();
    expect(await screen.findByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
    expect(screen.getByText("นาย วิชัย ศรีสุข")).toBeInTheDocument();
  });

  it("shows the server-computed age of each case on the preview", async () => {
    renderModal();
    expect(await screen.findByText("65 วัน")).toBeInTheDocument();
    expect(screen.getByText("40 วัน")).toBeInTheDocument();
  });

  it("drops external accounts from the signer lists", async () => {
    users.getUsers.mockResolvedValue([
      ...LAB_USERS,
      makeUser(9, "หมอส่งตรวจ", ["clinician"]),
    ]);
    renderModal();
    await waitFor(() => expect(users.getUsers).toHaveBeenCalled());

    await pickSigner("disposer_id", "สมชาย ใจดี (u1)");
    expect(screen.queryByTitle("หมอส่งตรวจ (u9)")).not.toBeInTheDocument();
  });

  it("refuses to let one person sign as both disposer and verifier", async () => {
    renderModal();
    await waitFor(() => expect(users.getUsers).toHaveBeenCalled());

    await pickSigner("disposer_id", "สมชาย ใจดี (u1)");
    await pickSigner("verifier_id", "สมชาย ใจดี (u1)");
    await pickSigner("approver_id", "ประเสริฐ วงศ์ดี (u3)");
    fireEvent.click(screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }));

    expect(
      await screen.findByText("ผู้ตรวจสอบต้องเป็นคนละคนกับผู้ทิ้ง"),
    ).toBeInTheDocument();
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("creates the sheet then opens the printable PDF", async () => {
    renderModal();
    await waitFor(() => expect(users.getUsers).toHaveBeenCalled());

    await pickSigner("disposer_id", "สมชาย ใจดี (u1)");
    await pickSigner("verifier_id", "สมหญิง รักงาน (u2)");
    await pickSigner("approver_id", "ประเสริฐ วงศ์ดี (u3)");
    fireEvent.click(screen.getByRole("button", { name: /สร้างใบและพิมพ์/ }));

    await waitFor(() =>
      // no retention_days in the payload — the server owns that rule
      expect(svc.create).toHaveBeenCalledWith({
        case_ids: [11, 12],
        disposer_id: 1,
        verifier_id: 2,
        approver_id: 3,
      }),
    );
    await waitFor(() => expect(svc.openChecklistPdf).toHaveBeenCalledWith(9));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
