import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrackingTab } from "./OutlabManagement";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SystemSettingService from "../../services/systemSettingService";

vi.mock("../../services/surgicalBlockStainService", () => ({
  default: {
    getOutlabRuns: vi.fn(),
    receiveOutlabRunDetails: vi.fn(),
    deleteOutlabRun: vi.fn(),
    updateOutlabRun: vi.fn(),
  },
}));
vi.mock("../../services/systemSettingService", () => ({ default: { getPublicSettings: vi.fn() } }));

const makeRun = (overrides = {}) => ({
  id: 1,
  run_no: "OUT-001",
  status: "sent",
  destination_lab: "Ref Lab",
  sent_at: "2026-01-10T10:00:00Z",
  details: [
    { id: 100, accession_no: "S26-00001", block_code: "A1", received_at: null, stain_order: { test: { name: "HPV" } } },
    { id: 101, accession_no: "S26-00001", block_code: "A2", received_at: null, stain_order: { test: { name: "IHC" } } },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  SystemSettingService.getPublicSettings.mockResolvedValue({ lab_name_en: "Test Lab" });
});

describe("TrackingTab", () => {
  it("shows correct sent/partial/received counts", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      makeRun({ id: 1, run_no: "OUT-001", status: "sent" }),
      makeRun({ id: 2, run_no: "OUT-002", status: "partial" }),
      makeRun({ id: 3, run_no: "OUT-003", status: "received" }),
    ]);
    render(<TrackingTab refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText("Pending at lab: 1 run(s)")).toBeInTheDocument());
    expect(screen.getByText("Partially returned: 1 run(s)")).toBeInTheDocument();
    expect(screen.getByText("Received: 1 run(s)")).toBeInTheDocument();
  });

  it("filters by search across run_no and nested detail accession_no", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([
      makeRun({ id: 1, run_no: "OUT-001" }),
      makeRun({ id: 2, run_no: "OUT-002", details: [{ id: 200, accession_no: "S26-99999", block_code: "A1", received_at: null, stain_order: {} }] }),
    ]);
    render(<TrackingTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("OUT-001")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search by Accession No."), { target: { value: "99999" } });

    expect(screen.queryByText("OUT-001")).not.toBeInTheDocument();
    expect(screen.getByText("OUT-002")).toBeInTheDocument();
  });

  it("only offers Cancel Run for runs still in sent status", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([makeRun({ id: 1, status: "received" })]);
    const { container } = render(<TrackingTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("OUT-001")).toBeInTheDocument());

    expect(container.querySelector(".ant-btn-dangerous")).not.toBeInTheDocument();
  });

  it("expanding a run groups slides by accession_no and lets you select+receive them", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([makeRun()]);
    SurgicalBlockStainService.receiveOutlabRunDetails.mockResolvedValue({});
    render(<TrackingTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("OUT-001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("OUT-001")); // expandRowByClick
    expect(await screen.findByText("Slides in this run:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /Receive selected \(2\)/i }));

    await waitFor(() =>
      expect(SurgicalBlockStainService.receiveOutlabRunDetails).toHaveBeenCalledWith(1, expect.arrayContaining([100, 101])),
    );
  });

  it("deletes a sent run via the confirm popup", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([makeRun({ id: 1, status: "sent" })]);
    SurgicalBlockStainService.deleteOutlabRun.mockResolvedValue({});
    const { container } = render(<TrackingTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("OUT-001")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous")); // the icon-only danger delete button
    fireEvent.click(await screen.findByRole("button", { name: "Cancel Run" }));

    await waitFor(() => expect(SurgicalBlockStainService.deleteOutlabRun).toHaveBeenCalledWith(1));
  });

  it("saves an edited tracking number inline", async () => {
    SurgicalBlockStainService.getOutlabRuns.mockResolvedValue([makeRun()]);
    SurgicalBlockStainService.updateOutlabRun.mockResolvedValue({});
    render(<TrackingTab refreshTrigger={0} />);
    await waitFor(() => expect(screen.getByText("OUT-001")).toBeInTheDocument());

    fireEvent.click(screen.getByText("—")); // empty tracking number placeholder, click to edit
    // The accession-search box is also an empty textbox, so disambiguate by
    // picking the one with no placeholder (the inline tracking-number editor).
    const input = (await screen.findAllByRole("textbox")).find((el) => !el.placeholder);
    fireEvent.change(input, { target: { value: "TRACK-123" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() =>
      expect(SurgicalBlockStainService.updateOutlabRun).toHaveBeenCalledWith(1, { tracking_number: "TRACK-123" }),
    );
  });
});
