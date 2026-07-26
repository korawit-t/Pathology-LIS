import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CompletedCaseModal from "./CompletedCaseModal";
import SurgicalReportService from "../../../../services/surgicalReportService";
import type { SurgicalCase } from "../../../../types/surgical";
import type { SurgicalReport } from "../../../../types/surgicalReport";

vi.mock("../../../../services/surgicalReportService", () => ({
  default: {
    getReportPdf: vi.fn(),
    deleteReport: vi.fn(),
  },
}));

const mockGetReportPdf = SurgicalReportService.getReportPdf as ReturnType<typeof vi.fn>;
const mockDeleteReport = SurgicalReportService.deleteReport as ReturnType<typeof vi.fn>;

const makeReport = (overrides: Partial<SurgicalReport> = {}): SurgicalReport =>
  ({
    id: 1,
    version_no: 1,
    report_type: "Final",
    status: "published",
    pathologist_name: "Dr. Path",
    published_at: "2026-03-01T08:00:00Z",
    created_at: "2026-03-01T08:00:00Z",
    ...overrides,
  }) as SurgicalReport;

const surgicalCase = {
  id: 100,
  accession_no: "S26-00001",
  status: "signed out",
  patient: { hn: "HN123", title: { title: "Mr." }, name: "Somchai", ln: "Jaidee" },
} as unknown as SurgicalCase;

const baseProps = {
  open: true,
  onClose: vi.fn(),
  surgicalCase,
  reports: [] as SurgicalReport[],
  reportsLoading: false,
  onBack: vi.fn(),
  onAddendum: vi.fn(),
  onReportsChanged: vi.fn(),
};

const renderModal = (
  overrides: Partial<React.ComponentProps<typeof CompletedCaseModal>> = {},
) => render(<CompletedCaseModal {...baseProps} {...overrides} />);

/**
 * Row actions are icon-only buttons. Query them by antd's icon class on
 * document.body (the Modal renders through a portal), never with *ByRole.
 *
 * On this DOM — a full antd Modal wrapping a Table — one successful
 * getByRole("img", { name }) call measured ~5.6s, and a miss ~100s, because
 * RTL computes accessible names across the whole tree (and, on a miss,
 * enumerates every role to build its error). Three such calls per test blew
 * the 15s per-test timeout on slower machines while passing on faster ones.
 * The class query below is ~0ms.
 */
const rowActionButton = (icon: "edit" | "delete") =>
  document.body
    .querySelector<HTMLElement>(`.anticon-${icon}`)
    ?.closest("button") ?? null;

/**
 * Wait for the Modal.confirm dialog and click one of its footer buttons.
 * Scoped by text within the dialog rather than by role for the same
 * performance reason, and because a confirm stacked on an already-open Modal
 * was not reliably exposed to the accessibility tree here — its buttons were
 * present in the DOM but *ByRole reported them as not found.
 */
const clickConfirmButton = async (label: string) => {
  const dialog = await waitFor(() => {
    const el = document.body.querySelector<HTMLElement>(".ant-modal-confirm");
    if (!el) throw new Error("confirm dialog not open");
    return el;
  });
  fireEvent.click(within(dialog).getByText(label));
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:report-pdf");
  globalThis.URL.revokeObjectURL = vi.fn();
  mockGetReportPdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mockDeleteReport.mockResolvedValue({});
});

describe("CompletedCaseModal", () => {
  it("shows the case header with the full patient name", () => {
    renderModal();
    expect(screen.getByText("S26-00001")).toBeInTheDocument();
    expect(screen.getByText("Mr. Somchai Jaidee")).toBeInTheDocument();
    expect(screen.getByText("HN: HN123")).toBeInTheDocument();
  });

  it("previews the newest published version by default", async () => {
    renderModal({
      reports: [
        makeReport({ id: 1, version_no: 1 }),
        makeReport({ id: 3, version_no: 3 }),
        makeReport({ id: 2, version_no: 2 }),
      ],
    });
    await waitFor(() => expect(mockGetReportPdf).toHaveBeenCalledWith(3));
    expect(await screen.findByTitle("Signed Report Preview")).toBeInTheDocument();
  });

  it("ignores drafts when picking the default version", async () => {
    renderModal({
      reports: [
        makeReport({ id: 1, version_no: 1 }),
        makeReport({ id: 9, version_no: 9, status: "draft" }),
      ],
    });
    await waitFor(() => expect(mockGetReportPdf).toHaveBeenCalledWith(1));
    expect(mockGetReportPdf).not.toHaveBeenCalledWith(9);
  });

  it("loads a different version's PDF when its row is clicked", async () => {
    renderModal({
      reports: [makeReport({ id: 1, version_no: 1 }), makeReport({ id: 2, version_no: 2 })],
    });
    await waitFor(() => expect(mockGetReportPdf).toHaveBeenCalledWith(2));

    fireEvent.click(screen.getByText("v1"));
    await waitFor(() => expect(mockGetReportPdf).toHaveBeenCalledWith(1));
  });

  it("shows the no-preview placeholder when there are no reports", () => {
    renderModal();
    expect(screen.getByText("No Preview Available")).toBeInTheDocument();
    expect(mockGetReportPdf).not.toHaveBeenCalled();
  });

  it("wires Go Back and Add New Report to their callbacks", () => {
    renderModal();
    fireEvent.click(screen.getByText("Go Back"));
    expect(baseProps.onBack).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add New Report"));
    expect(baseProps.onAddendum).toHaveBeenCalled();
  });

  it("offers row actions on drafts only", () => {
    renderModal({ reports: [makeReport({ id: 1, status: "published" })] });
    expect(rowActionButton("delete")).toBeNull();
    expect(rowActionButton("edit")).toBeNull();
  });

  it("continues editing a draft via the row's edit action", () => {
    renderModal({ reports: [makeReport({ id: 7, status: "draft" })] });
    fireEvent.click(rowActionButton("edit")!);
    expect(baseProps.onAddendum).toHaveBeenCalled();
  });

  it("deletes a draft after confirmation and asks the parent to refetch", async () => {
    renderModal({ reports: [makeReport({ id: 7, version_no: 2, status: "draft" })] });
    fireEvent.click(rowActionButton("delete")!);

    // antd renders the confirm title twice (visible header + a11y label).
    expect(await screen.findAllByText("Delete Draft Report")).not.toHaveLength(0);
    expect(mockDeleteReport).not.toHaveBeenCalled();

    await clickConfirmButton("Delete");
    await waitFor(() => expect(mockDeleteReport).toHaveBeenCalledWith(7));
    await waitFor(() => expect(baseProps.onReportsChanged).toHaveBeenCalled());
  });

  it("does not ask the parent to refetch when the delete fails", async () => {
    mockDeleteReport.mockRejectedValue(new Error("boom"));
    renderModal({ reports: [makeReport({ id: 7, status: "draft" })] });
    fireEvent.click(rowActionButton("delete")!);
    await clickConfirmButton("Delete");

    expect(await screen.findByText("Failed to delete draft report")).toBeInTheDocument();
    expect(baseProps.onReportsChanged).not.toHaveBeenCalled();
  });

  it("warns when the case is flagged for out-lab consult but not yet dispatched", () => {
    renderModal({
      surgicalCase: {
        ...surgicalCase,
        is_out_lab_consult: true,
        consult_status: "pending",
      } as unknown as SurgicalCase,
    });
    expect(screen.getByText("Pending Out-Lab Consult Dispatch")).toBeInTheDocument();
  });
});
