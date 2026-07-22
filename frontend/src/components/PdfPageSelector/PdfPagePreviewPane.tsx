import React from "react";
import { Spin, Typography } from "antd";

const { Text } = Typography;

export interface PdfPagePreviewPaneProps {
  previewPageNo: number | null;
  previewSrc?: string;
  previewLoading: boolean;
  minHeight?: number;
}

/** Large render of whichever page is currently hovered/selected in a
 * PdfPageThumbnailStrip. Kept separate from the strip so callers can place it
 * anywhere in their own layout (e.g. pinned to the right side of a modal). */
const PdfPagePreviewPane: React.FC<PdfPagePreviewPaneProps> = ({
  previewPageNo,
  previewSrc,
  previewLoading,
  minHeight = 380,
}) => (
  <div
    style={{
      height: "100%",
      minHeight,
      background: "#fafafa",
      border: "1px solid #f0f0f0",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
    }}
  >
    {previewLoading ? (
      <Spin tip="Loading preview...">
        <div style={{ width: "100%", height: 60 }} />
      </Spin>
    ) : previewSrc ? (
      <img
        src={previewSrc}
        alt={`Page ${previewPageNo} preview`}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
      />
    ) : (
      <Text type="secondary">Hover or click a page to preview</Text>
    )}
    {previewPageNo && (
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        Page {previewPageNo}
      </div>
    )}
  </div>
);

export default PdfPagePreviewPane;
