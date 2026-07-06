import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "../../contexts/ThemeContext";
import StainManagement from "./StainManagement";
import SurgicalBlockService from "../../services/surgicalBlockService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";
import { executePrint } from "./PrintStickerHE/utils/generateHEStickers";

vi.mock("../../services/surgicalBlockService", () => ({
  default: { getBlocks: vi.fn() },
}));
vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { createStain: vi.fn(), deleteStain: vi.fn(), printHEStickerQuick: vi.fn() },
}));
vi.mock("../../services/anatomicalTestService", () => ({
  default: { getAllTests: vi.fn() },
}));
vi.mock("./PrintStickerHE/utils/generateHEStickers", () => ({
  executePrint: vi.fn(),
}));

const stain = (overrides = {}) => ({
  id: 1,
  slide_no: 1,
  status: "pending",
  is_recut: false,
  recut_note: null,
  is_printed: false,
  updated_at: null,
  stained_by: null,
  test: { name: "CK7", category: "IHC", is_external: false },
  ...overrides,
});

const block = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  specimen_label: "A",
  block_no: 1,
  is_decal: false,
  stains: [stain()],
  ...overrides,
});

const noMasterTests = () => AnatomicalPathologyTestService.getAllTests.mockResolvedValue({ data: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StainManagement — case grouping and filtering", () => {
  it("groups multiple blocks under the same accession into one case row with aggregated counts", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({ id: 1, block_no: 1, stains: [stain({ id: 1, status: "pending", test: { name: "CK7", category: "IHC", is_external: false } })] }),
        block({ id: 2, block_no: 2, stains: [stain({ id: 2, status: "stained", test: { name: "PAS", category: "Histochem", is_external: false } })] }),
      ],
      total: 2,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    expect(within(row).getAllByText("2")).toHaveLength(2); // blockCount and slideCount tags
    expect(within(row).getByText("IHC: 1")).toBeInTheDocument();
    expect(within(row).getByText("SS: 1")).toBeInTheDocument();
  });

  it("excludes H&E and external stains from every count via isRelevantStain, but always includes recuts", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({
          stains: [
            stain({ id: 1, test: { name: "H&E", category: "Histochem", is_external: false } }),
            stain({ id: 2, test: { name: "Some Test", category: "IHC", is_external: true } }),
            stain({ id: 3, is_recut: true, test: { name: "H&E", category: "Histochem", is_external: false } }),
          ],
        }),
      ],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    // slideCount column: only the recut counts as relevant (1), not the H&E or external one
    expect(within(row).getAllByText("1")).not.toHaveLength(0);
    expect(within(row).queryByText("2")).not.toBeInTheDocument();
  });

  it("filters the case list by accession number or specimen label (case-insensitive)", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ accession_no: "S26-00001" }), block({ id: 2, accession_no: "S26-99999" })],
      total: 2,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search accession / block..."), { target: { value: "00001" } });

    expect(screen.queryByText("S26-99999")).not.toBeInTheDocument();
    expect(screen.getByText("S26-00001")).toBeInTheDocument();
  });

  it("switches between All / Has Pending / Completed / Recut tabs", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({ accession_no: "S26-PENDING", stains: [stain({ id: 1, status: "pending" })] }),
        block({ id: 2, accession_no: "S26-DONE", stains: [stain({ id: 2, status: "stained" })] }),
        block({ id: 3, accession_no: "S26-RECUT", stains: [stain({ id: 3, is_recut: true, status: "pending" })] }),
      ],
      total: 3,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("S26-PENDING")).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Completed/));
    expect(screen.getByText("S26-DONE")).toBeInTheDocument();
    expect(screen.queryByText("S26-PENDING")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Recut/));
    expect(screen.getByText("S26-RECUT")).toBeInTheDocument();
    expect(screen.queryByText("S26-DONE")).not.toBeInTheDocument();
  });

  it("shows an empty state when no cases match the current filter", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [], total: 0 });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    expect(await screen.findByText("No cases found")).toBeInTheDocument();
  });
});

