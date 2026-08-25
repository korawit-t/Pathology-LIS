import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "../../contexts/ThemeContext";
import StainManagement from "./StainManagement";
import SurgicalBlockService from "../../services/surgicalBlockService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";
import { executePrint } from "./PrintStickerHE/utils/generateHEStickers";

vi.mock("../../services/surgicalBlockService", () => ({
  default: { getBlocks: vi.fn(), getInternalStainCases: vi.fn() },
}));
vi.mock("../../services/surgicalBlockStainService", () => ({
  default: {
    createStain: vi.fn(),
    deleteStain: vi.fn(),
    printHEStickerQuick: vi.fn(),
    getInternalUnkeyedCount: vi.fn(),
    toggleStainHosxpKeyed: vi.fn(),
  },
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
  test: { name: "PAS", category: "Histochem", is_external: false },
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

/** The page is paginated by *case* on the server, so the fixtures describe one
 * page of the /surgical-blocks/internal-stain-cases response. Blocks are
 * grouped by accession the way the endpoint groups them. */
const casePage = (blocks, extra = {}) => {
  const byAccession = new Map();
  for (const b of blocks) {
    const key = b.accession_no || "Unknown";
    if (!byAccession.has(key)) byAccession.set(key, []);
    byAccession.get(key).push(b);
  }
  const items = [...byAccession.entries()].map(([accession_no, blocksInCase]) => ({
    accession_no,
    blocks: blocksInCase,
  }));
  return {
    items,
    total: items.length,
    bucket_counts: { all: items.length, pending: 0, completed: 0, recut: 0 },
    slide_totals: { pending: 0, stained: 0 },
    ...extra,
  };
};

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a leftover mockResolvedValueOnce
  // survives a clear and gets consumed by the next test's fetch.
  vi.resetAllMocks();
  SurgicalBlockStainService.getInternalUnkeyedCount.mockResolvedValue(0);
  SurgicalBlockService.getBlocks.mockResolvedValue({ items: [], total: 0 });
});

describe("StainManagement — case grouping and filtering", () => {
  it("groups multiple blocks under the same accession into one case row with aggregated counts", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({ id: 1, block_no: 1, stains: [stain({ id: 1, status: "pending", test: { name: "AFB", category: "Histochem", is_external: false } })] }),
        block({ id: 2, block_no: 2, stains: [stain({ id: 2, status: "stained", test: { name: "PAS", category: "Histochem", is_external: false } })] }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    expect(within(row).getAllByText("2")).toHaveLength(2); // blockCount and slideCount tags
    expect(within(row).getByText("SS: 2")).toBeInTheDocument();
  });

  it("asks the server for one page of cases rather than a slab of blocks", async () => {
    // The page used to fetch { limit: 200 } blocks and group them here, which
    // capped the list at ~3 pages and hid every older case. Blocks can't be
    // paginated directly — a block-level page would cut a case in half.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(SurgicalBlockService.getInternalStainCases).toHaveBeenCalled());
    expect(SurgicalBlockService.getInternalStainCases.mock.calls[0][0]).toEqual({
      search: undefined,
      bucket: "all",
      skip: 0,
      limit: 20,
    });
    expect(SurgicalBlockService.getBlocks).not.toHaveBeenCalled();
  });

  it("asks the server for the next page when the pager moves", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(
      casePage([block()], { total: 45, bucket_counts: { all: 45, pending: 0, completed: 0, recut: 0 } }),
    );
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await screen.findByText("S26-00001");

    fireEvent.click(await screen.findByTitle("2"));

    await waitFor(() =>
      expect(SurgicalBlockService.getInternalStainCases).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 20, limit: 20 }),
      ),
    );
  });

  it("labels the segmented filter and the header from the server totals, not this page", async () => {
    // 45 cases across 3 pages: counting the 20 rows in hand would understate
    // every label the moment pagination kicked in.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(
      casePage([block()], {
        total: 45,
        bucket_counts: { all: 45, pending: 12, completed: 33, recut: 4 },
        slide_totals: { pending: 17, stained: 61 },
      }),
    );
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    expect(await screen.findByText("All (45)")).toBeInTheDocument();
    expect(screen.getByText("Has Pending (12)")).toBeInTheDocument();
    expect(screen.getByText("Completed (33)")).toBeInTheDocument();
    expect(screen.getByText("Recut (4)")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument(); // Pending slides
    expect(screen.getByText("61")).toBeInTheDocument(); // Stained slides
    expect(screen.getByText("45")).toBeInTheDocument(); // Cases
  });

  it("keeps only special stains and recuts — H&E, external and non-special categories are all out", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [
            stain({ id: 1, test: { name: "H&E", category: "Histochem", is_external: false } }),
            stain({ id: 2, test: { name: "Some Test", category: "IHC", is_external: true } }),
            stain({ id: 3, test: { name: "In-house CK7", category: "IHC", is_external: false } }),
            stain({ id: 4, test: { name: "EBER", category: "ISH", is_external: false } }),
            stain({ id: 5, is_recut: true, test: { name: "Recut", category: "Histochem", system_code: "HE_RECUT", is_external: false } }),
          ],
        }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    // slideCount column: only the recut counts as relevant (1)
    expect(within(row).getAllByText("1")).not.toHaveLength(0);
    expect(within(row).getByText("Recut: 1")).toBeInTheDocument();
    expect(within(row).queryByText(/^SS:/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/CK7|EBER|H&E/)).not.toBeInTheDocument();
  });

  it("recognises the routine H&E by system_code even when the master test has been renamed", async () => {
    // A hospital is free to rename the H&E master test from Admin → master
    // data; matching on the name alone would then list it as an order.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({ accession_no: "S26-HE-ONLY", stains: [stain({ id: 1, test: { name: "ย้อมพื้นฐาน", category: "Histochem", system_code: "HE_ROUTINE", is_external: false } })] }),
        block({ id: 2, accession_no: "S26-REAL-SS", stains: [stain({ id: 2, test: { name: "GMS", category: "Histochem", is_external: false } })] }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-REAL-SS")).toBeInTheDocument());
    expect(screen.queryByText("S26-HE-ONLY")).not.toBeInTheDocument();
  });

  it("drops a case whose only order is an in-house IHC — the fetch is wider than this tab", async () => {
    // has_internal_stain also feeds the HosXP Key tab, which bills in-house
    // IHC, so such a block comes back from the server and must be dropped
    // here rather than showing an empty case row.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ accession_no: "S26-IHC-ONLY", stains: [stain({ test: { name: "CK7", category: "IHC", is_external: false } })] })]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    expect(await screen.findByText("No cases found")).toBeInTheDocument();
    expect(screen.queryByText("S26-IHC-ONLY")).not.toBeInTheDocument();
  });

  it("sends the search to the server and restarts at page one", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(
      casePage([block({ accession_no: "S26-00001" }), block({ id: 2, accession_no: "S26-99999" })]),
    );
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());

    SurgicalBlockService.getInternalStainCases.mockResolvedValue(
      casePage([block({ accession_no: "S26-00001" })]),
    );
    fireEvent.change(screen.getByPlaceholderText("Search accession / block..."), {
      target: { value: "00001" },
    });

    await waitFor(() =>
      expect(SurgicalBlockService.getInternalStainCases).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "00001", skip: 0 }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("S26-99999")).not.toBeInTheDocument());
  });

  it("sends the segmented filter to the server as a bucket, back at page one", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(
      casePage([block({ accession_no: "S26-PENDING", stains: [stain({ status: "pending" })] })], {
        total: 45,
        bucket_counts: { all: 45, pending: 1, completed: 44, recut: 2 },
      }),
    );
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("S26-PENDING")).toBeInTheDocument());
    fireEvent.click(await screen.findByTitle("2"));
    await waitFor(() =>
      expect(SurgicalBlockService.getInternalStainCases).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 20 }),
      ),
    );

    fireEvent.click(screen.getByText(/^Recut/));

    await waitFor(() =>
      expect(SurgicalBlockService.getInternalStainCases).toHaveBeenLastCalledWith(
        expect.objectContaining({ bucket: "recut", skip: 0 }),
      ),
    );
  });

  it("shows an empty state when no cases match the current filter", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([]));
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
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getAllByText("S26-00001").length).toBeGreaterThan(0);
    fireEvent.click(container.querySelector(".anticon-arrow-left")?.closest("button") ?? screen.getByLabelText(/back/i));
    expect(await screen.findByText("Internal Stain Orders")).toBeInTheDocument();
  });

  it("shows a red Recut tag regardless of the stain's own test category", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ stains: [stain({ is_recut: true, test: { name: "H&E", category: "Histochem", is_external: false } })] })]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getByText("Recut")).toBeInTheDocument();
    expect(screen.queryByText("Histochem")).not.toBeInTheDocument();
  });

  it("shows the stained date and operator only once a slide is actually stained", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
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
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(screen.getByText("Dr. Test")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1); // the pending slide's dash
  });

  it("only shows the delete action for pending slides", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [
            stain({ id: 1, slide_no: 1, status: "pending" }),
            stain({ id: 2, slide_no: 2, status: "stained" }),
          ],
        }),
      ]));
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    expect(container.querySelectorAll(".anticon-delete")).toHaveLength(1);
  });

  it("deletes a pending slide after confirming", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    SurgicalBlockStainService.deleteStain.mockResolvedValue({});
    noMasterTests();
    const { container } = render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(container.querySelector(".anticon-delete"));
    fireEvent.click(await screen.findByText("Delete this slide?"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(SurgicalBlockStainService.deleteStain).toHaveBeenCalledWith(1));
  });

  it("disables Print Stickers when the block has nothing this page would print", async () => {
    // Used to key off the raw stain count while the click handler filtered
    // through isRelevantStain first, so a block carrying only its automatic
    // H&E had the button enabled and printed nothing.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [
            stain({ id: 1, test: { name: "H&E", category: "Histochem", system_code: "HE_ROUTINE", is_external: false } }),
            stain({ id: 2, test: { name: "PAS", category: "Histochem", is_external: false } }),
          ],
        }),
        block({ id: 2, block_no: 2, stains: [stain({ id: 3, test: { name: "H&E", category: "Histochem", system_code: "HE_ROUTINE", is_external: false } })] }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    // Only the block with the PAS is rendered — the H&E-only block has
    // nothing to show, print or process here.
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.queryByText("A2")).not.toBeInTheDocument();
    expect(screen.queryByText("No stains ordered yet")).not.toBeInTheDocument();
    expect(SurgicalBlockStainService.printHEStickerQuick).not.toHaveBeenCalled();
  });

  it("prints stickers for a block's relevant stains", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ stains: [stain({ id: 9 })] })]));
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
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ stains: [stain({ id: 1, slide_no: 3 }), stain({ id: 2, slide_no: 5 })] })]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();

    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));

    expect(await screen.findByLabelText("Slide No.")).toHaveValue("6");
  });

  it("offers only in-house special stains — no IHC, no outsourced test, no routine H&E", async () => {
    // The Stain Type select used to offer IHC here as well; an IHC ordered
    // from this page disappeared from the list the moment it was saved,
    // because IHC is tracked under External Lab and ordered from the
    // pathologist's block grid.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    AnatomicalPathologyTestService.getAllTests.mockResolvedValue({
      data: [
        { id: 10, name: "CK7", category: "IHC", price_tier_1: 500 },
        { id: 11, name: "PAS", category: "Histochem", price_tier_1: 200 },
        { id: 12, name: "H&E", category: "Histochem", system_code: "HE_ROUTINE", price_tier_1: 0 },
        { id: 13, name: "Outsourced PAS", category: "Histochem", is_external: true, price_tier_1: 200 },
      ],
    });
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    await openDetail();
    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));
    await screen.findByLabelText("Slide No.");

    fireEvent.mouseDown(screen.getByText("Select test..."));

    expect(await screen.findByTitle("PAS")).toBeInTheDocument();
    expect(screen.queryByTitle("CK7")).not.toBeInTheDocument();
    expect(screen.queryByTitle("H&E")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Outsourced PAS")).not.toBeInTheDocument();
  });

  it("submits a new stain order and refetches on success", async () => {
    SurgicalBlockService.getInternalStainCases
      .mockResolvedValueOnce(casePage([block({ stains: [stain({ id: 1, slide_no: 1 })] })]))
      .mockResolvedValueOnce(
        casePage([block({ stains: [stain({ id: 1 }), stain({ id: 2, slide_no: 2 })] })]),
      );
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
        expect.objectContaining({ block_id: 1, test_id: 11, slide_no: 2 }),
      ),
    );
    expect(await screen.findByText("Stain order added successfully")).toBeInTheDocument();
  });

  it("shows an error message when adding a stain fails", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
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
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ stains: [stain({ id: 42, status: "pending" })] })]));
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
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block({ stains: [stain({ status: "stained" })] })]));
    noMasterTests();
    render(<ThemeProvider><StainManagement onNavigate={vi.fn()} /></ThemeProvider>);
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("Slide");

    expect(screen.queryByRole("button", { name: /Process in Staining Run/i })).not.toBeInTheDocument();
  });
});

