import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TodayPatientsTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import HisService from "../../services/hisService";

vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { getPendingOutlabByHn: vi.fn(), toggleHosxpKeyed: vi.fn() },
}));
vi.mock("../../services/hisService", () => ({ default: { getVisitsToday: vi.fn() } }));

const pendingItem = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  block_code: "A1",
  stain_name: "HPV",
  destination_lab: "Lab A",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TodayPatientsTab", () => {
  it("shows the all-clear message when nothing is pending", async () => {
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({});
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(HisService.getVisitsToday).not.toHaveBeenCalled();
  });

  it("excludes patients who did not visit today", async () => {
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-001": { patient_name: "Somchai Jaidee", items: [pendingItem()] },
    });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-999"] }); // someone else visited, not HN-001
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByText("HN-001")).not.toBeInTheDocument();
  });

  it("lists a patient who visited today and still has unkeyed stains, sorted by patient name", async () => {
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-A": { patient_name: "Zebra", items: [pendingItem({ id: 1, accession_no: "S26-00001" })] },
      "HN-B": { patient_name: "Amara", items: [pendingItem({ id: 2, accession_no: "S26-00002" })] },
    });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-A", "HN-B"] });
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-A")).toBeInTheDocument());
    const hnCells = screen.getAllByText(/^HN-/).map((el) => el.textContent);
    expect(hnCells).toEqual(["HN-B", "HN-A"]); // "Amara" sorts before "Zebra"
  });

  it("shows the pending-outlab alert for patients who visited today", async () => {
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-001": { patient_name: "Somchai", items: [pendingItem()] },
    });
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
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-001": { patient_name: "Somchai", items: [pendingItem({ id: 1, block_code: "A1" })] },
    });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());
    expect(screen.getByText("Key")).toBeInTheDocument(); // visible without expanding anything first
  });

  it("removes just the keyed item, keeping the row if other items remain", async () => {
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-001": {
        patient_name: "Somchai",
        items: [pendingItem({ id: 1, block_code: "A1" }), pendingItem({ id: 2, block_code: "A2" })],
      },
    });
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
    SurgicalBlockStainService.getPendingOutlabByHn.mockResolvedValue({
      "HN-001": {
        patient_name: "Somchai",
        items: [pendingItem({ id: 1 }), pendingItem({ id: 2, block_code: "A2" })],
      },
    });
    HisService.getVisitsToday.mockResolvedValue({ hns: ["HN-001"] });
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<TodayPatientsTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Key All"));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("HN-001")).not.toBeInTheDocument());
  });
});
