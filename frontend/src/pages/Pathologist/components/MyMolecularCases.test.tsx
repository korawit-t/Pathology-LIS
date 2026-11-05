import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyMolecularCases, { countMyMolecularBadge } from "./MyMolecularCases";
import { MolecularCaseService } from "../../../services/molecularCaseService";

vi.mock("../../../services/molecularCaseService", () => ({
  MolecularCaseService: { getAll: vi.fn(), count: vi.fn() },
}));
vi.mock("../../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span>{value}</span>,
}));

const mockGetAll = MolecularCaseService.getAll as ReturnType<typeof vi.fn>;
const mockCount = MolecularCaseService.count as ReturnType<typeof vi.fn>;

const USER_ID = 7;
const SCOPE = { assist_pathologist_id: USER_ID, include_unassigned: true };

/** 3 PDF received, 2 in-house, 9 still at the external lab. */
const countByBucket = ({ status, is_outlab }: { status: string; is_outlab?: boolean }) =>
  Promise.resolve(status === "pdf_received" ? 3 : is_outlab ? 9 : 2);

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  accession_no: "M26-00011",
  ap_test_id: 1,
  test_name: "EGFR Mutation Analysis",
  status: "pending",
  display_status: "pdf_received",
  is_outlab: true,
  registrar_id: 1,
  registered_at: "2026-11-01T09:00:00",
  assist_pathologist_id: USER_ID,
  assist_pathologist_name: "Dr. Somsak",
  is_print: false,
  is_cancelled: false,
  ...overrides,
});

describe("MyMolecularCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockCount.mockImplementation(countByBucket);
  });

  it("opens on PDF Received, scoped to this pathologist plus unassigned cases", async () => {
    render(<MyMolecularCases pathologistId={USER_ID} />);

    await waitFor(() =>
      expect(mockGetAll).toHaveBeenCalledWith(expect.objectContaining({ ...SCOPE, status: "pdf_received" })),
    );
  });

  it("labels each sub-filter with its count and reports only the actionable ones to the badge", async () => {
    const onCountChange = vi.fn();
    render(<MyMolecularCases pathologistId={USER_ID} onCountChange={onCountChange} />);

    expect(await screen.findByText("PDF Received (3)")).toBeInTheDocument();
    expect(screen.getByText("In-house (2)")).toBeInTheDocument();
    expect(screen.getByText("Awaiting External Lab (9)")).toBeInTheDocument();
    // External-lab cases wait on somebody else, so they stay out of the badge.
    expect(screen.getByText("5 awaiting sign-out")).toBeInTheDocument();
    expect(onCountChange).toHaveBeenCalledWith(5);
  });

  it("switches the query when another sub-filter is picked", async () => {
    render(<MyMolecularCases pathologistId={USER_ID} />);
    fireEvent.click(await screen.findByText("In-house (2)"));

    await waitFor(() =>
      expect(mockGetAll).toHaveBeenCalledWith(
        expect.objectContaining({ ...SCOPE, status: "pending", is_outlab: false }),
      ),
    );
  });

  it("opens the case on row click and marks unassigned cases", async () => {
    mockGetAll.mockResolvedValue([
      makeCase(),
      makeCase({ id: 12, accession_no: "M26-00012", assist_pathologist_id: null, assist_pathologist_name: null }),
    ]);
    const onSelectCase = vi.fn();
    render(<MyMolecularCases pathologistId={USER_ID} onSelectCase={onSelectCase} />);

    expect(await screen.findByText("Unassigned")).toBeInTheDocument();
    fireEvent.click(screen.getByText("M26-00011"));
    expect(onSelectCase).toHaveBeenCalledWith(11);
  });
});

describe("countMyMolecularBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockImplementation(countByBucket);
  });

  it("adds PDF Received and In-house, with the same scope the panel uses", async () => {
    expect(await countMyMolecularBadge(USER_ID)).toBe(5);
    expect(mockCount).toHaveBeenCalledWith({ ...SCOPE, status: "pdf_received" });
    expect(mockCount).toHaveBeenCalledWith({ ...SCOPE, status: "pending", is_outlab: false });
    expect(mockCount).not.toHaveBeenCalledWith(expect.objectContaining({ is_outlab: true }));
  });
});
