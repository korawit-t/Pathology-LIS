import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SpecimenStorage from "./index";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SpecimenDisposalService from "../../services/specimenDisposalService";
import UserService from "../../services/userService";
import type { SurgicalCase } from "../../types/surgical";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/surgicalCaseService", () => ({
  default: {
    getUnstoredCases: vi.fn().mockResolvedValue([]),
    getStoredCases: vi.fn(),
    getDisposedCases: vi.fn(),
    bulkUpdateStorageStatus: vi.fn(),
  },
}));
vi.mock("../../services/specimenDisposalService", () => ({
  default: {
    getAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getOpenCount: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    openChecklistPdf: vi.fn(),
  },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn().mockResolvedValue([]) },
}));

const storedCase = {
  id: 11,
  accession_no: "S26-00123",
  hn: "0012345",
  specimen_storage_container: "B-12",
  specimen_storage_status: "Stored",
  patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจงาม" },
} as unknown as SurgicalCase;

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SurgicalCaseService.getUnstoredCases).mockResolvedValue([storedCase]);
  mocked(SurgicalCaseService.getStoredCases).mockResolvedValue({
    items: [storedCase],
    total: 1,
  });
  mocked(SurgicalCaseService.getDisposedCases).mockResolvedValue({ items: [], total: 0 });
  mocked(SpecimenDisposalService.getOpenCount).mockResolvedValue(3);
  mocked(SpecimenDisposalService.getAll).mockResolvedValue({ items: [], total: 0 });
});

const renderPage = () =>
  render(
    <AntdApp>
      <SpecimenStorage />
    </AntdApp>,
  );

describe("SpecimenStorage", () => {
  it("badges the disposal tab with how many sheets are still out", async () => {
    renderPage();
    const tab = await screen.findByRole("tab", { name: /รอบการทำลาย/ });
    expect(within(tab).getByText("3")).toBeInTheDocument();
  });

  it("shows the patient's title and last name in the unstored list", async () => {
    renderPage();
    expect(await screen.findByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
  });

  it("hides cases already on an open sheet when loading the stored tab", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Stored Specimens/ }));

    await waitFor(() =>
      expect(SurgicalCaseService.getStoredCases).toHaveBeenCalledWith(
        0,
        20,
        "",
        true,
      ),
    );
  });

  it("opens the create-sheet modal instead of disposing on the spot", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Stored Specimens/ }));

    const button = await screen.findByRole("button", {
      name: /สร้างใบตรวจสอบก่อนทำลาย/,
    });
    // ยังไม่ได้เลือกอะไร ปุ่มต้องกดไม่ได้
    expect(button).toBeDisabled();

    // ตารางของ tab อื่นยัง mount อยู่และมี checkbox เหมือนกัน ต้องเจาะ tab ที่เปิดอยู่
    const panel = await waitFor(() => {
      const el = document.querySelector(".ant-tabs-tabpane-active");
      if (!el) throw new Error("no active tab panel");
      return el as HTMLElement;
    });
    const rowCheckboxes = within(panel).getAllByRole("checkbox");
    fireEvent.click(rowCheckboxes[rowCheckboxes.length - 1]);

    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    expect(
      await screen.findByText("สร้างใบตรวจสอบก่อนทำลายชิ้นเนื้อ"),
    ).toBeInTheDocument();
    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalled());
  });

  it("renders the disposal-sheet tab from the batch service", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /รอบการทำลาย/ }));

    await waitFor(() =>
      expect(SpecimenDisposalService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PRINTED" }),
      ),
    );
  });
});
