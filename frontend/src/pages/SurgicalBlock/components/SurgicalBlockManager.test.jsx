import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import SurgicalBlockManager from "./SurgicalBlockManager";
import SurgicalBlockService from "../../../services/surgicalBlockService";
import { BlockTimelineService } from "../../../services/blockTimelineService";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";

vi.mock("../../../services/surgicalBlockService", () => ({
  default: { getBlocks: vi.fn(), updateBlock: vi.fn(), createBlock: vi.fn(), deleteBlock: vi.fn() },
}));
vi.mock("../../../services/blockTimelineService", () => ({
  BlockTimelineService: { getTimeline: vi.fn() },
}));
vi.mock("../../../services/surgicalBlockStainService", () => ({
  default: { getOutlabRuns: vi.fn() },
}));
vi.mock("./BlockHistoryDrawer", () => ({
  default: (props) => (
    <div data-testid="history-drawer">
      {props.open ? `open:${props.blockId}:${props.blockCode}:${props.accessionNo}` : "closed"}
    </div>
  ),
}));

const block = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  block_code: "A1",
  specimen_label: "A",
  block_no: 1,
  specimen_name: "Breast biopsy",
  status: "processing",
  ...overrides,
});

const timeAgo = (minutes) => dayjs().subtract(minutes, "minute").toISOString();

