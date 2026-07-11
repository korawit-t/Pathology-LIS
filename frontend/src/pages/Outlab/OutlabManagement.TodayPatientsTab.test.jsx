import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import { TodayPatientsTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import HisService from "../../services/hisService";

// Only Date is frozen (see beforeEach) so the "today"/"urgent (within 2h)"
// branches are deterministic. Faking ALL timers was tried and timed out every
// async fetch/waitFor (the promise-chain fetch pipeline needs real timers), so
// we fake Date alone — that keeps timeIn()/today() from drifting or wrapping
// past midnight while leaving setTimeout/Promise untouched.
vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { getOutlabRuns: vi.fn(), toggleHosxpKeyed: vi.fn() },
}));
vi.mock("../../services/surgicalCaseService", () => ({ default: { getCases: vi.fn() } }));
vi.mock("../../services/hisService", () => ({ default: { getAppointments: vi.fn() } }));

const unkeyedDetail = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  block_code: "A1",
  is_hosxp_keyed: false,
  stain_order: { test: { name: "HPV" } },
  ...overrides,
});

const today = () => dayjs().format("YYYY-MM-DD");
const timeIn = (minutes) => dayjs().add(minutes, "minute").format("HH:mm:ss");
const timeAgo = (minutes) => dayjs().subtract(minutes, "minute").format("HH:mm:ss");

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze ONLY Date (leave setTimeout/Promise real) so dayjs()-derived "now"
  // is deterministic without breaking the component's async fetch pipeline —
  // faking all timers made every waitFor time out. A fixed mid-day clock stops
  // timeIn(30)/timeIn(180) from wrapping past midnight, which otherwise flaked
  // the "urgent (within 2h)" branch when the suite ran near 23:30–23:59.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // 2026-01-15 10:00 local
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TodayPatientsTab", () => {
  it("shows the all-clear message when nothing is pending", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
  });

  it("excludes patients whose only appointment is not today", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "Jaidee" } }] });
    HisService.getAppointments.mockResolvedValue([
      { nextdate: dayjs().add(1, "day").format("YYYY-MM-DD"), nexttime: "09:00:00", department: "OPD" },
    ]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByText("HN-001")).not.toBeInTheDocument();
  });

  it("skips patients whose HN can't be resolved from the accession number", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [] }); // no matching case found
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(HisService.getAppointments).not.toHaveBeenCalled();
  });

  it("lists a patient with a today appointment and unkeyed stains, earliest time first", async () => {
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
          patient: { name: search === "S26-00001" ? "Late" : "Early", ln: "" },
        }],
      }),
    );
    HisService.getAppointments.mockImplementation((hn) =>
      Promise.resolve([{ nextdate: today(), nexttime: hn === "HN-A" ? timeIn(300) : timeIn(120), department: "OPD" }]),
    );
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-A")).toBeInTheDocument());
    const hnCells = screen.getAllByText(/^HN-/).map((el) => el.textContent);
    expect(hnCells).toEqual(["HN-B", "HN-A"]); // earlier appt (Early) sorts before later one (Late)
  });

  it("shows the urgent alert when a patient arrives within 2 hours", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeIn(30), department: "OPD" }]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    expect(await screen.findByText(/arriving within 2 hours/i)).toBeInTheDocument();
  });

  it("does not flag an appointment more than 2 hours away as urgent", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeIn(180), department: "OPD" }]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());
    expect(screen.queryByText(/arriving within 2 hours/i)).not.toBeInTheDocument();
    expect(screen.getByText(/have appointments today/i)).toBeInTheDocument();
  });

  it("excludes an appointment that has already passed from the urgent count", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      { run_no: "OUT-001", destination_lab: "Lab A", details: [unkeyedDetail()] },
    ]);
    SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeAgo(30), department: "OPD" }]);
    render(<TodayPatientsTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());
    expect(screen.queryByText(/arriving within 2 hours/i)).not.toBeInTheDocument();
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
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeIn(30), department: "OPD" }]);
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
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeIn(30), department: "OPD" }]);
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
    HisService.getAppointments.mockResolvedValue([{ nextdate: today(), nexttime: timeIn(30), department: "OPD" }]);
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<TodayPatientsTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Key All"));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("HN-001")).not.toBeInTheDocument());
  });
});
