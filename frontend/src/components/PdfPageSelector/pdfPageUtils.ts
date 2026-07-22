import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

// Bundled locally (not a CDN) — this app is deployed LAN-only inside hospital
// networks with no guaranteed internet access.
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  try {
    return doc.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

/** Keeps the parsed document around so individual pages can be re-rendered
 * on demand (e.g. thumbnails now, a bigger preview later) without re-parsing
 * the whole file each time. Caller must call `destroy()` when done. */
export async function loadPdfDocument(file: File): Promise<LoadedPdf> {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  return { doc, destroy: () => loadingTask.destroy() };
}

export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas.toDataURL("image/png");
}

export async function renderAllPdfThumbnails(doc: PDFDocumentProxy, scale = 0.3): Promise<string[]> {
  const thumbnails: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    thumbnails.push(await renderPdfPage(doc, pageNumber, scale));
  }
  return thumbnails;
}

/** pageNumbers are 1-indexed; order is normalized to ascending (original page order). */
export async function extractPdfPages(
  file: File,
  pageNumbers: number[],
): Promise<File> {
  const buffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buffer);
  const newDoc = await PDFDocument.create();
  const indices = [...pageNumbers].sort((a, b) => a - b).map((n) => n - 1);
  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  copiedPages.forEach((page) => newDoc.addPage(page));
  const bytes = await newDoc.save();
  return new File([new Uint8Array(bytes)], file.name, { type: "application/pdf" });
}
