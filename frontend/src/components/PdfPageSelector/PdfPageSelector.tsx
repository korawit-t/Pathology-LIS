import React from "react";
import { Segmented } from "antd";
import { usePdfPageSelector } from "./usePdfPageSelector";
import PdfPageThumbnailStrip from "./PdfPageThumbnailStrip";
import PdfPagePreviewPane from "./PdfPagePreviewPane";

export interface PdfPageSelectorProps {
  file: File | null;
  /** Fires with the file to actually upload — the original file unchanged
   * (single-page PDF, unparsable PDF, or "Upload All Pages" mode), a
   * page-subset PDF built client-side, or null when the user has deselected
   * every page. */
  onReady: (finalFile: File | null) => void;
}

/**
 * Self-contained "upload all pages vs. select pages" picker: thumbnail strip
 * on the left, enlarged preview on the right, side by side. For layouts that
 * need the preview pinned elsewhere (e.g. the right edge of a wide modal),
 * use `usePdfPageSelector` + `PdfPageThumbnailStrip` + `PdfPagePreviewPane`
 * directly instead — see OutlabTestQueue/OutlabConsultList/SurgicalDiagnosisReportForm.
 */
const PdfPageSelector: React.FC<PdfPageSelectorProps> = ({ file, onReady }) => {
  const state = usePdfPageSelector(file, onReady);

  if (!file || !state.pageCount || state.pageCount <= 1) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <Segmented
        block
        value={state.mode}
        onChange={(v) => state.setMode(v as "all" | "select")}
        options={[
          { label: `Upload All Pages (${state.pageCount})`, value: "all" },
          { label: "Select Pages", value: "select" },
        ]}
      />
      {state.mode === "select" && (
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
      )}
    </div>
  );
};

export default PdfPageSelector;