describe("StainManagement — detail view", () => {
  const openDetail = async () => {
    fireEvent.click(await screen.findByText("S26-00001"));
    // Wait for the block's own tag (always rendered) rather than "Slide",
    // since a block with zero relevant stains never renders that column
    // header at all — it shows "No stains ordered yet" instead.
    await screen.findByText("A1");
  };

  it("opens the detail view for a case and returns to the list via the back button", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getAllByText("S26-00001").length).toBeGreaterThan(0);
    fireEvent.click(container.querySelector(".anticon-arrow-left")?.closest("button") ?? screen.getByLabelText(/back/i));
    expect(await screen.findByText("Internal Stain Orders")).toBeInTheDocument();
  });

  it("shows a red Recut tag regardless of the stain's own test category", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ stains: [stain({ is_recut: true, test: { name: "H&E", category: "Histochem", is_external: false } })] })],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getByText("Recut")).toBeInTheDocument();
    expect(screen.queryByText("Histochem")).not.toBeInTheDocument();
  });

  it("shows the stained date and operator only once a slide is actually stained", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({
          stains: [
            stain({ id: 1, slide_no: 1, status: "pending" }),
            stain({
              id: 2,
              slide_no: 2,
              status: "stained",
              updated_at: "2026-01-15T10:30:00Z",
              stained_by: { full_name: "Dr. Test" },
            }),
          ],
        }),
      ],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getByText("Dr. Test")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1); // the pending slide's dash
  });

  it("only shows the delete action for pending slides", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({
          stains: [
            stain({ id: 1, slide_no: 1, status: "pending" }),
            stain({ id: 2, slide_no: 2, status: "stained" }),
          ],
        }),
      ],
      total: 1,
    });
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(container.querySelectorAll(".anticon-delete")).toHaveLength(1);
  });

  it("deletes a pending slide after confirming", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    SurgicalBlockStainService.deleteStain.mockResolvedValue({});
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(container.querySelector(".anticon-delete"));
    fireEvent.click(await screen.findByText("Delete this slide?"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(SurgicalBlockStainService.deleteStain).toHaveBeenCalledWith(1));
  });

  it("BUG-ish: Print Stickers stays enabled for a block whose only stain is filtered out (H&E), then warns and prints nothing when clicked", async () => {
    // Print Stickers' disabled check is `!(block.stains?.length > 0)` — raw
    // stain count — while the click handler filters through
    // isRelevantStain first and warns if that filtered list is empty. A
    // fresh block with only its automatic H&E stain (1 raw, 0 relevant,
    // the common state right after grossing) has the button enabled but
    // produces a no-op + warning when clicked.
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ stains: [stain({ test: { name: "H&E", category: "Histochem", is_external: false } })] })],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    // Not using the shared openDetail() helper: this block's only stain is
    // H&E, so isRelevantStain filters it out and BlockTable never renders
    // the "Slide" column header at all — it shows "No stains ordered yet"
    // instead, which is exactly the state this test needs.
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("No stains ordered yet");

    const printButton = screen.getByRole("button", { name: /Print Stickers/i });
    expect(printButton).toBeEnabled();
    fireEvent.click(printButton);

    expect(await screen.findByText("No stains to print")).toBeInTheDocument();
    expect(SurgicalBlockStainService.printHEStickerQuick).not.toHaveBeenCalled();
  });

  it("prints stickers for a block's relevant stains", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block({ stains: [stain({ id: 9 })] })], total: 1 });
    SurgicalBlockStainService.printHEStickerQuick.mockResolvedValue(new Blob());
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(screen.getByRole("button", { name: /Print Stickers/i }));

    await waitFor(() => expect(SurgicalBlockStainService.printHEStickerQuick).toHaveBeenCalledWith([9]));
    expect(executePrint).toHaveBeenCalled();
    expect(await screen.findByText(/Printing 1 sticker/)).toBeInTheDocument();
  });
});

