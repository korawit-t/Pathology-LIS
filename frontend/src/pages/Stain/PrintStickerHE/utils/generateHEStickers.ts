import pdfMake from "../../../../pdfFonts";
import dayjs from "dayjs";
import bwipjs from "bwip-js/browser";

export interface HEStickerSlide {
  accession_no: string;
  block_code: string;
  stain_type: string;
  reg_date?: string;
}

interface RunDetail {
  stain_order?: {
    block?: {
      accession_no?: string;
      block_no?: number | string;
      block_code?: string;
      specimen?: {
        specimen_label?: string;
        case?: { accession_no?: string; registered_at?: string };
      };
    };
    accession_no?: string;
    block_code?: string;
    test?: { name?: string };
    test_name?: string;
    stain_name?: string;
    created_at?: string;
  };
}

interface QuickOrder {
  accession_no?: string;
  block_code?: string;
  stain_name?: string;
  test_name?: string;
  test?: { name?: string };
  created_at?: string;
}

const DM_SIZE = 18;

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

const buildContent = (slides: HEStickerSlide[]) => {
  const content: unknown[] = [];
  slides.forEach((slide, idx) => {
    if (idx > 0) content.push({ text: "", pageBreak: "before" });

    const dmSvg = makeDMSvg(slide.accession_no || "N/A");

    const textStack: unknown[] = [
      {
        text: slide.accession_no || "N/A",
        bold: true,
        fontSize: 8,
        lineHeight: 1,
        color: "black",
      },
      {
        text: slide.block_code || "",
        bold: true,
        fontSize: 12,
        lineHeight: 1,
        color: "black",
        margin: [0, 1, 0, 0],
      },
      {
        text: slide.stain_type || "H&E",
        fontSize: 6,
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

export const executePrint = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  // Use off-screen positioning instead of display:none — newer Chrome blocks print()
  // on display:none iframes which causes the print dialog to flash and close.
  iframe.style.cssText =
    "position:fixed;right:-9999px;bottom:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  iframe.src = url;
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
  };

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
      iframe.contentWindow?.print();
      setTimeout(cleanup, 60_000);
    }, 500);
  };
};

export const printHEStickers = (slides: HEStickerSlide[]) => {
  if (slides.length === 0) return;
  const doc = (pdfMake as any).createPdf({
    pageSize: { width: 71, height: 71 },
    pageMargins: [5, 5, 5, 3],
    defaultStyle: { font: "Sarabun", fontSize: 7, lineHeight: 1 },
    content: buildContent(slides),
  });
  doc.getBlob((blob: Blob) => executePrint(blob));
};

// Convert from nested run detail (stain_order has block→specimen→case)
export const runDetailToStickerSlide = (detail: RunDetail): HEStickerSlide => {
  const stain = detail.stain_order;
  const block = stain?.block;
  const specimen = block?.specimen;
  const sCase = specimen?.case;

  const accession = sCase?.accession_no || block?.accession_no || stain?.accession_no || "N/A";
  const bLabel = specimen?.specimen_label || "";
  const bNo = block?.block_no || "";
  const blockCode = bLabel && bNo ? `${bLabel}${bNo}` : block?.block_code || stain?.block_code || "N/A";

  return {
    accession_no: accession,
    block_code: blockCode,
    stain_type: stain?.test?.name || stain?.test_name || stain?.stain_name || "H&E",
    reg_date: sCase?.registered_at || stain?.created_at,
  };
};

// Convert from flat StainRequest (Quick Print — no nested case)
export const quickOrderToStickerSlide = (order: QuickOrder & { stain_type?: string }): HEStickerSlide => ({
  accession_no: order.accession_no || "N/A",
  block_code: order.block_code || "N/A",
  stain_type: order.stain_type || order.stain_name || order.test_name || order.test?.name || "H&E",
  reg_date: order.created_at,
});
