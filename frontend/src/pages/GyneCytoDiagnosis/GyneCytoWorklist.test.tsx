import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import GyneCytoWorklist from "./GyneCytoWorklist";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import UserService from "../../services/userService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/gyneCytoCaseService", () => ({
  default: { getAll: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getCurrentUser: vi.fn() },
}));
vi.mock("../../services/systemSettingService", () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({
      enable_gyne_qc_system: true,
      nilm_review_every_n: 10,
    }),
  },
}));
vi.mock("../../services/holidayService", () => ({
  default: { getHolidayDateList: vi.fn().mockResolvedValue([]) },
}));

const mockGetAll = vi.mocked(GyneCytologyCaseService.getAll);
const mockGetCurrentUser = vi.mocked(UserService.getCurrentUser);

const PATHOLOGIST = { id: 7, roles: ["pathologist"] };

const qcCase = (id: number, accession: string, reason: string, reportAt: string) => ({
  id,
  accession_no: accession,
  status: "pending_review",
  needs_review: true,
  review_reason: reason,
  report_at: reportAt,
  hn: `HN${id}`,
  patient: { name: `Pt${id}`, ln: "Test" },
});

const MINE = [qcCase(1, "C26-00001", "random_10pct", "2026-10-18T09:00:00")];
// Unassigned pile: an older random NILM and a newer abnormal — the abnormal
// has to come first anyway.
const UNASSIGNED = [
  qcCase(2, "C26-00002", "random_10pct", "2026-10-15T09:00:00"),
  qcCase(3, "C26-00003", "abnormal", "2026-10-20T09:00:00"),
  qcCase(4, "C26-00004", "random_10pct", "2026-10-16T09:00:00"),
];

const list = (items: unknown[]) =>
  Promise.resolve({ items, total: items.length } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(PATHOLOGIST as never);
  mockGetAll.mockImplementation((params) => {
    if (params?.status === "pending_review" && params.pathologist_id === PATHOLOGIST.id) {
      return list(MINE);
    }
    if (params?.status === "pending_review" && params.pathologist_unassigned) {
      return list(UNASSIGNED);
    }
    return list([]);
  });
});

const segmented = (index: number) =>
  document.querySelectorAll<HTMLElement>(".ant-segmented")[index];

describe("GyneCytoWorklist — QC Review tab", () => {
  it("badges the QC Review tab with both piles combined", async () => {
    render(<GyneCytoWorklist onSelectCase={vi.fn()} standAlone={false} />);

    const tab = await screen.findByText("QC Review");
    await waitFor(() =>
      expect(within(tab.closest("label")!).getByText("4")).toBeInTheDocument(),
    );
  });

  it("lists my pile by pathologist_id, then the shared pile by pathologist_unassigned", async () => {
    render(<GyneCytoWorklist onSelectCase={vi.fn()} standAlone={false} />);

    fireEvent.click(await screen.findByText("QC Review"));

    expect(await screen.findByText("C26-00001")).toBeInTheDocument();
    expect(mockGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_review", pathologist_id: PATHOLOGIST.id, limit: 50 }),
    );

    fireEvent.click(within(segmented(1)).getByText("Unassigned"));

    expect(await screen.findByText("C26-00003")).toBeInTheDocument();
    expect(mockGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_review", pathologist_unassigned: true, limit: 50 }),
    );
    expect(screen.queryByText("C26-00001")).not.toBeInTheDocument();
  });

  it("puts abnormal cases first, then the longest-waiting", async () => {
    render(<GyneCytoWorklist onSelectCase={vi.fn()} standAlone={false} />);

    fireEvent.click(await screen.findByText("QC Review"));
    await screen.findByText("C26-00001");
    fireEvent.click(within(segmented(1)).getByText("Unassigned"));
    await screen.findByText("C26-00003");

    const order = Array.from(
      document.querySelectorAll(".ant-table-tbody tr.gyne-worklist-row"),
    ).map((row) => row.textContent?.match(/C26-\d+/)?.[0]);
    expect(order).toEqual(["C26-00003", "C26-00002", "C26-00004"]);
  });

  it("is not offered to a cytotechnologist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 9, roles: ["cytotechnologist"] } as never);
    render(<GyneCytoWorklist onSelectCase={vi.fn()} standAlone={false} />);

    expect(await screen.findByText("QC Slide Queue")).toBeInTheDocument();
    expect(screen.queryByText("QC Review")).not.toBeInTheDocument();
  });
});
