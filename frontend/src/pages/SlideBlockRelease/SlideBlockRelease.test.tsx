import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SlideBlockRelease from ".";
import SlideBlockReleaseService from "../../services/slideBlockReleaseService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/slideBlockReleaseService", () => ({
  default: {
    getAll: vi.fn(),
    verifyAccession: vi.fn(),
    delete: vi.fn(),
    openFormPdf: vi.fn(),
  },
}));

// ฟอร์มสร้างใบเบิกเป็นหน้าจอของตัวเอง ที่นี่สนใจแค่การสลับเข้า/ออก
vi.mock("./CreateReleaseForm", () => ({
  default: ({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) => (
    <div>
      <span>create-release-form</span>
      <button onClick={onBack}>form-back</button>
      <button onClick={onSuccess}>form-saved</button>
    </div>
  ),
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const record = {
  id: 1,
  release_no: "REL-2026-0001",
  accession_no: "S26-00001",
  case_type: "SURGICAL",
  release_type: "SLIDE",
  patient_name: "นาง สมศรี ใจงาม",
  created_at: "2026-09-01T10:00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SlideBlockReleaseService.getAll).mockResolvedValue({
    items: [record],
    total: 1,
  });
});

const renderPage = () =>
  render(
    <AntdApp>
      <SlideBlockRelease />
    </AntdApp>,
  );

const checkAccession = (value: string) => {
  const input = screen.getByPlaceholderText(/Enter accession no/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest("form") as Element);
};

describe("SlideBlockRelease accession check", () => {
  it("upper-cases the accession before asking the server", async () => {
    // เจ้าหน้าที่พิมพ์ตัวเล็กประจำ แต่เลข accession เก็บเป็นตัวใหญ่
    mocked(SlideBlockReleaseService.verifyAccession).mockResolvedValue({
      accession_no: "S26-00001",
      case_type: "SURGICAL",
      patient_name: "นาง สมศรี ใจงาม",
      is_slide_released: false,
      is_block_released: false,
    });
    renderPage();
    checkAccession("  s26-00001 ");

    await waitFor(() =>
      expect(SlideBlockReleaseService.verifyAccession).toHaveBeenCalledWith("S26-00001"),
    );
  });

  it("says whether the slides have already gone out", async () => {
    mocked(SlideBlockReleaseService.verifyAccession).mockResolvedValue({
      accession_no: "S26-00001",
      case_type: "SURGICAL",
      patient_name: "นาง สมศรี ใจงาม",
      is_slide_released: true,
      is_block_released: false,
    });
    renderPage();
    checkAccession("S26-00001");

    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(screen.getByText("Not released")).toBeInTheDocument();
  });

  it("asks about blocks only for surgical cases", async () => {
    // cytology ไม่มีบล็อกพาราฟิน จึงไม่ควรมีบรรทัดสถานะบล็อกให้สับสน
    mocked(SlideBlockReleaseService.verifyAccession).mockResolvedValue({
      accession_no: "C26-00002",
      case_type: "GYNE",
      patient_name: "นาย วิชัย ศรีสุข",
      is_slide_released: true,
      is_block_released: false,
    });
    renderPage();
    checkAccession("C26-00002");

    await screen.findByText("C26-00002");
    expect(screen.queryByText("Not released")).toBeNull();
  });

  it("shows the server's reason when the case cannot be released", async () => {
    mocked(SlideBlockReleaseService.verifyAccession).mockRejectedValue({
      response: { data: { detail: "เคสนี้ยังไม่ได้รายงานผล" } },
    });
    renderPage();
    checkAccession("S26-99999");

    expect(await screen.findByText("เคสนี้ยังไม่ได้รายงานผล")).toBeInTheDocument();
  });

  it("falls back to a readable message when the server gives no reason", async () => {
    mocked(SlideBlockReleaseService.verifyAccession).mockRejectedValue(new Error("500"));
    renderPage();
    checkAccession("S26-99999");

    expect(
      await screen.findByText("Case not found or not yet reported"),
    ).toBeInTheDocument();
  });

  it("does not query on an empty box", async () => {
    renderPage();
    checkAccession("   ");
    expect(SlideBlockReleaseService.verifyAccession).not.toHaveBeenCalled();
  });
});

describe("SlideBlockRelease record list", () => {
  it("lists existing release records", async () => {
    renderPage();
    expect(await screen.findByText("REL-2026-0001")).toBeInTheDocument();
  });

  it("reports a failure to load rather than showing an empty list", async () => {
    mocked(SlideBlockReleaseService.getAll).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText("Failed to load release records"),
    ).toBeInTheDocument();
  });

  it("passes the case-type filter to the server", async () => {
    renderPage();
    await screen.findByText("REL-2026-0001");

    fireEvent.mouseDown(
      screen
        .getByText("Filter by Case Type")
        .closest(".ant-select")
        ?.querySelector(".ant-select-content") as Element,
    );
    fireEvent.click(await screen.findByTitle("Surgical"));

    await waitFor(() =>
      expect(SlideBlockReleaseService.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ case_type: "SURGICAL" }),
      ),
    );
  });

  it("warns that cancelling reverts the case flags before deleting", async () => {
    mocked(SlideBlockReleaseService.delete).mockResolvedValue({});
    renderPage();
    await screen.findByText("REL-2026-0001");

    const del = document.querySelector(".anticon-delete")?.closest("button");
    fireEvent.click(del as Element);

    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    expect(dialog.textContent).toContain("case flags will be reverted");

    const ok = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Cancel"),
    );
    fireEvent.click(ok as Element);

    await waitFor(() => expect(SlideBlockReleaseService.delete).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Release record cancelled")).toBeInTheDocument();
  });
});

describe("SlideBlockRelease create mode", () => {
  it("stops polling the list while the create form is open", async () => {
    renderPage();
    await screen.findByText("REL-2026-0001");
    const before = mocked(SlideBlockReleaseService.getAll).mock.calls.length;

    fireEvent.click(screen.getByText(/New Release|Create/i).closest("button") as Element);
    expect(screen.getByText("create-release-form")).toBeInTheDocument();
    expect(mocked(SlideBlockReleaseService.getAll).mock.calls.length).toBe(before);
  });

  it("reloads the list once a release has been saved", async () => {
    renderPage();
    await screen.findByText("REL-2026-0001");

    fireEvent.click(screen.getByText(/New Release|Create/i).closest("button") as Element);
    fireEvent.click(screen.getByText("form-saved"));

    expect(await screen.findByText("REL-2026-0001")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocked(SlideBlockReleaseService.getAll).mock.calls.length).toBeGreaterThan(1),
    );
  });
});
