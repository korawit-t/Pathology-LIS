import React from "react";
import { Button, Modal } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

interface Props {
  open: boolean;
  pdfUrl: string | null;
  onCancel: () => void;
  filename?: string;
}

const ReportPreviewModal: React.FC<Props> = ({ open, pdfUrl, onCancel, filename }) => {
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
      footer={null}
      width="90vw"
      style={{ top: 24, maxWidth: 1400 }}
      styles={{ body: { padding: 0, height: "85vh" } }}
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
