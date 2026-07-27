import React, { useMemo, useRef } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { NongyneCytologyCase } from "../../../types/nongyne";
import { useStickerPdf } from "../../../hooks/useStickerPdf";
import type { StickerLabelFields, StickerLabelStyle } from "../../../utils/stickerLabel";
const { Text } = Typography;

interface NongynePrintPreviewModalProps {
  open: boolean;
  onCancel: () => void;
  data: NongyneCytologyCase | null;
}

const STICKER_STYLE: StickerLabelStyle = {
  accessionBold: true,
  accessionFontSize: 13,
  barcodeImageHeight: 12,
  patientNameBold: true,
  patientNameNoWrap: true,
  subLabelFontSize: 6.5,
  regDateLabel: "Reg Date:",
  regDateFontSize: 6.5,
};

const NongynePrintPreviewModal: React.FC<NongynePrintPreviewModalProps> = ({
  open,
  onCancel,
  data,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fields = useMemo<StickerLabelFields | null>(() => {
    if (!data) return null;
    return {
      accessionNo: data.accession_no,
      hn: data.hn,
      patientNameLine: [data.patient?.title?.title, data.patient?.name, data.patient?.ln]
        .filter(Boolean)
        .join(" "),
      subLabelText: (data.hospital?.name || "NON-GYNE CYTOLOGY").toUpperCase(),
      registeredAt: data.registered_at,
    };
  }, [data]);

  const { pdfUrl, loading } = useStickerPdf(open, fields, STICKER_STYLE, "Nongyne PDF Error:");

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Modal
      title="Print Non-Gyne Slide Label"
      open={open}
      onCancel={onCancel}
      width={400}
      centered
      footer={[
        <Button key="close" onClick={onCancel}>
          ปิด
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          disabled={!pdfUrl}
          style={{ backgroundColor: "#1890ff", borderColor: "#1890ff" }}
        >
          พิมพ์สติ๊กเกอร์ (Slide)
        </Button>,
      ]}
    >
      <div
        style={{
          textAlign: "center",
          minHeight: "220px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {loading ? (
          <Spin tip="Preparing Label..." />
        ) : pdfUrl ? (
          <div>
            <div
              style={{
                border: "2px dashed #1890ff",
                padding: "10px",
                background: "#e6f7ff",
                borderRadius: "8px",
              }}
            >
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Nongyne Label Preview"
                style={{ width: "100%", height: "160px", border: "none" }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ color: "#1890ff" }}>
                {data?.accession_no}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: "11px" }}>
                ตรวจสอบชื่อ-สกุล และประเภทสิ่งส่งตรวจก่อนติดสไลด์
              </Text>
            </div>
          </div>
        ) : (
          <Empty description="No Data to Print" />
        )}
      </div>
    </Modal>
  );
};

export default NongynePrintPreviewModal;
