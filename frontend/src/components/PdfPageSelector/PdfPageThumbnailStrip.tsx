import React from "react";
import { Button, Checkbox, Space, Spin, Typography } from "antd";
import { BorderOutlined, CheckSquareOutlined } from "@ant-design/icons";

const { Text } = Typography;

export interface PdfPageThumbnailStripProps {
  pageCount: number;
  selectedPages: number[];
  thumbnails: string[];
  loadingThumbnails: boolean;
  previewPageNo: number | null;
  onHoverPage: (pageNo: number) => void;
  onTogglePage: (pageNo: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  maxHeight?: number;
}

/** Toolbar (select all / clear all / counter) + a narrow scrollable column of
 * page thumbnails. Deliberately has no large preview of its own — pair it
 * with PdfPagePreviewPane, positioned wherever the layout calls for. */
const PdfPageThumbnailStrip: React.FC<PdfPageThumbnailStripProps> = ({
  pageCount,
  selectedPages,
  thumbnails,
  loadingThumbnails,
  previewPageNo,
  onHoverPage,
  onTogglePage,
  onSelectAll,
  onClearAll,
  maxHeight = 380,
}) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Space>
        <Button
          size="small"
          icon={<CheckSquareOutlined />}
          onClick={onSelectAll}
          disabled={selectedPages.length === pageCount}
        >
          Select All
        </Button>
        <Button
          size="small"
          icon={<BorderOutlined />}
          onClick={onClearAll}
          danger={selectedPages.length > 0}
        >
          Clear All
        </Button>
      </Space>
      <Text strong>
        Selected:{" "}
        <span style={{ color: selectedPages.length === pageCount ? "#52c41a" : "#fa8c16" }}>
          {selectedPages.length} / {pageCount}
        </span>
      </Text>
    </div>
    {loadingThumbnails ? (
      <div style={{ textAlign: "center", padding: 24 }}>
        <Spin tip="Rendering pages...">
          <div style={{ width: "100%", height: 60 }} />
        </Spin>
      </div>
    ) : (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          gap: 8,
          maxHeight,
          overflowY: "auto",
          padding: 8,
          border: "1px solid #f0f0f0",
          borderRadius: 8,
        }}
      >
        {thumbnails.map((src, idx) => {
          const pageNo = idx + 1;
          const checked = selectedPages.includes(pageNo);
          const isPreviewed = previewPageNo === pageNo;
          return (
            <div
              key={pageNo}
              onMouseEnter={() => onHoverPage(pageNo)}
              onClick={() => onTogglePage(pageNo)}
              style={{
                cursor: "pointer",
                width: 84,
                border: checked ? "2px solid #52c41a" : "2px solid #d9d9d9",
                boxShadow: isPreviewed ? "0 0 0 2px #1677ff" : undefined,
                borderRadius: 6,
                padding: 4,
                textAlign: "center",
                background: checked ? "#f6ffed" : "#fff",
                flexShrink: 0,
              }}
            >
              <img src={src} alt={`Page ${pageNo}`} style={{ width: "100%", display: "block", marginBottom: 4 }} />
              <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={() => onTogglePage(pageNo)} />
              <div style={{ fontSize: 11 }}>{pageNo}</div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default PdfPageThumbnailStrip;
