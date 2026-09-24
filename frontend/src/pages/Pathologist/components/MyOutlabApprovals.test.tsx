import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import MyOutlabApprovals from "./MyOutlabApprovals";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";

vi.mock("../../../services/gyneCytoCaseService", () => ({
  default: {
    getAll: vi.fn(),
    downloadOutlabTestResult: vi.fn(),
    approveOutlabTestResult: vi.fn(),
  },
}));

const mockGetAll = GyneCytologyCaseService.getAll as ReturnType<typeof vi.fn>;
const mockDownload = GyneCytologyCaseService.downloadOutlabTestResult as ReturnType<typeof vi.fn>;
const mockApprove = GyneCytologyCaseService.approveOutlabTestResult as ReturnType<typeof vi.fn>;

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  accession_no: "C26-00042",
  hn: "123456",
  patient: { title: { title: "Ms." }, name: "Jane", ln: "Doe" },
  registered_at: "2026-09-01T08:00:00",
  out_lab_result_uploaded_at: "2026-09-10T08:00:00",
  ...overrides,
});

const openReview = async (row = 0) => {
  await screen.findAllByText("Review & Approve");
  fireEvent.click(screen.getAllByText("Review & Approve")[row].closest("button")!);
  return screen.findByRole("dialog");
};

const approveAndNextButton = (dialog: HTMLElement) =>
  within(dialog).getByText("Approve & Next").closest("button")!;

// Cases 1..n, accession C26-0000<id>.
const makeCases = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) =>
    makeCase({ id: from + i, accession_no: `C26-${String(from + i).padStart(5, "0")}` }));

