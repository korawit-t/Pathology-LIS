import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PrintPreviewModal from "./index";
import type { SurgicalCase } from "../../../../types/surgical";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));

const createPdfMock = vi.fn();
vi.mock("../../../../pdfFonts", () => ({
  default: { createPdf: (...args: unknown[]) => createPdfMock(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,FAKE");
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  globalThis.URL.revokeObjectURL = vi.fn();
  createPdfMock.mockImplementation(() => ({
    getBlob: (cb: (blob: Blob) => void) =>
      cb(new Blob(["fake-pdf"], { type: "application/pdf" })),
  }));
});

const fixture = {
  id: 1,
  accession_no: "S26-00001",
  hn: "HN001",
  patient: { title: { title: "Mr." }, name: "Somchai", ln: "Jaidee" },
  hospital: { name: "Test Hospital" },
  registered_at: "2026-07-20T00:00:00Z",
} as unknown as SurgicalCase;

describe("PrintPreviewModal (Surgical)", () => {
  it("shows Empty and a disabled Print button when there's no data", () => {
    render(<PrintPreviewModal open data={null} onCancel={vi.fn()} />);
    expect(screen.getByText("ไม่มีข้อมูล")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์เคส/ })).toBeDisabled();
  });

  it("does not generate a PDF while closed", () => {
    render(<PrintPreviewModal open={false} data={fixture} onCancel={vi.fn()} />);
    expect(createPdfMock).not.toHaveBeenCalled();
  });

  it("renders the sticker preview once the PDF resolves", async () => {
    render(<PrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = await screen.findByTitle("Case Label Preview");
    expect(iframe).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getByText(/S26-00001/)).toBeInTheDocument();
  });

  it("fixes the undersized barcode and wrapping patient name (bugs #2/#3)", async () => {
    render(<PrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    await waitFor(() => expect(createPdfMock).toHaveBeenCalled());

    const docDefinition = createPdfMock.mock.calls[0][0];
    // Was height: 10 pre-fix — the undersized/less-scannable barcode bug.
    expect(docDefinition.content[1]).toMatchObject({ height: 12 });
    // Was bold: false with no noWrap key at all pre-fix — the
    // wrapping-patient-name-on-a-tiny-label bug.
    expect(docDefinition.content[2]).toMatchObject({ bold: true, noWrap: true });
  });

  it("prints via the iframe's contentWindow when Print is clicked", async () => {
    render(<PrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = (await screen.findByTitle("Case Label Preview")) as HTMLIFrameElement;
    const printSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { print: printSpy },
      configurable: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์เคส/ }));
    expect(printSpy).toHaveBeenCalled();
  });
});
