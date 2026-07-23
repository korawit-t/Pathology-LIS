import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TodayPatientsTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import HisService from "../../services/hisService";

vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { getOutlabRuns: vi.fn(), toggleHosxpKeyed: vi.fn() },
}));
vi.mock("../../services/surgicalCaseService", () => ({ default: { getCases: vi.fn() } }));
vi.mock("../../services/hisService", () => ({ default: { getVisitsToday: vi.fn() } }));

const unkeyedDetail = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  block_code: "A1",
  is_hosxp_keyed: false,
  stain_order: { test: { name: "HPV" } },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TodayPatientsTab", () => {
  it("shows the all-clear message when nothing is pending", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(HisService.getVisitsToday).not.toHaveBeenCalled();
  });

  it("excludes patients who did not visit today", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "Jaidee" } }] });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-999"] }); // someone else visited, not HN-001
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByText("HN-001")).not.toBeInTheDocument();
  });

  it("skips patients whose HN can't be resolved from the accession number, without calling the HIS visit check", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [] }); // no matching case found
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(HisService.getVisitsToday).not.toHaveBeenCalled();
  });

  it("lists a patient who visited today and still has unkeyed stains, sorted by patient name", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      {
        run_no: "OUT-001",
        destination_lab: "Lab A",
        details: [unkeyedDetail({ id: 1, accession_no: "S26-00001" }), unkeyedDetail({ id: 2, accession_no: "S26-00002" })],
      },
    ]);
    SurgicalCaseService.getCases.mockImplementation(({ search }) =>
      Promise.resolve({
        items: [{
          hn: search === "S26-00001" ? "HN-A" : "HN-B",
          patient: { name: search === "S26-00001" ? "Zebra" : "Amara", ln: "" },
        }],
      }),
    );
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-A", "HN-B"] });
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-A")).toBeInTheDocument());
    const hnCells = screen.getAllByText(/^HN-/).map((el) => el.textContent);
    expect(hnCells).toEqual(["HN-B", "HN-A"]); // "Amara" sorts before "Zebra"
  });

  it("shows the pending-outlab alert for patients who visited today", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/still have pending outlab stains/i)).toBeInTheDocument();
    expect(screen.getByText("HN-001")).toBeInTheDocument();
  });

  it("rows load already expanded, without needing a manual click", async () => {
    // Regression: defaultExpandAllRows only took effect against the Table's
    // initial (empty) dataSource — since `rows` loads asynchronously, real
    // rows always rendered collapsed. Expand state is now seeded from every
    // fresh fetch instead, via controlled expandedRowKeys.
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail({ id: 1, block_code: "A1" })] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());
    expect(screen.getByText("Key")).toBeInTheDocument(); // visible without expanding anything first
  });

  it("removes just the keyed item, keeping the row if other items remain", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      {
        run_no: "OUT-001",
        destination_lab: "Lab A",
        details: [unkeyedDetail({ id: 1, block_code: "A1" }), unkeyedDetail({ id: 2, block_code: "A2" })],
      },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<TodayPatientsTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    fireEvent.click(await screen.findAllByText("Key").then((els) => els[0]));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledWith(1, true));
    expect(screen.getByText("HN-001")).toBeInTheDocument(); // row stays, one item left
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
  });

  it("removes the whole patient row after Key All", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      {
        run_no: "OUT-001",
        destination_lab: "Lab A",
        details: [unkeyedDetail({ id: 1 }), unkeyedDetail({ id: 2, block_code: "A2" })],
      },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<TodayPatientsTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Key All"));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("HN-001")).not.toBeInTheDocument());
  });
});
