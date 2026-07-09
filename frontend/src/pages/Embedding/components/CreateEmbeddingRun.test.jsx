import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CreateEmbeddingRun from "./CreateEmbeddingRun";
import EmbeddingService from "../../../services/embeddingService";

vi.mock("../../../services/embeddingService", () => ({
  default: {
    getPendingBlocksTree: vi.fn(),
    createRun: vi.fn(),
    batchAddBlocks: vi.fn(),
  },
}));

const tree = (overrides = {}) => [
  {
    key: "case-1",
    id: 1,
    code: "S26-00001",
    isCase: true,
    children: [
      { key: 101, id: 101, code: "A1", isCase: false, is_decal: false },
      { key: 102, id: 102, code: "A2", isCase: false, is_decal: true },
    ],
    ...overrides,
  },
];

// Modal content (the Manual Select table) is rendered via a React portal
// straight onto document.body, outside RTL's own `container` root — so
// row lookups must search the whole document, not just `container`.
const rowWithText = (text) =>
  Array.from(document.body.querySelectorAll("tbody tr")).find((r) => r.textContent.includes(text));

const scanBarcode = (input, code) => {
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
  // @rc-component/input locks onPressEnter after the first keydown and only
  // releases it on keyup — without this, a second real scan in the same
  // test would silently no-op.
  fireEvent.keyUp(input, { key: "Enter", code: "Enter", keyCode: 13 });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("user", JSON.stringify({ id: 7, full_name: "Dr. Test" }));
});

afterEach(() => {
  localStorage.clear();
});

describe("CreateEmbeddingRun", () => {
  it("loads the pending blocks tree on mount and shows the operator's full name", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);

    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Operator:/)).toHaveTextContent("Operator: Dr. Test");
  });

  it("scans a known block by barcode and adds it with its parent accession number", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    scanBarcode(screen.getByPlaceholderText("Scan block barcode..."), "A1");

    expect(await screen.findByText("Scanned Blocks (1)")).toBeInTheDocument();
    expect(screen.getByText("S26-00001")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("shows an error and clears the input when the barcode is not in the pending list", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("Scan block barcode...");
    scanBarcode(input, "UNKNOWN");

    expect(await screen.findByText("Block not found in pending list or already embedded")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByText("Scanned Blocks (0)")).toBeInTheDocument();
  });

  it("warns instead of duplicating when the same block is scanned twice", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("Scan block barcode...");
    scanBarcode(input, "A1");
    await screen.findByText("Scanned Blocks (1)");
    scanBarcode(input, "A1");

    expect(await screen.findByText("Block already in the list")).toBeInTheDocument();
    expect(screen.getByText("Scanned Blocks (1)")).toBeInTheDocument();
  });

  it("adds individually-checked blocks via the Manual Select modal", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Manual Select/i }));
    await screen.findByText("Select Blocks for Embedding (Pending Blocks)");
    fireEvent.click(rowWithText("S26-00001").querySelector(".ant-table-row-expand-icon"));
    fireEvent.click(rowWithText("A1").querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByRole("button", { name: "Add Selected" }));

    const scannedCard = (await screen.findByText("Scanned Blocks (1)")).closest(".ant-card");
    expect(within(scannedCard).getByText("A1")).toBeInTheDocument();
  });

  it("excludes the specimen parent key from the modal's selected count (regression: used to check for a 'spec-' prefix, but tree parent keys are actually 'case-N')", async () => {
    // selectedCountInModal filters selectedRowKeys with:
    //   typeof key === "number" || !key.toString().startsWith("case-")
    // Real specimen keys are built server-side as `case-{id}` (see
    // backend/app/crud/embedding.py get_embedding_pending_tree). This used
    // to check for a "spec-" prefix instead, which never matched, so
    // checking a whole specimen inflated the displayed count by one (3
    // instead of the 2 real blocks under it).
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Manual Select/i }));
    const specimenRow = await screen.findByText("S26-00001").then((el) => el.closest("tr"));
    fireEvent.click(specimenRow.querySelector('input[type="checkbox"]'));

    expect(await screen.findByText(/Selected: 2/)).toBeInTheDocument();
  });

  it("removes a scanned block when its Remove button is clicked", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    const { container } = render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    scanBarcode(screen.getByPlaceholderText("Scan block barcode..."), "A1");
    await screen.findByText("Scanned Blocks (1)");

    fireEvent.click(container.querySelector(".anticon-delete").closest("button"));

    expect(screen.getByText("Scanned Blocks (0)")).toBeInTheDocument();
  });

  it("shows a decal indicator icon for decal blocks in the scanned list", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    const { container } = render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    scanBarcode(screen.getByPlaceholderText("Scan block barcode..."), "A2");
    await screen.findByText("Scanned Blocks (1)");

    expect(container.querySelector(".anticon-experiment")).toBeInTheDocument();
  });

  it("disables Finish & Save until at least one block is scanned", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    render(<CreateEmbeddingRun onBack={vi.fn()} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: /Finish & Save/i })).toBeDisabled();
  });

  it("creates the run and batch-adds scanned blocks on Finish & Save", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    EmbeddingService.createRun.mockResolvedValue({ id: 55, run_no: "EMB-001" });
    EmbeddingService.batchAddBlocks.mockResolvedValue([]);
    const onBack = vi.fn();
    render(<CreateEmbeddingRun onBack={onBack} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    scanBarcode(screen.getByPlaceholderText("Scan block barcode..."), "A1");
    await screen.findByText("Scanned Blocks (1)");
    fireEvent.click(screen.getByRole("button", { name: /Finish & Save/i }));

    await waitFor(() =>
      expect(EmbeddingService.createRun).toHaveBeenCalledWith({ user_id: 7, station_id: "ST-01" }),
    );
    expect(EmbeddingService.batchAddBlocks).toHaveBeenCalledWith({ run_id: 55, block_ids: [101] });
    expect(await screen.findByText("Run EMB-001 saved successfully")).toBeInTheDocument();
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a generic error and does not navigate back when saving fails", async () => {
    EmbeddingService.getPendingBlocksTree.mockResolvedValue(tree());
    EmbeddingService.createRun.mockRejectedValue(new Error("network error"));
    const onBack = vi.fn();
    render(<CreateEmbeddingRun onBack={onBack} />);
    await waitFor(() => expect(EmbeddingService.getPendingBlocksTree).toHaveBeenCalledTimes(1));

    scanBarcode(screen.getByPlaceholderText("Scan block barcode..."), "A1");
    await screen.findByText("Scanned Blocks (1)");
    fireEvent.click(screen.getByRole("button", { name: /Finish & Save/i }));

    expect(await screen.findByText("Failed to save, please try again")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});
