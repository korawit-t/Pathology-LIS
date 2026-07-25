import React, { useEffect } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ConsultPdfModal from "./ConsultPdfModal";
import SurgicalCaseService from "../../../../services/surgicalCaseService";

vi.mock("../../../../services/surgicalCaseService", () => ({
  default: {
    getConsultPdfBlob: vi.fn(),
    uploadConsultPdf: vi.fn(),
    approveConsultPdf: vi.fn(),
    deleteConsultPdf: vi.fn(),
  },
}));

// The real hook parses the PDF with pdf.js, which jsdom can't run. This stub
// models its single-page / unparsable path: no page picker, and the dropped
// file is handed straight back as the file to upload.
vi.mock("../../../../components/PdfPageSelector/usePdfPageSelector", () => ({
  usePdfPageSelector: (file: File | null, onReady: (f: File | null) => void) => {
    useEffect(() => {
      onReady(file);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    return {
      pageCount: null,
      selectedPages: [],
      thumbnails: [],
      loadingThumbnails: false,
      previewPageNo: null,
      previewSrc: undefined,
      previewLoading: false,
      ensurePreview: vi.fn(),
      togglePage: vi.fn(),
      selectAll: vi.fn(),
      clearAll: vi.fn(),
    };
  },
}));

const mockUpload = SurgicalCaseService.uploadConsultPdf as ReturnType<typeof vi.fn>;
const mockApprove = SurgicalCaseService.approveConsultPdf as ReturnType<typeof vi.fn>;
const mockDelete = SurgicalCaseService.deleteConsultPdf as ReturnType<typeof vi.fn>;
const mockGetBlob = SurgicalCaseService.getConsultPdfBlob as ReturnType<typeof vi.fn>;

const baseProps = {
  open: true,
  onClose: vi.fn(),
  caseId: "100",
  isConsultFinalizeLocked: false,
  onRefresh: vi.fn(),
  onSignedOff: vi.fn(),
};

const renderModal = (overrides: Partial<React.ComponentProps<typeof ConsultPdfModal>> = {}) =>
  render(<ConsultPdfModal {...baseProps} {...overrides} />);

/** Feed a PDF into antd's Upload.Dragger via its hidden file input. */
const dropPdf = (container: HTMLElement) => {
  const file = new File(["%PDF-1.4"], "consult.pdf", { type: "application/pdf" });
  const input = container.ownerDocument.querySelector<HTMLInputElement>(
    "input[type='file']",
  )!;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

/**
 * Wait for the Modal.confirm dialog and click one of its footer buttons.
 * Scoped by text within the dialog rather than by role: a confirm stacked on
 * top of an already-open Modal is not consistently exposed to the
 * accessibility tree in jsdom, so *ByRole finds nothing.
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
  globalThis.URL.createObjectURL = vi.fn(() => "blob:consult-pdf");
  globalThis.URL.revokeObjectURL = vi.fn();
  mockGetBlob.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mockUpload.mockResolvedValue({});
  mockApprove.mockResolvedValue({});
  mockDelete.mockResolvedValue({});
});

describe("ConsultPdfModal — upload view (no PDF yet)", () => {
  it("shows the dragger and no upload button until a file is chosen", () => {
    renderModal();
    expect(screen.getByText("Click or drag PDF to upload")).toBeInTheDocument();
    expect(screen.queryByText("Upload Report PDF")).not.toBeInTheDocument();
  });

  it("uploads the chosen file with the received-at timestamp, then refreshes", async () => {
    const { baseElement } = renderModal();
    const file = dropPdf(baseElement);

    const uploadBtn = await screen.findByText("Upload Report PDF");
    fireEvent.click(uploadBtn);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    const [caseIdArg, fileArg, receivedAtArg] = mockUpload.mock.calls[0];
    expect(caseIdArg).toBe(100);
    expect(fileArg).toBe(file);
    expect(new Date(receivedAtArg).toString()).not.toBe("Invalid Date");
    await waitFor(() => expect(baseProps.onRefresh).toHaveBeenCalled());
  });

  it("stays open after a successful upload so it can switch to the sign-off view", async () => {
    const { baseElement } = renderModal();
    dropPdf(baseElement);
    fireEvent.click(await screen.findByText("Upload Report PDF"));

    await waitFor(() => expect(baseProps.onRefresh).toHaveBeenCalled());
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("surfaces an upload failure without refreshing", async () => {
    mockUpload.mockRejectedValue(new Error("boom"));
    const { baseElement } = renderModal();
    dropPdf(baseElement);
    fireEvent.click(await screen.findByText("Upload Report PDF"));

    expect(await screen.findByText("Failed to upload Consult PDF")).toBeInTheDocument();
    expect(baseProps.onRefresh).not.toHaveBeenCalled();
  });
});

describe("ConsultPdfModal — sign-off view (PDF uploaded)", () => {
  const uploadedProps = { consultPdfPath: "/files/consult.pdf" };

  it("fetches and previews the stored PDF", async () => {
    renderModal(uploadedProps);
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledWith(100));
    const iframe = await screen.findByTitle("Consult PDF Preview");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("blob:consult-pdf"));
  });

  it("shows who approved the consult and when", async () => {
    renderModal({
      ...uploadedProps,
      consultPdfApprovedAt: "2026-03-04T09:30:00Z",
      consultPdfApproverName: "Dr. Somchai",
    });
    expect(await screen.findByText(/Approved by Dr\. Somchai on/)).toBeInTheDocument();
  });

  it("approves, refreshes, closes, and hands off to the finalize flow", async () => {
    renderModal(uploadedProps);
    fireEvent.click(await screen.findByText("Sign Off"));

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(100));
    await waitFor(() => expect(baseProps.onSignedOff).toHaveBeenCalled());
    expect(baseProps.onRefresh).toHaveBeenCalled();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("does not close or continue to finalize when approval fails", async () => {
    mockApprove.mockRejectedValue(new Error("boom"));
    renderModal(uploadedProps);
    fireEvent.click(await screen.findByText("Sign Off"));

    expect(await screen.findByText("Failed to record consult approval")).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
    expect(baseProps.onSignedOff).not.toHaveBeenCalled();
  });

  it("disables Sign Off while the consult round is still locked", async () => {
    renderModal({ ...uploadedProps, isConsultFinalizeLocked: true });
    const btn = (await screen.findByText("Sign Off")).closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("deletes the PDF only after the confirm dialog is accepted", async () => {
    renderModal(uploadedProps);
    fireEvent.click(await screen.findByText("Delete PDF"));

    // antd renders the confirm title twice (visible header + a11y label),
    // so match all rather than expecting a single node.
    expect(await screen.findAllByText("Delete Consult PDF")).not.toHaveLength(0);
    expect(mockDelete).not.toHaveBeenCalled();

    await clickConfirmButton("Delete");
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(100));
    await waitFor(() => expect(baseProps.onRefresh).toHaveBeenCalled());
  });
});
