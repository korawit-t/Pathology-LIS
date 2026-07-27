import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MolecularPrintPreviewModal from "./MolecularPrintPreviewModal";
import type { MolecularStickerData } from "./MolecularPrintPreviewModal";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));

const createPdfMock = vi.fn();
vi.mock("../../pdfFonts", () => ({
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

const fixture: MolecularStickerData = {
  accession_no: "M26-00001",
  hn: "HN001",
  patient_name: "Mr. Somchai Jaidee",
  test_name: "EGFR Mutation Analysis",
  registered_at: "2026-07-20T00:00:00Z",
};

describe("MolecularPrintPreviewModal", () => {
  it("shows Empty and a disabled Print button when there's no data", () => {
    render(<MolecularPrintPreviewModal open data={null} onCancel={vi.fn()} />);
    expect(screen.getByText("No Data to Print")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Molecular\)/ }),
    ).toBeDisabled();
  });

  it("does not generate a PDF while closed", () => {
    render(<MolecularPrintPreviewModal open={false} data={fixture} onCancel={vi.fn()} />);
    expect(createPdfMock).not.toHaveBeenCalled();
  });

  it("renders the sticker preview once the PDF resolves, using the test name as the sub-label", async () => {
    render(<MolecularPrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = await screen.findByTitle("Molecular Label Preview");
    expect(iframe).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getAllByText(/M26-00001/).length).toBeGreaterThan(0);

    await waitFor(() => expect(createPdfMock).toHaveBeenCalled());
    const docDefinition = createPdfMock.mock.calls[0][0];
    expect(docDefinition.content[3]).toMatchObject({ text: "EGFR MUTATION ANALYSIS" });
  });

  it("falls back to MOLECULAR PATHOLOGY when test_name is missing", async () => {
    render(
      <MolecularPrintPreviewModal
        open
        data={{ ...fixture, test_name: null }}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(createPdfMock).toHaveBeenCalled());
    const docDefinition = createPdfMock.mock.calls[0][0];
    expect(docDefinition.content[3]).toMatchObject({ text: "MOLECULAR PATHOLOGY" });
  });

  it("prints via the iframe's contentWindow when Print is clicked", async () => {
    render(<MolecularPrintPreviewModal open data={fixture} onCancel={vi.fn()} />);
    const iframe = (await screen.findByTitle("Molecular Label Preview")) as HTMLIFrameElement;
    const printSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { print: printSpy },
      configurable: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Molecular\)/ }));
    expect(printSpy).toHaveBeenCalled();
  });
});
