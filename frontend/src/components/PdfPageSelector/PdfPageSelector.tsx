import React from "react";
import { usePdfPageSelector } from "./usePdfPageSelector";
import PdfPageThumbnailStrip from "./PdfPageThumbnailStrip";
import PdfPagePreviewPane from "./PdfPagePreviewPane";

export interface PdfPageSelectorProps {
  file: File | null;
  /** Fires with the file to actually upload — the original file unchanged
   * (single-page PDF, unparsable PDF, or every page still selected), a
   * page-subset PDF built client-side, or null when the user has deselected
   * every page. */
  onReady: (finalFile: File | null) => void;
}

/**
 * Self-contained page picker: thumbnail strip on the left (all pages
 * pre-selected — leave them all checked to upload the whole file), enlarged
 * preview on the right, side by side. For layouts that need the preview
 * pinned elsewhere (e.g. the right edge of a wide modal), use
 * `usePdfPageSelector` + `PdfPageThumbnailStrip` + `PdfPagePreviewPane`
 * directly instead — see OutlabTestQueue/OutlabConsultList/SurgicalDiagnosisReportForm.
 */
const PdfPageSelector: React.FC<PdfPageSelectorProps> = ({ file, onReady }) => {
  const state = usePdfPageSelector(file, onReady);

  if (!file || !state.pageCount || state.pageCount <= 1) return null;

  return (
    <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
      <div style={{ width: 240, flex: "0 0 auto" }}>
        <PdfPageThumbnailStrip
          pageCount={state.pageCount}
          selectedPages={state.selectedPages}
          thumbnails={state.thumbnails}
          loadingThumbnails={state.loadingThumbnails}
          previewPageNo={state.previewPageNo}
          onHoverPage={state.ensurePreview}
          onTogglePage={state.togglePage}
          onSelectAll={state.selectAll}
          onClearAll={state.clearAll}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <PdfPagePreviewPane
          previewPageNo={state.previewPageNo}
          previewSrc={state.previewSrc}
          previewLoading={state.previewLoading}
        />
      </div>
    </div>
  );
};

export default PdfPageSelector;
