import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConsultPdfPanel from "./ConsultPdfPanel";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { OutlabConsultService } from "../../services/outlabConsultService";

vi.mock("../../services/outlabConsultService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/outlabConsultService")>();
  return {
    ...actual,
    OutlabConsultService: { listForCase: vi.fn(), approve: vi.fn() },
  };
});

const round = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  case_type: "gyne",
  case_id: 1,
  seq: 2,
  consult_no: "C26-00001-C2",
  status: "result_received",
  has_result_pdf: true,
  ...overrides,
});

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

const renderPanel = (props: React.ComponentProps<typeof ConsultPdfPanel>) =>
  render(
    <ThemeProvider>
      <ConsultPdfPanel {...props} />
    </ThemeProvider>,
  );

const baseProps = {
  caseId: 1,
  onUpload: vi.fn(),
  onDelete: vi.fn(),
  onGetBlob: vi.fn(),
  onRefresh: vi.fn(),
};

describe("ConsultPdfPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not flagged for out-lab consult", () => {
    const { container } = renderPanel({ ...baseProps, isOutLabConsult: false, consultPdfPath: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the upload UI when flagged but no PDF uploaded yet", () => {
    renderPanel({ ...baseProps, isOutLabConsult: true, consultPdfPath: null });
    expect(screen.getByText("Out-Lab Consult PDF")).toBeInTheDocument();
    expect(screen.getByText("Click or drag PDF to upload")).toBeInTheDocument();
    expect(screen.queryByText("Delete PDF")).not.toBeInTheDocument();
  });

  it("offers no way to attach a PDF when read-only", async () => {
    // A case that is already signed out, seen by somebody who could not have
    // signed it out. The server refuses the write either way; the button just
    // should not be there to press.
    renderPanel({ ...baseProps, isOutLabConsult: true, consultPdfPath: null, readOnly: true });

    expect(screen.getByText(/sent for external consultation/)).toBeInTheDocument();
    expect(screen.queryByText("Click or drag PDF to upload")).not.toBeInTheDocument();
    expect(screen.queryByText("Report Received Date / Time:")).not.toBeInTheDocument();
  });

  it("still shows the PDF when read-only, without the delete button", async () => {
    const onGetBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    renderPanel({
      ...baseProps,
      onGetBlob,
      isOutLabConsult: true,
      consultPdfPath: "/uploads/x.pdf",
      readOnly: true,
    });

    await waitFor(() => expect(onGetBlob).toHaveBeenCalled());
    expect(screen.getByTitle("Consult PDF Preview")).toBeInTheDocument();
    expect(screen.queryByText("Delete PDF")).not.toBeInTheDocument();
  });

  it("shows the inline preview and delete button when a PDF is already uploaded", async () => {
    const onGetBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    renderPanel({
      ...baseProps,
      onGetBlob,
      isOutLabConsult: true,
      consultPdfPath: "/uploads/consults/consult_gyne_1.pdf",
    });

    await waitFor(() => expect(onGetBlob).toHaveBeenCalledWith(1));
    expect(screen.getByText("Consult report PDF received.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete PDF/i })).toBeInTheDocument();
    expect(screen.queryByText("Click or drag PDF to upload")).not.toBeInTheDocument();
  });

  it("calls onDelete and onRefresh after confirming deletion", async () => {
    const onGetBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn();
    renderPanel({
      ...baseProps,
      onGetBlob,
      onDelete,
      onRefresh,
      isOutLabConsult: true,
      consultPdfPath: "/uploads/consults/consult_gyne_1.pdf",
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /Delete PDF/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Delete PDF/i }));

    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  describe("consult round approval (consultCaseType set)", () => {
    const pdfProps = () => ({
      ...baseProps,
      onGetBlob: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
      isOutLabConsult: true,
      consultPdfPath: "/uploads/consults/c.pdf",
      consultCaseType: "gyne" as const,
    });

    it("asks for approval and approves the open round", async () => {
      vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([
        round({ id: 3, seq: 1, consult_no: "C26-00001-C1", status: "reported" }),
        round(),
      ] as never);
      vi.mocked(OutlabConsultService.approve).mockResolvedValue(round({ status: "approved" }) as never);
      const props = pdfProps();
      renderPanel(props);

      expect(await screen.findByText("C26-00001-C2")).toBeInTheDocument();
      expect(screen.getByText(/can't be released until it is/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Approve Consult PDF/i }));

      await waitFor(() => expect(OutlabConsultService.approve).toHaveBeenCalledWith(7));
      expect(props.onRefresh).toHaveBeenCalled();
      expect(OutlabConsultService.listForCase).toHaveBeenCalledWith("gyne", 1);
    });

    it("shows who approved instead of the button", async () => {
      vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([
        round({ status: "approved", approved_by_name: "Dr. Somchai", approved_at: "2026-11-11T09:30:00" }),
      ] as never);
      renderPanel(pdfProps());

      expect(await screen.findByText(/Approved by Dr. Somchai/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Approve Consult PDF/i })).not.toBeInTheDocument();
    });

    it("offers no delete once the round is released on a report", async () => {
      vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([round({ status: "reported" })] as never);
      renderPanel(pdfProps());

      expect(await screen.findByText(/Approved by/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Delete PDF/i })).not.toBeInTheDocument();
    });

    it("does not look up rounds when the panel isn't a consult round", async () => {
      renderPanel({ ...pdfProps(), consultCaseType: undefined });
      await screen.findByText("Consult report PDF received.");
      expect(OutlabConsultService.listForCase).not.toHaveBeenCalled();
    });
  });
});