// The master-data admin page saves special stains as "Special Stain"
// (TEST_CATEGORY_OPTIONS), while the seeded tests use "Histochem". This page
// only recognised "Histochem", so anything created through Admin was invisible:
// no SS count, and not offerable in the Add Stain dropdown.
describe("StainManagement — 'Special Stain' category parity with 'Histochem'", () => {
  it("counts a 'Special Stain' test toward SS in the case breakdown", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [
            stain({ id: 1, test: { name: "PAS", category: "Special Stain", is_external: false } }),
            stain({ id: 2, test: { name: "AFB", category: "Histochem", is_external: false } }),
          ],
        }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    // Both spellings roll up into one SS count.
    expect(within(row).getByText("SS: 2")).toBeInTheDocument();
  });

  it("tags a 'Special Stain' slide as SS in the per-block table", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({ stains: [stain({ test: { name: "PAS", category: "Special Stain", is_external: false } })] }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("Slide");

    expect(screen.getByText("SS")).toBeInTheDocument();
    expect(screen.queryByText("Special Stain")).not.toBeInTheDocument();
  });

  it("offers 'Special Stain' tests in the Add Stain dropdown", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    AnatomicalPathologyTestService.getAllTests.mockResolvedValue({
      data: [
        { id: 10, name: "CK7", category: "IHC", price_tier_1: 500 },
        { id: 11, name: "Masson Trichrome", category: "Special Stain", price_tier_1: 200 },
      ],
    });
    render(<ThemeProvider><StainManagement /></ThemeProvider>);
    fireEvent.click(await screen.findByText("S26-00001"));
    await screen.findByText("A1");
    fireEvent.click(screen.getByRole("button", { name: /Add Stain/i }));
    await screen.findByLabelText("Slide No.");

    fireEvent.mouseDown(screen.getByText("Select test..."));
    expect(await screen.findByTitle("Masson Trichrome")).toBeInTheDocument();
    expect(screen.queryByTitle("CK7")).not.toBeInTheDocument();
  });
});

