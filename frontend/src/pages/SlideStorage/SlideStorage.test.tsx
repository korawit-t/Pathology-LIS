import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SlideStorage from ".";
import SlideStorageService from "../../services/slideStorageService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/slideStorageService", () => ({
  default: { searchByAccession: vi.fn(), getRunDetails: vi.fn() },
}));

vi.mock("./SlideStorageList", () => ({
  default: ({
    stainCategory,
    onSelectRun,
  }: {
    stainCategory: string;
    onSelectRun: (r: unknown) => void;
  }) => (
    <button onClick={() => onSelectRun({ id: 9, run_no: `SST-${stainCategory}-9` })}>
      pick-{stainCategory}
    </button>
  ),
}));
vi.mock("./components/CreateSlideStorageBatch", () => ({
  default: ({ onSuccess }: { onSuccess: (r: unknown) => void }) => (
    <button onClick={() => onSuccess({ run_no: "SST-2026-0010" })}>batch-save</button>
  ),
}));
vi.mock("./components/SlideStorageDetails", () => ({
  default: ({ run }: { run: { run_no?: string } | null }) => (
    <span>details-of-{run?.run_no}</span>
  ),
}));
vi.mock("./components/SlideDisposalTab", () => ({
  default: () => <span>slide-disposal-tab</span>,
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SlideStorageService.searchByAccession).mockResolvedValue([
    { id: 3, run_no: "SST-2026-0003", started_at: "2026-09-01T09:00:00", details: [] },
  ]);
  mocked(SlideStorageService.getRunDetails).mockImplementation(async (id: number) => ({
    id,
    run_no: "SST-FULL",
    details: [{ id: 1 }],
  }));
});

const renderPage = () =>
  render(
    <AntdApp>
      <SlideStorage />
    </AntdApp>,
  );

const search = (value: string) => {
  const input = screen.getByPlaceholderText(/Search by Accession No/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyUp(input, { key: "Enter" });
};

describe("SlideStorage categories", () => {
  it("keeps a tab per stain category plus the disposal tab", () => {
    renderPage();
    ["H&E Slide", "Special Stain", "IHC", "Gyne Cytology", "Non-Gyne Cytology"].forEach(
      (label) => expect(screen.getByText(label)).toBeInTheDocument(),
    );
  });

  it("opens on H&E", () => {
    renderPage();
    expect(screen.getByText("pick-HE")).toBeInTheDocument();
  });

  it("gives each category its own list", async () => {
    renderPage();
    fireEvent.click(screen.getByText("IHC"));
    expect(await screen.findByText("pick-IHC")).toBeInTheDocument();
  });

  it("keeps one category's open batch out of another's tab", async () => {
    // แต่ละ tab ถือ view/selectedRun ของตัวเอง สลับไปมาต้องไม่พาหน้ารายละเอียดข้ามไป
    renderPage();
    fireEvent.click(screen.getByText("pick-HE"));
    expect(await screen.findByText("details-of-SST-FULL")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Special Stain"));
    expect(await screen.findByText("pick-Special")).toBeInTheDocument();

    fireEvent.click(screen.getByText("H&E Slide"));
    expect(await screen.findByText("details-of-SST-FULL")).toBeInTheDocument();
  });

  it("fetches the full batch before showing details", async () => {
    // แถวในตารางไม่มีรายการสไลด์ครบ ต้องดึงรายละเอียดก่อน ไม่ใช่โชว์ของที่มีอยู่
    renderPage();
    fireEvent.click(screen.getByText("pick-HE"));

    await waitFor(() =>
      expect(SlideStorageService.getRunDetails).toHaveBeenCalledWith(9),
    );
  });

  it("stays on the list when the batch details cannot be loaded", async () => {
    mocked(SlideStorageService.getRunDetails).mockRejectedValue(new Error("boom"));
    renderPage();
    fireEvent.click(screen.getByText("pick-HE"));

    expect(await screen.findByText("Failed to load details")).toBeInTheDocument();
    expect(screen.getByText("pick-HE")).toBeInTheDocument();
  });

  it("shows the disposal tab on demand", async () => {
    renderPage();
    fireEvent.click(screen.getByText(/Disposal/i));
    expect(await screen.findByText("slide-disposal-tab")).toBeInTheDocument();
  });
});

describe("SlideStorage accession search", () => {
  it("finds which batch a slide was filed into", async () => {
    renderPage();
    search("S26-00001");

    expect(await screen.findByText("SST-2026-0003")).toBeInTheDocument();
    await waitFor(() =>
      expect(SlideStorageService.searchByAccession).toHaveBeenCalledWith("S26-00001"),
    );
  });

  it("says plainly when a slide is in no batch", async () => {
    mocked(SlideStorageService.searchByAccession).mockResolvedValue([]);
    renderPage();
    search("S26-99999");

    expect(
      await screen.findByText('No storage batch found for "S26-99999"'),
    ).toBeInTheDocument();
  });

  it("reports a failed search", async () => {
    mocked(SlideStorageService.searchByAccession).mockRejectedValue(new Error("boom"));
    renderPage();
    search("S26-00001");

    expect(await screen.findByText("Search failed")).toBeInTheDocument();
  });

  it("does not search on an empty box", () => {
    renderPage();
    search("   ");
    expect(SlideStorageService.searchByAccession).not.toHaveBeenCalled();
  });
});
