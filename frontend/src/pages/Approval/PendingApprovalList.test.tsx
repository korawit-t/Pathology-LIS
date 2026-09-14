import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import PendingApprovalList from "./PendingApprovalList";
import SurgicalReportService from "../../services/surgicalReportService";
import NongyneReportService from "../../services/nongyneReportService";

// PageContainer เรียก useTheme ซึ่ง throw ถ้าไม่มี ThemeProvider ครอบ
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

const mockUseAuth = vi.fn();
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

vi.mock("../../services/surgicalReportService", () => ({
  default: { getAllReports: vi.fn() },
}));
vi.mock("../../services/nongyneReportService", () => ({
  default: { getPendingReports: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const surgicalReport = {
  id: 101,
  accession_no: "S26-00123",
  status: "pending",
  report_type: "final",
  patient_title: "นาง",
  patient_name: "สมศรี",
  patient_ln: "ใจงาม",
  patient_hn: "0012345",
  pathologist_name: "พญ.อรทัย",
  updated_at: "2026-09-01T08:30:00",
};

const nongyneReport = {
  id: 202,
  accession_no: "N26-00045",
  status: "pending_approval",
  specimen_type: "Pleural fluid",
  patient_title: "นาย",
  patient_name: "วิชัย",
  patient_ln: "ศรีสุข",
  patient_hn: "0067890",
  pathologist_name: "นพ.กิตติ",
};

const asUser = (roles: string[]) => ({ user: { id: 1, username: "u", roles } });

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(asUser(["admin"]));
  mocked(SurgicalReportService.getAllReports).mockResolvedValue({
    items: [surgicalReport],
    total: 1,
  });
  mocked(NongyneReportService.getPendingReports).mockResolvedValue({
    items: [nongyneReport],
    total: 1,
  });
});

const renderList = (onOpenReport = vi.fn()) => {
  render(
    <AntdApp>
      <PendingApprovalList onOpenReport={onOpenReport} />
    </AntdApp>,
  );
  return onOpenReport;
};

describe("PendingApprovalList", () => {
  it("lands on the surgical tab and lists what is waiting there", async () => {
    renderList();
    expect(await screen.findByText("S26-00123")).toBeInTheDocument();
    await waitFor(() =>
      expect(SurgicalReportService.getAllReports).toHaveBeenCalled(),
    );
  });

  it("shows the patient's title and last name, not the first name alone", async () => {
    renderList();
    expect(await screen.findByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
  });

  it("hands the report id and its case type to the decide handler", async () => {
    const onOpenReport = renderList();
    await screen.findByText("S26-00123");

    fireEvent.click(screen.getAllByText("Decide")[0].closest("button") as Element);
    expect(onOpenReport).toHaveBeenCalledWith(101, "surgical");
  });

  it("drops a row the server returned that is no longer pending", async () => {
    // การอนุมัติที่เกิดขึ้นระหว่างที่หน้านี้เปิดค้างอยู่ ต้องไม่โผล่ให้กดซ้ำ
    mocked(SurgicalReportService.getAllReports).mockResolvedValue({
      items: [surgicalReport, { ...surgicalReport, id: 102, accession_no: "S26-00999", status: "approved" }],
      total: 2,
    });
    renderList();

    expect(await screen.findByText("S26-00123")).toBeInTheDocument();
    expect(screen.queryByText("S26-00999")).toBeNull();
  });

  it("switches to the non-gyne queue and asks the non-gyne service for it", async () => {
    const onOpenReport = renderList();
    await screen.findByText("S26-00123");

    fireEvent.click(screen.getByText("Non-Gyne Cytology"));

    expect(await screen.findByText("N26-00045")).toBeInTheDocument();
    await waitFor(() =>
      expect(NongyneReportService.getPendingReports).toHaveBeenCalled(),
    );

    const panel = document.querySelector(".ant-tabs-tabpane-active") as HTMLElement;
    fireEvent.click(within(panel).getAllByText("Decide")[0].closest("button") as Element);
    expect(onOpenReport).toHaveBeenCalledWith(202, "nongyne");
  });

  it("re-queries when the search box is used", async () => {
    renderList();
    await screen.findByText("S26-00123");
    mocked(SurgicalReportService.getAllReports).mockClear();

    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "S26-00123" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.keyUp(search, { key: "Enter" });

    await waitFor(() =>
      expect(SurgicalReportService.getAllReports).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "S26-00123",
      ),
    );
  });

  it("survives the pending list failing to load", async () => {
    mocked(SurgicalReportService.getAllReports).mockRejectedValue(new Error("boom"));
    renderList();
    // ไม่ crash และยังสลับไป tab อื่นได้
    expect(await screen.findByText("Surgical Pathology")).toBeInTheDocument();
  });
});

describe("PendingApprovalList cytotechnologist restriction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(SurgicalReportService.getAllReports).mockResolvedValue({
      items: [surgicalReport],
      total: 1,
    });
    mocked(NongyneReportService.getPendingReports).mockResolvedValue({
      items: [nongyneReport],
      total: 1,
    });
  });

  it("opens a cytotechnologist straight on the non-gyne queue", async () => {
    mockUseAuth.mockReturnValue(asUser(["cytotechnologist"]));
    renderList();

    expect(await screen.findByText("N26-00045")).toBeInTheDocument();
    // ต้องไม่ยิงถามคิว surgical เลย ไม่ใช่แค่ไม่โชว์
    expect(SurgicalReportService.getAllReports).not.toHaveBeenCalled();
  });

  it("does not restrict a cytotechnologist who is also a pathologist", async () => {
    mockUseAuth.mockReturnValue(asUser(["cytotechnologist", "pathologist"]));
    renderList();

    expect(await screen.findByText("S26-00123")).toBeInTheDocument();
    expect(SurgicalReportService.getAllReports).toHaveBeenCalled();
  });

  it("does not restrict a cytotechnologist who is also an admin", async () => {
    mockUseAuth.mockReturnValue(asUser(["cytotechnologist", "admin"]));
    renderList();

    expect(await screen.findByText("S26-00123")).toBeInTheDocument();
    expect(SurgicalReportService.getAllReports).toHaveBeenCalled();
  });
});
