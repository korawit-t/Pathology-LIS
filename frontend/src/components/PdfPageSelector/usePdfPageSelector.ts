import { useEffect, useRef, useState } from "react";
import {
  extractPdfPages,
  getPdfPageCount,
  loadPdfDocument,
  renderAllPdfThumbnails,
  renderPdfPage,
  type LoadedPdf,
} from "./pdfPageUtils";
import logger from "../../utils/logger";

const PREVIEW_SCALE = 1.4;

export interface UsePdfPageSelectorResult {
  /** null while inspecting, or for single-page/unparsable PDFs (no picker UI needed). */
  pageCount: number | null;
  mode: "all" | "select";
  setMode: (mode: "all" | "select") => void;
  selectedPages: number[];
  thumbnails: string[];
  loadingThumbnails: boolean;
  previewPageNo: number | null;
  previewSrc: string | undefined;
  previewLoading: boolean;
  ensurePreview: (pageNo: number) => void;
  togglePage: (pageNo: number) => void;
  selectAll: () => void;
  clearAll: () => void;
}

/**
 * Drives the "upload all pages vs. select pages" flow: inspects the dropped
 * PDF, lazily renders thumbnails + an on-demand higher-res preview per page,
 * and calls `onReady` with whatever File should actually be uploaded (the
 * original file, a page-subset PDF built client-side, or null once every
 * page is deselected). Presentation is left to the caller — see
 * PdfPageThumbnailStrip / PdfPagePreviewPane for the pieces this pairs with.
 */
export function usePdfPageSelector(
  file: File | null,
  onReady: (finalFile: File | null) => void,
): UsePdfPageSelectorResult {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [mode, setModeState] = useState<"all" | "select">("all");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [previewPageNo, setPreviewPageNo] = useState<number | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<number, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestIdRef = useRef(0);
  const docRef = useRef<LoadedPdf | null>(null);

  // Reset and re-inspect whenever a new file is dropped.
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    docRef.current?.destroy();
    docRef.current = null;
    setPageCount(null);
    setModeState("all");
    setSelectedPages([]);
    setThumbnails([]);
    setPreviewPageNo(null);
    setPreviewCache({});

    if (!file) {
      onReady(null);
      return;
    }

    getPdfPageCount(file)
      .then((count) => {
        if (requestIdRef.current !== requestId) return;
        if (count <= 1) {
          onReady(file);
          return;
        }
        setPageCount(count);
        setSelectedPages(Array.from({ length: count }, (_, i) => i + 1));
        onReady(file);
      })
      .catch((err) => {
        logger.error("Failed to inspect PDF page count:", err);
        if (requestIdRef.current !== requestId) return;
        // Don't block the upload just because preview parsing failed.
        onReady(file);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Free the parsed document on unmount too.
  useEffect(() => () => { docRef.current?.destroy(); }, []);

  const ensurePreview = (pageNo: number) => {
    setPreviewPageNo(pageNo);
    if (previewCache[pageNo] || !docRef.current) return;
    const requestId = requestIdRef.current;
    setPreviewLoading(true);
    renderPdfPage(docRef.current.doc, pageNo, PREVIEW_SCALE)
      .then((src) => {
        if (requestIdRef.current !== requestId) return;
        setPreviewCache((prev) => ({ ...prev, [pageNo]: src }));
      })
      .catch((err) => logger.error("Failed to render page preview:", err))
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setPreviewLoading(false);
      });
  };

  const setMode = (value: "all" | "select") => {
    setModeState(value);
    if (value === "select" && thumbnails.length === 0 && file) {
      const requestId = requestIdRef.current;
      setLoadingThumbnails(true);
      loadPdfDocument(file)
        .then(async (loaded) => {
          if (requestIdRef.current !== requestId) {
            await loaded.destroy();
            return;
          }
          docRef.current = loaded;
          const thumbs = await renderAllPdfThumbnails(loaded.doc);
          if (requestIdRef.current !== requestId) return;
          setThumbnails(thumbs);
          ensurePreview(1);
        })
        .catch((err) => logger.error("Failed to render PDF thumbnails:", err))
        .finally(() => {
          if (requestIdRef.current !== requestId) return;
          setLoadingThumbnails(false);
        });
    }
  };

  const applySelection = (pages: number[]) => {
    setSelectedPages(pages);
    if (!file || !pageCount) return;
    if (pages.length === pageCount) {
      onReady(file);
    } else if (pages.length === 0) {
      onReady(null);
    } else {
      const requestId = requestIdRef.current;
      extractPdfPages(file, pages)
        .then((sliced) => {
          if (requestIdRef.current !== requestId) return;
          onReady(sliced);
        })
        .catch((err) => {
          logger.error("Failed to extract selected PDF pages:", err);
          onReady(file);
        });
    }
  };

  const togglePage = (pageNo: number) => {
    const next = selectedPages.includes(pageNo)
      ? selectedPages.filter((p) => p !== pageNo)
      : [...selectedPages, pageNo];
    applySelection(next);
  };

  return {
    pageCount,
    mode,
    setMode,
    selectedPages,
    thumbnails,
    loadingThumbnails,
    previewPageNo,
    previewSrc: previewPageNo ? previewCache[previewPageNo] : undefined,
    previewLoading,
    ensurePreview,
    togglePage,
    selectAll: () => {
      if (pageCount) applySelection(Array.from({ length: pageCount }, (_, i) => i + 1));
    },
    clearAll: () => applySelection([]),
  };
}