describe("StainManagement — Add Stain modal", () => {
  const openDetail = async () => {
    fireEvent.click(await screen.findByText("S26-00001"));
    // Wait for the block's own tag (always rendered) rather than "Slide",
    // since a block with zero relevant stains never renders that column
    // header at all — it shows "No stains ordered yet" instead.
    await screen.findByText("A1");
  };

  it("pre-fills the next slide number as one past the highest existing slide", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ stains: [stain({ id: 1, slide_no: 3 }), stain({ id: 2, slide_no: 5 })] })],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));

    expect(await screen.findByLabelText("Slide No.")).toHaveValue("6");
  });

  it("defaults the next slide number to 1 for a block with no stains yet", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block({ stains: [] })], total: 1 });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));

    expect(await screen.findByLabelText("Slide No.")).toHaveValue("1");
  });

  it("filters the test dropdown by stain type and auto-selects the first matching test", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    AnatomicalPathologyTestService.getAllTests.mockResolvedValue({
      data: [
        { id: 10, name: "CK7", category: "IHC", price_tier_1: 500 },
        { id: 11, name: "PAS", category: "Histochem", price_tier_1: 200 },
      ],
    });
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();
    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));
    await screen.findByLabelText("Slide No.");

    // Exactly two <Select>s exist here (Stain Type, then Test) — the list
    // view's own Select (pagination size-changer) isn't mounted while
    // we're in the detail view, so DOM order is unambiguous.
    const selects = () => document.querySelectorAll(".ant-select");

    // default stain_type is "Special stain" -> Histochem tests only
    fireEvent.mouseDown(selects()[1]);
    expect(await screen.findByTitle("PAS")).toBeInTheDocument();
    expect(screen.queryByTitle("CK7")).not.toBeInTheDocument();

    fireEvent.mouseDown(selects()[0]);
    fireEvent.click(await screen.findByTitle("IHC"));

    // CK7 is now auto-selected as the default test_id for IHC, so its title
    // appears both as the Select's current-value display *and* as the
    // matching dropdown option — scope to the dropdown to disambiguate.
    fireEvent.mouseDown(selects()[1]);
    const dropdown = await waitFor(() => document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)"));
    expect(within(dropdown).getByTitle("CK7")).toBeInTheDocument();
    expect(within(dropdown).queryByTitle("PAS")).not.toBeInTheDocument();
  });

  it("submits a new stain order and refetches on success", async () => {
    SurgicalBlockService.getBlocks
      .mockResolvedValueOnce({ items: [block({ stains: [] })], total: 1 })
      .mockResolvedValueOnce({ items: [block({ stains: [stain()] })], total: 1 });
    AnatomicalPathologyTestService.getAllTests.mockResolvedValue({
      data: [{ id: 11, name: "PAS", category: "Histochem", price_tier_1: 200 }],
    });
    SurgicalBlockStainService.createStain.mockResolvedValue({});
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();
    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));
    await screen.findByLabelText("Slide No.");

    fireEvent.mouseDown(screen.getByText("Select test..."));
    fireEvent.click(await screen.findByTitle("PAS"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(SurgicalBlockStainService.createStain).toHaveBeenCalledWith(
        expect.objectContaining({ block_id: 1, stain_type: "Special stain", test_id: 11, slide_no: 1 }),
      ),
    );
    expect(await screen.findByText("Stain order added successfully")).toBeInTheDocument();
  });

  it("shows an error message when adding a stain fails", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block({ stains: [] })], total: 1 });
    AnatomicalPathologyTestService.getAllTests.mockResolvedValue({
      data: [{ id: 11, name: "PAS", category: "Histochem", price_tier_1: 200 }],
    });
    SurgicalBlockStainService.createStain.mockRejectedValue(new Error("fail"));
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();
    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));
    await screen.findByLabelText("Slide No.");

    fireEvent.mouseDown(screen.getByText("Select test..."));
    fireEvent.click(await screen.findByTitle("PAS"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Failed to add stain order")).toBeInTheDocument();
  });
});

describe("StainManagement — Process in Staining Run", () => {
  it("stores pending stain ids and navigates to the staining run when processing from the detail view", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ stains: [stain({ id: 42, status: "pending" })] })],
      total: 1,
    });
    noMasterTests();
    const onNavigate = vi.fn();
    render(<ThemeProvider><StainManagement onNavigate={onNavigate} /></ThemeProvider>);
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("Slide");

    fireEvent.click(screen.getByRole("button", { name: /Process in Staining Run/i }));

    expect(JSON.parse(localStorage.getItem("stainrun_preselect"))).toEqual([42]);
    expect(onNavigate).toHaveBeenCalledWith("staining-run");
    expect(await screen.findByText("Internal Stain Orders")).toBeInTheDocument(); // back to list
  });

  it("does not show the Process in Staining Run button when nothing is pending", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ stains: [stain({ status: "stained" })] })],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement onNavigate={vi.fn()} /></ThemeProvider>);
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("Slide");

    expect(screen.queryByRole("button", { name: /Process in Staining Run/i })).not.toBeInTheDocument();
  });
});
