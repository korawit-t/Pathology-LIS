import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import ResultPage from "./ResultPage";
import SurgicalReportService from "../../services/surgicalReportService";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import { MolecularCaseService } from "../../services/molecularCaseService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import legacyReportService from "../../services/legacyReportService";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: ["clinician"] }, logout: vi.fn() }),
}));
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/surgicalReportService", () => ({
  default: { getArchive: vi.fn(), getReportPdf: vi.fn(), markRead: vi.fn() },
}));
vi.mock("../../services/gyneDiagnosisService", () => ({
  default: { getArchive: vi.fn(), getReportPdf: vi.fn(), markRead: vi.fn() },
}));
vi.mock("../../services/nongyneDiagnosisService", () => ({
  default: { getArchive: vi.fn(), getPublishedReportPdf: vi.fn() },
}));
// named export ไม่ใช่ default — mock ผิดรูปแล้วหน้าเพจ throw เงียบ ๆ ใน Promise.all
vi.mock("../../services/molecularCaseService", () => ({
  MolecularCaseService: {
    getAll: vi.fn(),
    getResultPdfBlob: vi.fn(),
    getOutlabPdfBlob: vi.fn(),
  },
}));
vi.mock("../../services/gyneCytoCaseService", () => ({
  default: { downloadOutlabTestResult: vi.fn() },
}));
vi.mock("../../services/legacyReportService", () => ({
  default: { getPdf: vi.fn(), markRead: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const archive = (items: unknown[] = []) => ({ items, total: items.length });

const surgicalRow = {
  source: "current",
  id: 1,
  accession_no: "S26-00001",
  patient_hn: "0011111",
  patient_title: "นาง",
  patient_name: "สมศรี",
  patient_ln: "ใจงาม",
  status: "published",
  date: "2026-09-03",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SurgicalReportService.getArchive).mockResolvedValue(archive());
  mocked(GyneDiagnosisService.getArchive).mockResolvedValue(archive());
  mocked(NongyneDiagnosisService.getArchive).mockResolvedValue(archive());
  mocked(MolecularCaseService.getAll).mockResolvedValue([]);
  mocked(SurgicalReportService.getReportPdf).mockResolvedValue(new Blob(["%PDF"]));
  mocked(SurgicalReportService.markRead).mockResolvedValue({});
  window.URL.createObjectURL = vi.fn(() => "blob:fake");
  window.URL.revokeObjectURL = vi.fn();
  window.open = vi.fn();
});

const renderPage = () =>
  render(
    <AntdApp>
      <ResultPage />
    </AntdApp>,
  );

const searchPatient = (value: string) => {
  const input = screen.getByPlaceholderText("HN หรือชื่อผู้ป่วย...");
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyUp(input, { key: "Enter" });
};

describe("ResultPage search", () => {
  it("refuses a query shorter than three characters", async () => {
    renderPage();
    searchPatient("ab");

    expect(
      await screen.findByText("กรุณากรอกอย่างน้อย 3 ตัวอักษร"),
    ).toBeInTheDocument();
    expect(SurgicalReportService.getArchive).not.toHaveBeenCalled();
  });

  it("asks every case type at once and merges the answers", async () => {
    mocked(SurgicalReportService.getArchive).mockResolvedValue(archive([surgicalRow]));
    mocked(GyneDiagnosisService.getArchive).mockResolvedValue(
      archive([{ ...surgicalRow, id: 2, accession_no: "C26-00002", date: "2026-09-05" }]),
    );
    mocked(MolecularCaseService.getAll).mockResolvedValue([
      { id: 3, accession_no: "M26-00003", status: "reported", reported_at: "2026-09-04" },
    ]);
    renderPage();
    searchPatient("สมศรี");

    expect(await screen.findByText("S26-00001")).toBeInTheDocument();
    expect(screen.getByText("C26-00002")).toBeInTheDocument();
    expect(screen.getByText("M26-00003")).toBeInTheDocument();
  });

  it("orders the merged rows newest first", async () => {
    mocked(SurgicalReportService.getArchive).mockResolvedValue(
      archive([
        { ...surgicalRow, id: 1, accession_no: "S26-OLD", date: "2026-01-01" },
        { ...surgicalRow, id: 2, accession_no: "S26-NEW", date: "2026-09-01" },
      ]),
    );
    renderPage();
    searchPatient("สมศรี");

    await screen.findByText("S26-NEW");
    const text = document.body.textContent || "";
    expect(text.indexOf("S26-NEW")).toBeLessThan(text.indexOf("S26-OLD"));
  });

  it("reports a failed search rather than showing an empty result", async () => {
    mocked(SurgicalReportService.getArchive).mockRejectedValue(new Error("boom"));
    renderPage();
    searchPatient("สมศรี");

    expect(
      await screen.findByText("ค้นหาไม่สำเร็จ กรุณาลองใหม่"),
    ).toBeInTheDocument();
  });

  it("searches by clinician without sending a patient query", async () => {
    renderPage();
    const input = screen.getByPlaceholderText("ชื่อ ผู้ส่งตรวจ...");
    fireEvent.change(input, { target: { value: "นพ.สมชาย" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyUp(input, { key: "Enter" });

    await waitFor(() =>
      expect(SurgicalReportService.getArchive).toHaveBeenCalledWith(
        1,
        100,
        undefined,
        undefined,
        "นพ.สมชาย",
      ),
    );
  });
});

describe("ResultPage report access", () => {
  const searchWith = async (row: Record<string, unknown>) => {
    mocked(SurgicalReportService.getArchive).mockResolvedValue(archive([row]));
    renderPage();
    searchPatient("สมศรี");
    await screen.findByText(row.accession_no as string);
  };

  it("offers no PDF for a case that is not published yet", async () => {
    await searchWith({ ...surgicalRow, status: "in_progress" });

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("ดูผล")).toBeNull();
  });

  it("always offers a legacy report, whatever status it carries", async () => {
    // เคสเก่าที่ import เข้ามาไม่มี workflow status ให้ยึด
    await searchWith({ ...surgicalRow, source: "legacy", status: "draft" });
    expect(screen.getByText("ดูผล")).toBeInTheDocument();
  });

  it("marks a report read when the clinician opens it", async () => {
    await searchWith(surgicalRow);
    fireEvent.click(screen.getByText("ดูผล").closest("button") as Element);

    await waitFor(() =>
      expect(SurgicalReportService.getReportPdf).toHaveBeenCalledWith(1),
    );
    await waitFor(() => expect(SurgicalReportService.markRead).toHaveBeenCalledWith(1));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });

  it("still shows the report when marking it read fails", async () => {
    // markRead เป็นงานรอง ล้มแล้วต้องไม่บังไม่ให้หมอเห็นผล
    mocked(SurgicalReportService.markRead).mockRejectedValue(new Error("offline"));
    await searchWith(surgicalRow);
    fireEvent.click(screen.getByText("ดูผล").closest("button") as Element);

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(screen.queryByText("ไม่สามารถโหลดรายงานได้")).toBeNull();
  });

  it("says so when the PDF cannot be fetched", async () => {
    mocked(SurgicalReportService.getReportPdf).mockRejectedValue(new Error("500"));
    await searchWith(surgicalRow);
    fireEvent.click(screen.getByText("ดูผล").closest("button") as Element);

    expect(
      await screen.findByText("ไม่สามารถโหลดรายงานได้"),
    ).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("names the downloaded file after the patient and HN", async () => {
    const anchors: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") anchors.push(el as HTMLAnchorElement);
      return el;
    });

    await searchWith(surgicalRow);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(anchors.length).toBeGreaterThan(0));
    expect(anchors[0].download).toBe("นางสมศรีใจงาม_HN0011111.pdf");
    vi.mocked(document.createElement).mockRestore();
  });
});

describe("ResultPage gyne out-lab results", () => {
  it("fetches the out-lab file, not the diagnosis PDF, for an out-lab-only row", async () => {
    // เคส gyne ที่ยังไม่ published แต่มีผล out-lab แนบมา ต้องดึงไฟล์ของ out-lab
    mocked(GyneDiagnosisService.getArchive).mockResolvedValue(
      archive([
        {
          source: "current",
          id: 7,
          case_id: 77,
          accession_no: "C26-00007",
          status: "in_progress",
          has_outlab_result: true,
          date: "2026-09-02",
        },
      ]),
    );
    mocked(GyneCytologyCaseService.downloadOutlabTestResult).mockResolvedValue(
      new Blob(["%PDF"]),
    );
    renderPage();
    searchPatient("สมศรี");
    await screen.findByText("C26-00007");

    expect(screen.getByText("ผล Out-lab")).toBeInTheDocument();
    fireEvent.click(screen.getByText("ดูผล").closest("button") as Element);

    await waitFor(() =>
      expect(GyneCytologyCaseService.downloadOutlabTestResult).toHaveBeenCalledWith(77),
    );
    expect(GyneDiagnosisService.getReportPdf).not.toHaveBeenCalled();
  });
});
