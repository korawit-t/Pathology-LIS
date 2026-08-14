import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OutlabTabContent from "./OutlabTabContent";
import type { OutlabConsultRunResponse } from "../../services/outlabConsultRunService";

const makeRun = (overrides: Partial<OutlabConsultRunResponse> = {}): OutlabConsultRunResponse => ({
  id: 1,
  run_no: "CONS26-00001",
  destination_lab: "Ref Lab",
  sent_at: "2026-01-10T10:00:00",
  status: "sent",
  details: [
    {
      id: 100,
      run_id: 1,
      case_type: "surgical",
      case_id: 11,
      accession_no: "S26-00002",
      patient_name: "Somchai Jaidee",
      block_code: "A1",
      created_at: "2026-01-10T10:00:00",
      block_returned: false,
      case_consult_status: "processing",
    },
    {
      id: 101,
      run_id: 1,
      case_type: "surgical",
      case_id: 11,
      accession_no: "S26-00002",
      patient_name: "Somchai Jaidee",
      block_code: "A2",
      created_at: "2026-01-10T10:00:00",
      block_returned: true,
      block_returned_at: "2026-01-20T09:00:00",
      case_consult_status: "processing",
    },
    {
      id: 102,
      run_id: 1,
      case_type: "gyne",
      case_id: 22,
      accession_no: "C26-00001",
      patient_name: "Malee Rakdee",
      created_at: "2026-01-10T10:00:00",
      block_returned: false,
      case_consult_status: "received",
      consult_pdf_uploaded: true,
    },
  ],
  ...overrides,
});

const baseProps = {
  loading: false,
  onRefresh: vi.fn(),
  onReceive: vi.fn(),
  pendingCount: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("OutlabTabContent", () => {
  it("expands a run on row click and lists its cases grouped by accession", async () => {
    render(<OutlabTabContent {...baseProps} runs={[makeRun()]} />);

    expect(screen.queryByText("Cases in this run:")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("CONS26-00001")); // expandRowByClick

    expect(await screen.findByText("Cases in this run:")).toBeInTheDocument();
    expect(screen.getByText("2 case(s) · 3 item(s)")).toBeInTheDocument();
    // The two surgical details share an accession, so they collapse into one
    // row carrying both block chips.
    expect(screen.getAllByText("S26-00002")).toHaveLength(1);
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
    // A consult detail with no block is the whole case going out, not a block.
    expect(screen.getByText("Whole case")).toBeInTheDocument();
    expect(screen.getByText("Result received")).toBeInTheDocument();
    expect(screen.getByText("PDF uploaded")).toBeInTheDocument();
  });

  it("does not expand the row when the Receive action is clicked", async () => {
    render(<OutlabTabContent {...baseProps} runs={[makeRun()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Receive/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(baseProps.onReceive).toHaveBeenCalledWith(1));
    // The confirm button lives in a portal but still bubbles through the React
    // tree — the row must not have toggled open behind the popup.
    expect(screen.queryByText("Cases in this run:")).not.toBeInTheDocument();
  });

  it("keeps completed runs expandable but drops the Receive action", () => {
    render(<OutlabTabContent {...baseProps} runs={[makeRun({ status: "completed" })]} pendingCount={0} />);

    expect(screen.queryByRole("button", { name: /Receive/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("CONS26-00001"));
    expect(screen.getByText("Cases in this run:")).toBeInTheDocument();
  });
});