const noEvents = () => {
  BlockTimelineService.getTimeline.mockResolvedValue([]);
  SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SurgicalBlockManager", () => {
  it("fetches the first page of blocks with the given search text on mount", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noEvents();
    render(<SurgicalBlockManager searchText="S26" refreshKey={0} />);

    await waitFor(() =>
      expect(SurgicalBlockService.getBlocks).toHaveBeenCalledWith({ skip: 0, limit: 20, search: "S26" }),
    );
    expect(await screen.findByText("S26-00001")).toBeInTheDocument();
  });

  it("re-fetches from page 1 when searchText changes", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noEvents();
    const { rerender } = render(<SurgicalBlockManager searchText="foo" refreshKey={0} />);
    await waitFor(() => expect(SurgicalBlockService.getBlocks).toHaveBeenCalledTimes(1));

    rerender(<SurgicalBlockManager searchText="bar" refreshKey={0} />);

    await waitFor(() =>
      expect(SurgicalBlockService.getBlocks).toHaveBeenCalledWith({ skip: 0, limit: 20, search: "bar" }),
    );
  });

  it("falls back to '-' for a missing accession number and to specimen_label+block_no for a missing block_code", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [block({ accession_no: null, block_code: null, specimen_label: "B", block_no: 2 })],
      total: 1,
    });
    noEvents();
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);

    await waitFor(() => expect(screen.getByText("-")).toBeInTheDocument());
    expect(screen.getByText("B2")).toBeInTheDocument();
  });

  it("falls back to the block's own status tag when there is no timeline or outlab activity", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block({ status: "processing" })], total: 1 });
    noEvents();
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);

    expect(await screen.findByText("Processing")).toBeInTheDocument();
  });

  it("shows the latest timeline event tag and its formatted date when not currently at outlab", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    BlockTimelineService.getTimeline.mockResolvedValue([
      { event_type: "GROSSED", label: "Grossed", event_at: timeAgo(120) },
    ]);
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([]);
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);

    expect(await screen.findByText("Grossed")).toBeInTheDocument();
  });

  it("shows the Sent to Outlab banner when the block is currently out and not yet returned", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    BlockTimelineService.getTimeline.mockResolvedValue([]);
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      {
        destination_lab: "RefLab",
        sent_at: timeAgo(60),
        status: "pending",
        received_at: null,
        details: [{ block_id: 1, stain_order: { test: { name: "HPV" } } }],
      },
    ]);
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);

    expect(await screen.findByText(/Sent to Outlab/)).toHaveTextContent("Sent to Outlab · RefLab");
  });

  it("shows the returned event instead of the outlab banner once the block has come back", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    BlockTimelineService.getTimeline.mockResolvedValue([]);
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      {
        destination_lab: "RefLab",
        sent_at: timeAgo(120),
        status: "received",
        received_at: timeAgo(30),
        details: [{ block_id: 1, stain_order: { test: { name: "HPV" } } }],
      },
    ]);
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);

    expect(await screen.findByText("Returned from Outlab")).toBeInTheDocument();
    expect(screen.queryByText(/Sent to Outlab/)).not.toBeInTheDocument();
  });

  it("opens the history drawer with the clicked row's details", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noEvents();
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByText("S26-00001").closest("tr"));

    expect(await screen.findByTestId("history-drawer")).toHaveTextContent("open:1:A1:S26-00001");
  });

  it("does not open the history drawer when clicking the row's Edit or Delete buttons", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noEvents();
    const { container } = render(<SurgicalBlockManager searchText="" refreshKey={0} />);
    await screen.findByText("S26-00001");

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));

    expect(screen.getByTestId("history-drawer")).toHaveTextContent("closed");
  });

  it("deletes a block after confirming, without opening the history drawer (regression: React portals bubble through the React tree, not the DOM tree)", async () => {
    // Popconfirm's popup is portaled to document.body, but it's still a
    // React child of the row, so a click on its "OK" button used to bubble
    // up to onRow.onClick just like a real click on the row itself — only
    // the trigger <Button> guarded with e.stopPropagation(), not the
    // Popconfirm's own OK/Cancel buttons. Confirmed in isolation with a
    // bare Popconfirm+onRow probe outside this component before fixing.
    // Fixed by also stopping propagation inside onConfirm.
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    SurgicalBlockService.deleteBlock.mockResolvedValue({});
    noEvents();
    const { container } = render(<SurgicalBlockManager searchText="" refreshKey={0} />);
    await screen.findByText("S26-00001");

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    expect(screen.getByTestId("history-drawer")).toHaveTextContent("closed");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(SurgicalBlockService.deleteBlock).toHaveBeenCalledWith(1));
    expect(screen.getByTestId("history-drawer")).toHaveTextContent("closed");
  });

  it("re-fetches with the new page and page size when pagination changes", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 50 });
    noEvents();
    render(<SurgicalBlockManager searchText="" refreshKey={0} />);
    await waitFor(() => expect(SurgicalBlockService.getBlocks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle("2"));

    await waitFor(() =>
      expect(SurgicalBlockService.getBlocks).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, limit: 20 }),
      ),
    );
  });

  it("still shows working Status dropdown options despite Option never being imported/destructured", async () => {
    // `Select` is imported from antd but there's no `const { Option } = Select;`
    // anywhere in this file (unlike PatientFormModal.jsx/PatientManager.jsx,
    // which both declare it). The bare `<Option>` tags here happen to
    // resolve to the native browser/DOM `Option` global (the legacy
    // `new Option(text, value)` HTMLOptionElement constructor) instead of
    // antd's Select.Option. antd logs a dev warning ("children should be
    // Select.Option...") but still builds working options from these
    // elements, because Select reads `.props.value`/`.props.children`
    // straight off the JSX element descriptors — it never actually invokes
    // `Option` as a component. So this works today, but only by a naming
    // coincidence with an unrelated DOM global, not a real import; it's
    // fragile against any future antd tightening, not a currently-broken
    // feature. Locking in the current (working) behavior here.
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [block()], total: 1 });
    noEvents();
    const { container } = render(<SurgicalBlockManager searchText="" refreshKey={0} />);
    await screen.findByText("S26-00001");

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    await screen.findByText("Edit Block");
    // Scope to the modal itself — the Table's pagination size-changer is
    // also an .ant-select elsewhere on the page and would otherwise match.
    const modalSelect = Array.from(document.querySelectorAll(".ant-select")).find((el) =>
      el.closest('[role="dialog"]'),
    );
    fireEvent.mouseDown(modalSelect);

    expect(await screen.findByTitle("Embedded")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Embedded"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(SurgicalBlockService.updateBlock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "embedded" }),
      ),
    );
  });
});
