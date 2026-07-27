import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GynePrintPreviewModal from "./GynePrintPreviewModal";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));

const createPdfMock = vi.fn();
vi.mock("../../../pdfFonts", () => ({
  default: { createPdf: (...args: unknown[]) => createPdfMock(...args) },
}));

let blobCounter = 0;
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  blobCounter = 0;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,FAKE");
  mockCreateObjectURL.mockImplementation(() => `blob:mock-${++blobCounter}`);
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  createPdfMock.mockImplementation(() => ({
    getBlob: (cb: (blob: Blob) => void) =>
      cb(new Blob(["fake-pdf"], { type: "application/pdf" })),
  }));
});

const makeFixture = (overrides: Partial<GyneCytologyCase> = {}) =>
  ({
    id: 1,
    accession_no: "C26-00001",
    hn: "HN001",
    patient: { title: { title: "Mrs." }, name: "Malee", ln: "Suksri" },
    hospital: { name: "Test Hospital" },
    registered_at: "2026-07-20T00:00:00Z",
    ...overrides,
  }) as unknown as GyneCytologyCase;

describe("GynePrintPreviewModal", () => {
  it("shows Empty and a disabled Print button when there's no data", () => {
    render(<GynePrintPreviewModal open data={null} onCancel={vi.fn()} />);
    expect(screen.getByText("No Data to Print")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Slide\)/ })).toBeDisabled();
  });

  it("does not generate a PDF while closed", () => {
    render(<GynePrintPreviewModal open={false} data={makeFixture()} onCancel={vi.fn()} />);
    expect(createPdfMock).not.toHaveBeenCalled();
  });

  it("renders the sticker preview once the PDF resolves", async () => {
    render(<GynePrintPreviewModal open data={makeFixture()} onCancel={vi.fn()} />);
    const iframe = await screen.findByTitle("Gyne Label Preview");
    expect(iframe).toHaveAttribute("src", "blob:mock-1");
    expect(screen.getAllByText(/C26-00001/).length).toBeGreaterThan(0);
  });

  it("prints via the iframe's contentWindow when Print is clicked", async () => {
    render(<GynePrintPreviewModal open data={makeFixture()} onCancel={vi.fn()} />);
    const iframe = (await screen.findByTitle("Gyne Label Preview")) as HTMLIFrameElement;
    const printSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { print: printSpy },
      configurable: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /พิมพ์สติ๊กเกอร์ \(Slide\)/ }));
    expect(printSpy).toHaveBeenCalled();
  });

  it("revokes the previous blob URL on refetch and the current one on unmount (bug #1 regression guard)", async () => {
    const { rerender, unmount } = render(
      <GynePrintPreviewModal open data={makeFixture()} onCancel={vi.fn()} />,
    );
    await waitFor(() => expect(mockCreateObjectURL).toHaveBeenCalledTimes(1));

    rerender(
      <GynePrintPreviewModal
        open
        data={makeFixture({ accession_no: "C26-00002" })}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockCreateObjectURL).toHaveBeenCalledTimes(2));
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-1");

    unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-2");
  });
});