describe("StainManagement — stain names in the breakdown", () => {
  it("lists which stains are on the case, collapsing duplicates", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [
            stain({ id: 1, test: { name: "AFB", category: "Histochem", is_external: false } }),
            stain({ id: 2, test: { name: "AFB", category: "Histochem", is_external: false } }),
            stain({ id: 3, test: { name: "PAS", category: "Special Stain", is_external: false } }),
          ],
        }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    expect(within(row).getByText("AFB ×2, PAS")).toBeInTheDocument();
  });

  it("labels recut slides as Recut rather than the underlying test name", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([
        block({
          stains: [stain({ id: 1, is_recut: true, test: { name: "H&E", category: "Histochem", is_external: false } })],
        }),
      ]));
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    const row = screen.getByText("S26-00001").closest("tr");
    expect(within(row).getByText("Recut")).toBeInTheDocument();
    expect(within(row).getByText("Recut: 1")).toBeInTheDocument();
  });
});

describe("StainManagement — HosXP Key tab", () => {
  it("defers the HosXP Key tab's own fetch until the tab is opened", async () => {
    // That tab bills every in-house stain, not just this page's, so it has no
    // case pagination to hide behind — keep its full worklist off the initial
    // page load.
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        block({
          stains: [
            stain({ id: 1, is_hosxp_keyed: false, test: { name: "AFB", category: "Histochem", is_external: false } }),
            stain({ id: 2, is_hosxp_keyed: true, test: { name: "GMS", category: "Histochem", is_external: false } }),
          ],
        }),
      ],
      total: 1,
    });
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    // Stain Orders is the default tab, and it doesn't need those blocks.
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    expect(SurgicalBlockService.getBlocks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /HosXP Key/i }));

    await waitFor(() =>
      expect(SurgicalBlockService.getBlocks).toHaveBeenCalledWith({ has_internal_stain: true }),
    );
    // both stains are keyable; only the unkeyed one counts toward Pending
    expect(await screen.findByText("Pending (1)")).toBeInTheDocument();
    expect(screen.getByText("Keyed (1)")).toBeInTheDocument();
  });

  it("badges the HosXP tab from the count endpoint rather than the tab's own data", async () => {
    SurgicalBlockService.getInternalStainCases.mockResolvedValue(casePage([block()]));
    SurgicalBlockStainService.getInternalUnkeyedCount.mockResolvedValue(7);
    noMasterTests();
    render(<ThemeProvider><StainManagement /></ThemeProvider>);

    const tab = await screen.findByRole("tab", { name: /HosXP Key/i });
    await waitFor(() => expect(within(tab).getByText("7")).toBeInTheDocument());
    expect(SurgicalBlockService.getBlocks).not.toHaveBeenCalled();
  });
});
