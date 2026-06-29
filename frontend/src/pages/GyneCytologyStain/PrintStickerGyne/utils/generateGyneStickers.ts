import pdfMake from "../../../../pdfFonts";
import { GyneCytologyStain } from "../../../../types/gyne-stain";
import dayjs from "dayjs";
import bwipjs from "bwip-js/browser";
import { executePrint } from "../../../Stain/PrintStickerHE/utils/generateHEStickers";

export interface StickerSlide {
  accession_no: string;
  test_name: string;
  slide_no: number | null;
  reg_date?: string;
}

const makeDMSvg = (text: string): string => {
  try {
    return (bwipjs as any).toSVG({ bcid: "datamatrix", text, scale: 2, includetext: false });
  } catch {
    return "";
  }
};

const hrLine = () => ({
  margin: [0, 2, 0, 2],
  table: {
    widths: ["*"],
    body: [[{ text: "", fontSize: 1, lineHeight: 1 }]],
  },
  layout: {
    hLineWidth: (i: number) => (i === 0 ? 0.5 : 0),
    vLineWidth: () => 0,
    hLineColor: () => "#888",
    paddingTop: () => 0,
    paddingBottom: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
  },
});

const DM_SIZE = 18; // pts — upper-right Data Matrix size

const buildContent = (slides: StickerSlide[]) => {
  const content: unknown[] = [];
  slides.forEach((slide, idx) => {
    if (idx > 0) content.push({ text: "", pageBreak: "before" });

    const dmSvg = makeDMSvg(slide.accession_no || "-");

    const textStack: unknown[] = [
      {
        text: slide.accession_no || "-",
        bold: true,
        fontSize: 8,
        lineHeight: 1,
        color: "black",
      },
      {
        text: slide.test_name || "Pap Smear",
        fontSize: 7,
        lineHeight: 1,
        color: "black",
        margin: [0, 1, 0, 0],
      },
    ];
    if (slide.reg_date) {
      textStack.push({
        text: dayjs(slide.reg_date).format("DD/MM/YYYY"),
        fontSize: 6.5,
        lineHeight: 1,
        color: "black",
        margin: [0, 1, 0, 0],
      });
    }

    content.push(
      hrLine(),
      {
        columns: [
          { stack: textStack, width: "*" },
          ...(dmSvg
            ? [{ svg: dmSvg, width: DM_SIZE, height: DM_SIZE, alignment: "right" }]
            : []),
        ],
        columnGap: 2,
      },
      hrLine(),
    );
  });
  return content;
};

export const printGyneStickers = (slides: StickerSlide[]) => {
  if (slides.length === 0) return;
  const doc = (pdfMake as any).createPdf({
    pageSize: { width: 71, height: 71 },
    pageMargins: [5, 5, 5, 3],
    defaultStyle: { font: "Sarabun", fontSize: 7, lineHeight: 1 },
    content: buildContent(slides),
  });
  doc.getBlob((blob: Blob) => executePrint(blob));
};

export const toStickerSlide = (stain: GyneCytologyStain): StickerSlide => ({
  accession_no: stain.accession_no || stain.case?.accession_no || "-",
  test_name: stain.test?.name || "Pap Smear",
  slide_no: stain.slide_no ?? null,
  reg_date: stain.created_at,
});