describe("MyOutlabApprovals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAll.mockResolvedValue({ items: [makeCase()], total: 1 });
    mockDownload.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
    mockApprove.mockResolvedValue({});
    globalThis.URL.createObjectURL = vi.fn(() => "blob:outlab-pdf");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("opens the result PDF with the case identified, without approving yet", async () => {
    render(<MyOutlabApprovals pathologistId={7} />);
    const dialog = await openReview();

    expect(mockDownload).toHaveBeenCalledWith(42);
    expect(dialog.querySelector("iframe")?.getAttribute("src")).toContain("blob:outlab-pdf");
    expect(within(dialog).getByText("C26-00042")).toBeInTheDocument();
    expect(within(dialog).getByText(/Ms\. Jane Doe/)).toBeInTheDocument();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("approves from inside the preview, then closes it and refreshes the worklist", async () => {
    const onCountChange = vi.fn();
    render(<MyOutlabApprovals pathologistId={7} onCountChange={onCountChange} />);
    const dialog = await openReview();

    mockGetAll.mockResolvedValue({ items: [], total: 0 });
    fireEvent.click(within(dialog).getByText("Approve").closest("button")!);

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(42));
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));
    // jsdom never finishes antd's leave animation, so the node stays mounted
    // with its leave class — that class is what "closed" looks like here.
    await waitFor(() => expect(dialog.className).toContain("-leave"));
  });

  it("keeps the preview open when approval fails so it can be retried", async () => {
    mockApprove.mockRejectedValue(new Error("boom"));
    render(<MyOutlabApprovals pathologistId={7} />);
    const dialog = await openReview();

    fireEvent.click(within(dialog).getByText("Approve").closest("button")!);

    expect(await screen.findByText("Failed to approve result")).toBeInTheDocument();
    expect(dialog.className).not.toContain("-leave");
    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  describe("Approve & Next", () => {
    it("approves, then loads the following case into the same preview", async () => {
      mockGetAll.mockResolvedValue({ items: makeCases(3), total: 3 });
      render(<MyOutlabApprovals pathologistId={7} />);
      const dialog = await openReview(0);

      mockGetAll.mockResolvedValue({ items: makeCases(2, 2), total: 2 });
      fireEvent.click(approveAndNextButton(dialog));

      await waitFor(() => expect(within(dialog).getByText("C26-00002")).toBeInTheDocument());
      expect(mockApprove).toHaveBeenCalledWith(1);
      expect(mockDownload).toHaveBeenLastCalledWith(2);
      expect(dialog.className).not.toContain("-leave");
    });

    it("pulls the next case up from the following page when approving the page's last row", async () => {
      mockGetAll.mockResolvedValue({ items: makeCases(20), total: 21 });
      render(<MyOutlabApprovals pathologistId={7} />);
      const dialog = await openReview(19);
      expect(within(dialog).getByText("C26-00020")).toBeInTheDocument();

      // Case 20 approved: page 1 is now cases 1–19 plus case 21 slid up.
      mockGetAll.mockResolvedValue({ items: [...makeCases(19), ...makeCases(1, 21)], total: 20 });
      fireEvent.click(approveAndNextButton(dialog));

      await waitFor(() => expect(within(dialog).getByText("C26-00021")).toBeInTheDocument());
      expect(mockApprove).toHaveBeenCalledWith(20);
      expect(mockDownload).toHaveBeenLastCalledWith(21);
    });

    it("is disabled on the last case awaiting sign-off", async () => {
      mockGetAll.mockResolvedValue({ items: makeCases(2), total: 2 });
      render(<MyOutlabApprovals pathologistId={7} />);

      const first = await openReview(0);
      expect(approveAndNextButton(first)).toBeEnabled();

      fireEvent.click(within(first).getByText("Cancel").closest("button")!);
      const last = await openReview(1);
      expect(within(last).getByText("C26-00002")).toBeInTheDocument();
      expect(approveAndNextButton(last)).toBeDisabled();
    });

    it("closes instead of leaving the approved case up when the next PDF won't load", async () => {
      mockGetAll.mockResolvedValue({ items: makeCases(2), total: 2 });
      render(<MyOutlabApprovals pathologistId={7} />);
      const dialog = await openReview(0);

      mockGetAll.mockResolvedValue({ items: makeCases(1, 2), total: 1 });
      mockDownload.mockRejectedValueOnce(new Error("404"));
      fireEvent.click(approveAndNextButton(dialog));

      expect(await screen.findByText("Failed to load PDF")).toBeInTheDocument();
      expect(mockApprove).toHaveBeenCalledWith(1);
      await waitFor(() => expect(dialog.className).toContain("-leave"));
    });
  });

  it("steps back a page instead of showing an empty one after approving a later page's only row", async () => {
    // 21 cases: page 1 = cases 1–20, page 2 = case 21. After case 21 is
    // approved there are 20, so page 2 no longer exists.
    let approved = false;
    mockGetAll.mockImplementation(async ({ skip }: { skip: number }) => {
      const all = approved ? makeCases(20) : makeCases(21);
      return { items: all.slice(skip, skip + 20), total: all.length };
    });
    mockApprove.mockImplementation(async () => { approved = true; return {}; });
    render(<MyOutlabApprovals pathologistId={7} />);
    await screen.findByText("C26-00001");

    fireEvent.click(screen.getByTitle("2"));
    // Wait for page 2's row to actually render before opening the dialog.
    // openReview only waits for *a* "Review & Approve" button, and page 1's 20
    // of them are still mounted while the skip:20 fetch is in flight — so
    // without this it could open page 1's first row instead (flaky under CI's
    // slower scheduling; it passed locally because the fetch resolved first).
    await screen.findByText("C26-00021");
    const dialog = await openReview(0);
    expect(within(dialog).getByText("C26-00021")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Approve").closest("button")!);

    await waitFor(() => expect(mockGetAll).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 })));
    expect(await screen.findByText("C26-00001")).toBeInTheDocument();
  });

  it("does not navigate to the case when the action button is clicked", async () => {
    const onSelectCase = vi.fn();
    render(<MyOutlabApprovals pathologistId={7} onSelectCase={onSelectCase} />);
    const dialog = await openReview();

    fireEvent.click(within(dialog).getByText("Approve").closest("button")!);
    await waitFor(() => expect(mockApprove).toHaveBeenCalled());

    expect(onSelectCase).not.toHaveBeenCalled();
  });
});
