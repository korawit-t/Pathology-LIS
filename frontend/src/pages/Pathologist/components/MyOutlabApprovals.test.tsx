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

const openReview = async () => {
  fireEvent.click((await screen.findByText("Review & Approve")).closest("button")!);
  return screen.findByRole("dialog");
};

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

  it("does not navigate to the case when the action button is clicked", async () => {
    const onSelectCase = vi.fn();
    render(<MyOutlabApprovals pathologistId={7} onSelectCase={onSelectCase} />);
    const dialog = await openReview();

    fireEvent.click(within(dialog).getByText("Approve").closest("button")!);
    await waitFor(() => expect(mockApprove).toHaveBeenCalled());

    expect(onSelectCase).not.toHaveBeenCalled();
  });
});
