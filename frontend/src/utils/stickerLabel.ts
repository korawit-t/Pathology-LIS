import JsBarcode from "jsbarcode";
import dayjs from "dayjs";
import pdfMake from "../pdfFonts";

/** Already-resolved display strings for a specimen sticker. Callers build
 * these themselves (patient-name join, hospital/test-name fallback +
 * uppercasing) — this module only knows how to lay out plain strings, not
 * where they came from, which is what lets Surgical/Gyne/Nongyne/Molecular
 * share it despite pulling the sub-label from different fields. */
export interface StickerLabelFields {
  accessionNo: string;
  hn?: string | null;
  patientNameLine: string;
  subLabelText: string;
  registeredAt?: string | null;
  /** Originating Surgical case's accession no, when this specimen was
   * ordered on an existing case's block rather than registered standalone
   * (currently only Molecular cases have this). Omitted from the layout
   * entirely when absent, so Surgical/Gyne/Nongyne stickers are unaffected. */
  parentAccessionNo?: string | null;
}

/** The visual-tuning knobs that differ per case type. Values live in each
 * caller's own module-scope constant, not centralized here. */
export interface StickerLabelStyle {
  accessionBold: boolean;
  accessionFontSize: number;
  barcodeImageHeight: number;
  patientNameBold: boolean;
  patientNameNoWrap: boolean;
  subLabelFontSize: number;
  regDateLabel: string;
  regDateFontSize: number;
}

/** Renders `value` as a CODE128 barcode PNG data URL via an off-screen
 * canvas — the 6-line boilerplate every sticker modal repeated verbatim. */
export function code128DataUrl(value: string): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    displayValue: false,
    height: 40,
    margin: 0,
  });
  return canvas.toDataURL();
}

/** The shared 142x70pt (~5x2.5cm) specimen-sticker layout used by all 4
 * case types' print-preview modals. */
export function buildStickerDocDefinition(
  fields: StickerLabelFields,
  barcodeDataUrl: string,
  style: StickerLabelStyle,
  // pdfMake has no official types; `any` matches this repo's existing
  // convention at each call site this replaces.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    {
      columns: [
        {
          text: fields.accessionNo,
          bold: style.accessionBold,
          fontSize: style.accessionFontSize,
        },
        {
          text: `HN: ${fields.hn || ""}`,
          alignment: "right",
          fontSize: 10,
        },
      ],
    },
    {
      image: barcodeDataUrl,
      width: 120,
      height: style.barcodeImageHeight,
      alignment: "center",
      margin: [0, 1, 0, 0],
    },
    {
      text: fields.patientNameLine,
      fontSize: 9,
      bold: style.patientNameBold,
      noWrap: style.patientNameNoWrap,
      alignment: "center",
      margin: [0, 2, 0, 0],
    },
    {
      text: fields.subLabelText,
      fontSize: style.subLabelFontSize,
      alignment: "center",
      color: "black",
      margin: [0, 1, 0, 0],
    },
    {
      text: `${style.regDateLabel} ${
        fields.registeredAt ? dayjs(fields.registeredAt).format("DD/MM/YYYY") : "-"
      }`,
      fontSize: style.regDateFontSize,
      alignment: "center",
      color: "black",
      margin: [0, 0, 0, 0],
    },
  ];

  if (fields.parentAccessionNo) {
    content.push({
      text: `Parent: ${fields.parentAccessionNo}`,
      fontSize: style.regDateFontSize,
      alignment: "center",
      color: "black",
      margin: [0, 0, 0, 0],
    });
  }

  return {
    pageSize: { width: 142, height: 70 },
    pageMargins: [5, 4, 5, 2],
    defaultStyle: { font: "Sarabun", fontSize: 8 },
    content,
  };
}

/** Generates the full sticker PDF as a Blob. Any synchronous throw while
 * building the barcode/doc-definition becomes a rejected promise. */
export function generateStickerPdfBlob(
  fields: StickerLabelFields,
  style: StickerLabelStyle,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const barcodeDataUrl = code128DataUrl(fields.accessionNo);
      const docDefinition = buildStickerDocDefinition(fields, barcodeDataUrl, style);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfMake as any).createPdf(docDefinition).getBlob((blob: Blob) => resolve(blob));
    } catch (err) {
      reject(err);
    }
  });
}
