import JsBarcode from "jsbarcode";
import {
  code128DataUrl,
  buildStickerDocDefinition,
  generateStickerPdfBlob,
} from "./stickerLabel";
import type { StickerLabelFields, StickerLabelStyle } from "./stickerLabel";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));

const getBlobMock = vi.fn((cb: (blob: Blob) => void) =>
  cb(new Blob(["fake-pdf"], { type: "application/pdf" })),
);
vi.mock("../pdfFonts", () => ({
  default: { createPdf: vi.fn(() => ({ getBlob: getBlobMock })) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  getBlobMock.mockImplementation((cb: (blob: Blob) => void) =>
    cb(new Blob(["fake-pdf"], { type: "application/pdf" })),
  );
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,FAKE_BARCODE");
});

describe("code128DataUrl", () => {
  it("draws a CODE128 barcode onto a canvas and returns its data URL", () => {
    const result = code128DataUrl("S26-00001");

    expect(JsBarcode).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), "S26-00001", {
      format: "CODE128",
      displayValue: false,
      height: 40,
      margin: 0,
    });
    expect(result).toBe("data:image/png;base64,FAKE_BARCODE");
  });
});

describe("buildStickerDocDefinition", () => {
  const fields: StickerLabelFields = {
    accessionNo: "S26-00001",
    hn: "HN001",
    patientNameLine: "Mr. Somchai Jaidee",
    subLabelText: "GENERAL HOSPITAL",
    registeredAt: "2026-07-20T00:00:00Z",
  };

  const surgicalStyle: StickerLabelStyle = {
    accessionBold: false,
    accessionFontSize: 14,
    barcodeImageHeight: 12,
    patientNameBold: true,
    patientNameNoWrap: true,
    subLabelFontSize: 6,
    regDateLabel: "Reg:",
    regDateFontSize: 6,
  };

  const gyneStyle: StickerLabelStyle = {
    accessionBold: true,
    accessionFontSize: 13,
    barcodeImageHeight: 12,
    patientNameBold: true,
    patientNameNoWrap: true,
    subLabelFontSize: 6.5,
    regDateLabel: "Reg Date:",
    regDateFontSize: 6.5,
  };

  it("lays out identical page geometry regardless of style", () => {
    const doc = buildStickerDocDefinition(fields, "data:fake", surgicalStyle);
    expect(doc.pageSize).toEqual({ width: 142, height: 70 });
    expect(doc.pageMargins).toEqual([5, 4, 5, 2]);
    expect(doc.defaultStyle).toEqual({ font: "Sarabun", fontSize: 8 });
    expect(doc.content).toHaveLength(5);
  });

  it("applies the resolved (bug-fixed) Surgical style: barcodeImageHeight 12, patient name bold+noWrap", () => {
    const doc = buildStickerDocDefinition(fields, "data:fake", surgicalStyle);
    expect(doc.content[0].columns[0]).toMatchObject({
      text: "S26-00001",
      bold: false,
      fontSize: 14,
    });
    expect(doc.content[0].columns[1]).toMatchObject({ text: "HN: HN001" });
    // Pre-fix this was height: 10 — the undersized/less-scannable barcode bug.
    expect(doc.content[1]).toMatchObject({ image: "data:fake", height: 12 });
    // Pre-fix this was bold: false with no noWrap key at all — the
    // wrapping-patient-name-on-a-tiny-label bug.
    expect(doc.content[2]).toMatchObject({
      text: "Mr. Somchai Jaidee",
      bold: true,
      noWrap: true,
    });
    expect(doc.content[3]).toMatchObject({ text: "GENERAL HOSPITAL", fontSize: 6 });
    expect(doc.content[4]).toMatchObject({ text: "Reg: 20/07/2026", fontSize: 6 });
  });

  it("applies Gyne's style distinctly from Surgical's", () => {
    const doc = buildStickerDocDefinition(fields, "data:fake", gyneStyle);
    expect(doc.content[0].columns[0]).toMatchObject({ bold: true, fontSize: 13 });
    expect(doc.content[3]).toMatchObject({ fontSize: 6.5 });
    expect(doc.content[4]).toMatchObject({ text: "Reg Date: 20/07/2026", fontSize: 6.5 });
  });

  it("formats a missing registeredAt as a dash", () => {
    const doc = buildStickerDocDefinition(
      { ...fields, registeredAt: null },
      "data:fake",
      surgicalStyle,
    );
    expect(doc.content[4].text).toBe("Reg: -");
  });

  it("renders HN as blank when not provided", () => {
    const doc = buildStickerDocDefinition({ ...fields, hn: null }, "data:fake", surgicalStyle);
    expect(doc.content[0].columns[1].text).toBe("HN: ");
  });
});

describe("generateStickerPdfBlob", () => {
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

  it("resolves to a Blob built from the barcode + doc definition", async () => {
    const blob = await generateStickerPdfBlob(fields, style);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("rejects when barcode generation throws", async () => {
    (JsBarcode as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("barcode failed");
    });
    await expect(generateStickerPdfBlob(fields, style)).rejects.toThrow("barcode failed");
  });
});
