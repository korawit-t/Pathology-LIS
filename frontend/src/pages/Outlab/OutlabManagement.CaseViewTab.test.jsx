import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CaseViewTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../services/surgicalCaseService";

vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { getOutlabRuns: vi.fn(), receiveOutlabRunDetails: vi.fn() },
}));
vi.mock("../../services/surgicalCaseService", () => ({ default: { getCases: vi.fn() } }));

const detail = (overrides = {}) => ({
  id: 100,
  accession_no: "S26-00002",
  block_code: "A1",
  received_at: null,
  stain_order: { test: { name: "HPV" } },
  ...overrides,
});

const run = (overrides = {}) => ({
  id: 1,
  run_no: "OUT-001",
  destination_lab: "Ref Lab",
  sent_at: "2026-01-10T10:00:00Z",
  status: "sent",
  details: [detail()],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  SurgicalCaseService.getCases.mockResolvedValue({ items: [] });
});

describe("CaseViewTab", () => {
  it("sorts rows by accession_no then block_code", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({
        id: 1,
        details: [
          detail({ id: 1, accession_no: "S26-00002", block_code: "A2" }),
          detail({ id: 2, accession_no: "S26-00001", block_code: "A1" }),
          detail({ id: 3, accession_no: "S26-00002", block_code: "A1" }),
        ],
      }),
    ]);
    render(<CaseViewTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("3 stain item(s)")).toBeInTheDocument());

    // Confirm rows are ordered by accession_no then block_code.
    const accessionCells = screen.getAllByText(/S26-0000\d/).map((el) => el.textContent);
    expect(accessionCells).toEqual(["S26-00001", "S26-00002", "S26-00002"]);

    const blockCells = screen.getAllByText(/^A\d$/).map((el) => el.textContent);
    expect(blockCells).toEqual(["A1", "A1", "A2"]); // S26-00001/A1, S26-00002/A1, S26-00002/A2
  });

  it("filters by search across accession_no, hn, and patient_name", async () => {
    SurgicalCaseService.getCases.mockImplementation(({ search }) =>
      Promise.resolve(
        search === "S26-00002"
          ? { items: [{ hn: "HN-999", patient: { name: "Somchai", ln: "Jaidee" } }] }
          : { items: [] },
      ),
    );
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({ details: [detail({ id: 1, accession_no: "S26-00001" }), detail({ id: 2, accession_no: "S26-00002" })] }),
    ]);
    render(<CaseViewTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("2 stain item(s)")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search by Accession No., HN, or Patient name"), {
      target: { value: "Somchai" },
    });

    await waitFor(() => expect(screen.getByText("1 stain item(s)")).toBeInTheDocument());
    expect(screen.getByText("S26-00002")).toBeInTheDocument();
    expect(screen.queryByText("S26-00001")).not.toBeInTheDocument();
  });

  it("disables selection for already-received rows", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({ details: [detail({ id: 1, received_at: "2026-01-11T00:00:00Z" })] }),
    ]);
    render(<CaseViewTab refreshTrigger={0} />);
    // Default view is "Unreceived", which hides this already-received row — switch to "All" to see it.
    await waitFor(() => expect(screen.getByText(/^All \(\d+\)$/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/^All \(\d+\)$/));
    await waitFor(() => expect(screen.getByText("1 stain item(s)")).toBeInTheDocument());

    const rowCheckbox = screen.getAllByRole("checkbox")[1]; // [0] = select-all header
    expect(rowCheckbox).toBeDisabled();
  });

  it("reports full success when all selected runs receive without error", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({ id: 1, details: [detail({ id: 1, accession_no: "S26-00001" })] }),
      run({ id: 2, run_no: "OUT-002", details: [detail({ id: 2, accession_no: "S26-00003" })] }),
    ]);
    SurgicalBlockStainService.receiveOutlabRunDetails.mockResolvedValue({});
    render(<CaseViewTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("2 stain item(s)")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("checkbox")[0]); // select-all header checkbox
    fireEvent.click(screen.getByRole("button", { name: /Receive selected \(2\)/i }));

    await waitFor(() => expect(SurgicalBlockStainService.receiveOutlabRunDetails).toHaveBeenCalledTimes(2));
    expect(SurgicalBlockStainService.receiveOutlabRunDetails).toHaveBeenCalledWith(1, [1]);
    expect(SurgicalBlockStainService.receiveOutlabRunDetails).toHaveBeenCalledWith(2, [2]);
  });

  it("reports a partial failure when one of several runs fails to receive", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({ id: 1, details: [detail({ id: 1, accession_no: "S26-00001" })] }),
      run({ id: 2, run_no: "OUT-002", details: [detail({ id: 2, accession_no: "S26-00003" })] }),
    ]);
    SurgicalBlockStainService.receiveOutlabRunDetails.mockImplementation((runId) =>
      runId === 1 ? Promise.resolve({}) : Promise.reject(new Error("network error")),
    );
    render(<CaseViewTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("2 stain item(s)")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Receive selected \(2\)/i }));

    await waitFor(() =>
      expect(screen.getByText(/Some slides recorded, but failed for run\(s\): 2/i)).toBeInTheDocument(),
    );
  });
});
