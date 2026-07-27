import React, { useMemo, useRef } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useStickerPdf } from "../../hooks/useStickerPdf";
import type { StickerLabelFields, StickerLabelStyle } from "../../utils/stickerLabel";

const { Text } = Typography;

/** Minimal field set the sticker needs — deliberately not `MolecularCaseResponse`
 * itself, so callers that already have the data in a different shape (e.g.
 * UnifiedAccession's flattened `UnifiedRow`) can pass it straight through
 * without an extra case-detail fetch. */
export interface MolecularStickerData {
  accession_no: string;
  hn?: string | null;
  patient_name?: string | null;
  test_name?: string | null;
  registered_at?: string | null;
}

interface MolecularPrintPreviewModalProps {
  open: boolean;
  onCancel: () => void;
  data: MolecularStickerData | null;
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

const MolecularPrintPreviewModal: React.FC<MolecularPrintPreviewModalProps> = ({
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
      patientNameLine: data.patient_name || "-",
      // Molecular test name (e.g. "EGFR MUTATION ANALYSIS") in place of
      // hospital/specimen-type — the more useful thing to see on a
      // Molecular label, since it names what's actually being tested.
      subLabelText: (data.test_name || "MOLECULAR PATHOLOGY").toUpperCase(),
      registeredAt: data.registered_at,
    };
  }, [data]);

  const { pdfUrl, loading } = useStickerPdf(open, fields, STICKER_STYLE, "Molecular PDF Error:");

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Modal
      title="Print Molecular Label"
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
          พิมพ์สติ๊กเกอร์ (Molecular)
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
                title="Molecular Label Preview"
                style={{ width: "100%", height: "160px", border: "none" }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ color: "#722ed1" }}>
                {data?.accession_no}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: "11px" }}>
                ตรวจสอบชื่อ-สกุล และชื่อการตรวจก่อนติดสติ๊กเกอร์
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

export default MolecularPrintPreviewModal;
