import React from "react";
import { Button, Modal } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

interface Props {
  open: boolean;
  pdfUrl: string | null;
  onCancel: () => void;
  filename?: string;
  /** Actions to take on what's being previewed (e.g. Approve), so a
   *  review-then-act flow doesn't need close-the-preview-then-click. */
  footer?: React.ReactNode;
}

// Roughly the footer's height (button + antd's margin-top), taken off the body
// so the footer stays on screen instead of pushing the modal past the viewport.
const FOOTER_HEIGHT = 44;

const ReportPreviewModal: React.FC<Props> = ({ open, pdfUrl, onCancel, filename, footer }) => {
  const titleBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 40 }}>
      <span>Report Preview</span>
      {pdfUrl && (
        <Button
          icon={<DownloadOutlined />}
          href={pdfUrl}
          download={filename ?? "report.pdf"}
          target="_blank"
          size="small"
        >
          Download
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={footer ?? null}
      width="90vw"
      style={{ top: 24, maxWidth: 1400 }}
      styles={{ body: { padding: 0, height: footer ? `calc(85vh - ${FOOTER_HEIGHT}px)` : "85vh" } }}
      title={titleBar}
      destroyOnClose
    >
      {pdfUrl ? (
        <iframe
          src={`${pdfUrl}#toolbar=1&navpanes=0`}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          title="PDF Preview"
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <span style={{ color: "#999" }}>No PDF available</span>
        </div>
      )}
    </Modal>
  );
};

export default ReportPreviewModal;
