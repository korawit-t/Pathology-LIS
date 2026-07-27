import { renderHook, waitFor } from "@testing-library/react";
import { useStickerPdf } from "./useStickerPdf";
import { generateStickerPdfBlob } from "../utils/stickerLabel";
import type { StickerLabelFields, StickerLabelStyle } from "../utils/stickerLabel";
import logger from "../utils/logger";

vi.mock("../utils/stickerLabel", () => ({
  generateStickerPdfBlob: vi.fn(),
}));
vi.mock("../utils/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockGenerate = generateStickerPdfBlob as ReturnType<typeof vi.fn>;

const fields: StickerLabelFields = {
  accessionNo: "S26-00001",
  hn: "HN001",
  patientNameLine: "Mr. Somchai Jaidee",
  subLabelText: "GENERAL HOSPITAL",
  registeredAt: "2026-07-20T00:00:00Z",
};
const style: StickerLabelStyle = {
  accessionBold: false,
  accessionFontSize: 14,
  barcodeImageHeight: 12,
  patientNameBold: true,
  patientNameNoWrap: true,
  subLabelFontSize: 6,
  regDateLabel: "Reg:",
  regDateFontSize: 6,
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("useStickerPdf", () => {
  it("does not generate when open is false", () => {
    renderHook(() => useStickerPdf(false, fields, style, "PDF Error:"));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("does not generate when fields is null", () => {
    renderHook(() => useStickerPdf(true, null, style, "PDF Error:"));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("generates and resolves pdfUrl when open and fields are present", async () => {
    mockGenerate.mockResolvedValue(new Blob(["fake-pdf"]));
    const { result } = renderHook(() => useStickerPdf(true, fields, style, "PDF Error:"));

    await waitFor(() => expect(result.current.pdfUrl).toBe("blob:mock-url"));
    expect(mockGenerate).toHaveBeenCalledWith(fields, style);
  });

  it("logs via the caller-provided errorLabel when generation fails", async () => {
    const err = new Error("boom");
    mockGenerate.mockRejectedValue(err);
    renderHook(() => useStickerPdf(true, fields, style, "Gyne PDF Error:"));

    await waitFor(() => expect(logger.error).toHaveBeenCalledWith("Gyne PDF Error:", err));
  });
});
