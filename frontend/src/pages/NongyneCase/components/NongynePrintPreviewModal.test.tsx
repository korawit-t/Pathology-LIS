import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NongynePrintPreviewModal from "./NongynePrintPreviewModal";
import type { NongyneCytologyCase } from "../../../types/nongyne";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));

const createPdfMock = vi.fn();
vi.mock("../../../pdfFonts", () => ({
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
  accession_no: "N26-00001",
  hn: "HN001",
  patient: { title: { title: "Mr." }, name: "Somsak", ln: "Deejai" },
  hospital: { name: "Test Hospital" },
  registered_at: "2026-07-20T00:00:00Z",
} as unknown as NongyneCytologyCase;

describe("NongynePrintPreviewModal", () => {
  it("shows Empty and a disabled Print button when there's no data", () => {
    render(<NongynePrintPreviewModal open data={null} onCancel={vi.fn()} />);
    expect(screen.getByText("No Data to Print")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Slide\)/ }),
    ).toBeDisabled();
  });

  it("does not generate a PDF while closed", () => {
    render(<NongynePrintPreviewModal open={false} data={fixture} onCancel={vi.fn()} />);
    expect(createPdfMock).not.toHaveBeenCalled();
  });

  it("renders the sticker preview once the PDF resolves", async () => {
    render(<NongynePrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = await screen.findByTitle("Nongyne Label Preview");
    expect(iframe).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getAllByText(/N26-00001/).length).toBeGreaterThan(0);
  });

  it("uses the resolved style (barcodeImageHeight 12, patient name bold+noWrap)", async () => {
    render(<NongynePrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    await waitFor(() => expect(createPdfMock).toHaveBeenCalled());

    const docDefinition = createPdfMock.mock.calls[0][0];
    expect(docDefinition.content[1]).toMatchObject({ height: 12 });
    expect(docDefinition.content[2]).toMatchObject({ bold: true, noWrap: true });
  });

  it("prints via the iframe's contentWindow when Print is clicked", async () => {
    render(<NongynePrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = (await screen.findByTitle("Nongyne Label Preview")) as HTMLIFrameElement;
    const printSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { print: printSpy },
      configurable: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Slide\)/ }));
    expect(printSpy).toHaveBeenCalled();
  });
});
