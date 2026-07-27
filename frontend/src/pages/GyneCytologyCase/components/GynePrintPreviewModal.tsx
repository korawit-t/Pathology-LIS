import React, { useMemo, useRef } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { GyneCytologyCase } from "../../../types/gyne-cytology";
import { useStickerPdf } from "../../../hooks/useStickerPdf";
import type { StickerLabelFields, StickerLabelStyle } from "../../../utils/stickerLabel";
const { Text } = Typography;

interface GynePrintPreviewModalProps {
  open: boolean;
  onCancel: () => void;
  data: GyneCytologyCase | null;
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

const GynePrintPreviewModal: React.FC<GynePrintPreviewModalProps> = ({
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
      subLabelText: (data.hospital?.name || "GYNE CYTOLOGY").toUpperCase(),
      registeredAt: data.registered_at,
    };
  }, [data]);

  const { pdfUrl, loading } = useStickerPdf(open, fields, STICKER_STYLE, "Gyne PDF Error:");

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Modal
      title="Print Gyne Slide Label"
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
          style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
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
                border: "2px dashed #722ed1",
                padding: "10px",
                background: "#f9f0ff",
                borderRadius: "8px",
              }}
            >
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Gyne Label Preview"
                style={{ width: "100%", height: "160px", border: "none" }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ color: "#722ed1" }}>
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

export default GynePrintPreviewModal;
