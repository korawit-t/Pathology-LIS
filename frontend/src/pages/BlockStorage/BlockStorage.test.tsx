import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import BlockStorage from ".";
import BlockStorageService from "../../services/blockStorageService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/blockStorageService", () => ({
  default: { searchByAccession: vi.fn() },
}));

vi.mock("./BlockStorageList", () => ({
  default: ({ onSelectRun }: { onSelectRun: (r: unknown) => void }) => (
    <button onClick={() => onSelectRun({ id: 9, run_no: "BST-2026-0009" })}>
      pick-batch
    </button>
  ),
}));
vi.mock("./components/CreateBlockStorageBatch", () => ({
  default: ({ onBack, onSuccess }: { onBack: () => void; onSuccess: (r: unknown) => void }) => (
    <div>
      <span>create-batch</span>
      <button onClick={onBack}>batch-back</button>
      <button onClick={() => onSuccess({ run_no: "BST-2026-0010" })}>batch-save</button>
    </div>
  ),
}));
vi.mock("./components/BlockStorageDetails", () => ({
  default: ({ run }: { run: { run_no?: string } | null }) => (
    <span>details-of-{run?.run_no}</span>
  ),
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const batch = {
  id: 3,
  run_no: "BST-2026-0003",
  started_at: "2026-09-01T09:00:00",
  remark: "ตู้ B",
  details: [{ id: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(BlockStorageService.searchByAccession).mockResolvedValue([batch]);
});

const renderPage = () =>
  render(
    <AntdApp>
      <BlockStorage />
    </AntdApp>,
  );

const search = (value: string) => {
  const input = screen.getByPlaceholderText(/Search by Accession No/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyUp(input, { key: "Enter" });
};

describe("BlockStorage accession search", () => {
  it("finds which batch a block was filed into", async () => {
    renderPage();
    search("S26-00001");

    expect(await screen.findByText("BST-2026-0003")).toBeInTheDocument();
    await waitFor(() =>
      expect(BlockStorageService.searchByAccession).toHaveBeenCalledWith("S26-00001"),
    );
  });

  it("trims what the user typed before searching", async () => {
    renderPage();
    search("  S26-00001  ");
    await waitFor(() =>
      expect(BlockStorageService.searchByAccession).toHaveBeenCalledWith("S26-00001"),
    );
  });

  it("does not search on an empty box", async () => {
    renderPage();
    search("   ");
    expect(BlockStorageService.searchByAccession).not.toHaveBeenCalled();
  });

  it("says plainly when a block is in no batch, quoting what was searched", async () => {
    mocked(BlockStorageService.searchByAccession).mockResolvedValue([]);
    renderPage();
    search("S26-99999");

    expect(
      await screen.findByText('No storage batch found for "S26-99999"'),
    ).toBeInTheDocument();
  });

  it("reports a failed search rather than an empty answer", async () => {
    mocked(BlockStorageService.searchByAccession).mockRejectedValue(new Error("boom"));
    renderPage();
    search("S26-00001");

    expect(await screen.findByText("Search failed")).toBeInTheDocument();
  });

  it("clears the search results when a found batch is opened", async () => {
    // ไม่งั้นตารางผลค้นหาค้างทับอยู่หลังหน้ารายละเอียด
    renderPage();
    search("S26-00001");
    await screen.findByText("BST-2026-0003");

    fireEvent.click(screen.getByText("View").closest("button") as Element);

    expect(await screen.findByText("details-of-BST-2026-0003")).toBeInTheDocument();
    expect(screen.queryByText("Batch No.")).toBeNull();
  });
});

describe("BlockStorage views", () => {
  it("starts on the batch list", () => {
    renderPage();
    expect(screen.getByText("pick-batch")).toBeInTheDocument();
  });

  it("names the batch in the details title", () => {
    renderPage();
    fireEvent.click(screen.getByText("pick-batch"));

    expect(screen.getByText("details-of-BST-2026-0009")).toBeInTheDocument();
    expect(
      screen.getByText(/Storage Batch Details: BST-2026-0009/),
    ).toBeInTheDocument();
  });

  it("returns to the list, naming the batch, once one is saved", async () => {
    renderPage();
    fireEvent.click(screen.getByText(/New|Create/i).closest("button") as Element);
    fireEvent.click(screen.getByText("batch-save"));

    expect(
      await screen.findByText("Storage batch BST-2026-0010 saved successfully"),
    ).toBeInTheDocument();
    expect(screen.getByText("pick-batch")).toBeInTheDocument();
  });

  it("clears the selected batch when backing out of details", () => {
    renderPage();
    fireEvent.click(screen.getByText("pick-batch"));

    fireEvent.click(
      document.querySelector(".anticon-arrow-left")?.closest("button") as Element,
    );
    expect(screen.getByText("pick-batch")).toBeInTheDocument();
    expect(screen.queryByText(/details-of-/)).toBeNull();
  });
});
