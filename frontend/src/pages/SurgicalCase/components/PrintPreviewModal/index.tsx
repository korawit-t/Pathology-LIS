import React, { useMemo, useRef } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { SurgicalCase } from "../../../../types/surgical";
import { useStickerPdf } from "../../../../hooks/useStickerPdf";
import type { StickerLabelFields, StickerLabelStyle } from "../../../../utils/stickerLabel";
import type { PrintPreviewModalProps } from "../../../../types/printPreviewModal";
import { formatPatientName } from "../../../../utils/patientName";

const { Text } = Typography;

type SurgicalPrintPreviewModalProps = PrintPreviewModalProps<SurgicalCase>;

const STICKER_STYLE: StickerLabelStyle = {
  accessionBold: false,
  accessionFontSize: 14,
  // Fixed from 10 — was rendering a smaller, less-scannable barcode than
  // Gyne/Nongyne/Molecular for no stated reason, on an identical label.
  barcodeImageHeight: 12,
  // Fixed from false/absent — a long patient name could wrap to a second
  // line and collide with the lines beneath on this ~5x2.5cm label;
  // Gyne/Nongyne/Molecular already had this fix.
  patientNameBold: true,
  patientNameNoWrap: true,
  subLabelFontSize: 6,
  regDateLabel: "Reg:",
  regDateFontSize: 6,
};

const PrintPreviewModal: React.FC<SurgicalPrintPreviewModalProps> = ({
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
      patientNameLine: formatPatientName(data.patient),
      subLabelText: (data.hospital?.name || "PATHOLOGY UNIT").toUpperCase(),
      registeredAt: data.registered_at,
    };
  }, [data]);

  const { pdfUrl, loading } = useStickerPdf(open, fields, STICKER_STYLE, "PDF Error:");

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Modal
      title="Print Main Case Label"
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
        >
          พิมพ์สติ๊กเกอร์เคส
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
          <Spin tip="กำลังเตรียมข้อมูล..." />
        ) : pdfUrl ? (
          <div>
            <div
              style={{
                border: "1px solid #ddd",
                padding: "5px",
                background: "#f5f5f5",
              }}
            >
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Case Label Preview"
                style={{ width: "100%", height: "180px", border: "none" }}
              />
            </div>
            <Text
              type="secondary"
              style={{ fontSize: "12px", marginTop: 8, display: "block" }}
            >
              สติ๊กเกอร์หลักสำหรับ Accession No: {data?.accession_no}
            </Text>
          </div>
        ) : (
          <Empty description="ไม่มีข้อมูล" />
        )}
      </div>
    </Modal>
  );
};

export default PrintPreviewModal;
