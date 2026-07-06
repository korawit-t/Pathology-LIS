import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HosxpKeyTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import HisService from "../../services/hisService";

vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { getOutlabRuns: vi.fn(), toggleHosxpKeyed: vi.fn() },
}));
vi.mock("../../services/surgicalCaseService", () => ({ default: { getCases: vi.fn() } }));
vi.mock("../../services/hisService", () => ({ default: { getAppointments: vi.fn() } }));

const detail = (overrides = {}) => ({
  id: 100,
  accession_no: "S26-00001",
  block_code: "A1",
  is_hosxp_keyed: false,
  stain_order: { test: { name: "HPV" } },
  ...overrides,
});

const run = (overrides = {}) => ({
  id: 1,
  run_no: "OUT-001",
  details: [detail()],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  SurgicalCaseService.getCases.mockResolvedValue({ items: [{ hn: "HN-001", patient: { name: "Somchai", ln: "" } }] });
});

describe("HosxpKeyTab", () => {
  it("shows correct all/pending/keyed counts", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({ details: [detail({ id: 1, is_hosxp_keyed: false }), detail({ id: 2, is_hosxp_keyed: true })] }),
    ]);
    render(<HosxpKeyTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("All (2)")).toBeInTheDocument());
    expect(screen.getByText("Pending (1)")).toBeInTheDocument();
    expect(screen.getByText("Keyed (1)")).toBeInTheDocument();
  });

  it("filters to pending or keyed only when a filter button is clicked", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({
        details: [
          detail({ id: 1, accession_no: "S26-00001", is_hosxp_keyed: false }),
          detail({ id: 2, accession_no: "S26-00002", is_hosxp_keyed: true }),
        ],
      }),
    ]);
    render(<HosxpKeyTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("All (2)")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Pending (1)"));
    expect(screen.getByText("S26-00001")).toBeInTheDocument();
    expect(screen.queryByText("S26-00002")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Keyed (1)"));
    expect(screen.queryByText("S26-00001")).not.toBeInTheDocument();
    expect(screen.getByText("S26-00002")).toBeInTheDocument();
  });

  it("toggles a single item's keyed flag", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([run({ details: [detail({ id: 1, is_hosxp_keyed: false })] })]);
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<HosxpKeyTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("All (1)")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Key"));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledWith(1, true));
    expect(await screen.findByText("Keyed")).toBeInTheDocument();
  });

  it("bulk-keys selected rows and clears selection on success", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      run({
        details: [
          detail({ id: 1, accession_no: "S26-00001", is_hosxp_keyed: false }),
          detail({ id: 2, accession_no: "S26-00002", is_hosxp_keyed: false }),
        ],
      }),
    ]);
    SurgicalBlockStainService.toggleHosxpKeyed.mockResolvedValue({});
    render(<HosxpKeyTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("All (2)")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("checkbox")[0]); // select-all header
    fireEvent.click(screen.getByRole("button", { name: /Key Selected \(2\)/i }));

    await waitFor(() => expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledTimes(2));
    expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledWith(1, true);
    expect(SurgicalBlockStainService.toggleHosxpKeyed).toHaveBeenCalledWith(2, true);
    await waitFor(() => expect(screen.queryByText(/Key Selected/i)).not.toBeInTheDocument());
  });

  it("disables the row checkbox once an item is keyed", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([run({ details: [detail({ id: 1, is_hosxp_keyed: true })] })]);
    render(<HosxpKeyTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("All (1)")).toBeInTheDocument());

    expect(screen.getAllByRole("checkbox")[1]).toBeDisabled();
  });

  it("fetches HosXP appointments on first expand only, and shows them", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([run({ details: [detail({ id: 1 })] })]);
    HisService.getAppointments.mockResolvedValue([
      { oapp_id: 1, nextdate: "2026-01-15", nexttime: "09:30:00", department: "OPD" },
    ]);
    const { container } = render(<HosxpKeyTab refreshTrigger={0} />);
    // Wait for the HN cell (resolved async via caseMap) before expanding, so
    // fetchAppointments doesn't fire with the pre-resolution "-" placeholder.
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    // No expandRowByClick here (unlike TrackingTab) — must use the row's own expand toggle.
    const expandToggle = container.querySelector(".ant-table-row-expand-icon");
    fireEvent.click(expandToggle);
    await waitFor(() => expect(HisService.getAppointments).toHaveBeenCalledWith("HN-001"));
    expect(await screen.findByText("OPD")).toBeInTheDocument();

    fireEvent.click(expandToggle); // collapse
    fireEvent.click(expandToggle); // expand again
    expect(HisService.getAppointments).toHaveBeenCalledTimes(1); // cached, not refetched
  });

  it("shows a friendly message when HosXP has no appointments for this HN", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([run({ details: [detail({ id: 1 })] })]);
    HisService.getAppointments.mockResolvedValue([]);
    const { container } = render(<HosxpKeyTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("HN-001")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-table-row-expand-icon"));

    expect(await screen.findByText("No appointments found in HosXP")).toBeInTheDocument();
  });
});
