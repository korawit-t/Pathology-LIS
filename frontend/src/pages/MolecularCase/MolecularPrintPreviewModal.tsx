import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import JsBarcode from "jsbarcode";
import pdfMake from "../../pdfFonts";
import dayjs from "dayjs";
import logger from "../../utils/logger";

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

const MolecularPrintPreviewModal: React.FC<MolecularPrintPreviewModalProps> = ({
  open,
  onCancel,
  data,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (open && data) {
      generateMolecularSticker();
    }
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  const generateMolecularSticker = () => {
    if (!data) return;
    setLoading(true);

    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, data.accession_no, {
        format: "CODE128",
        displayValue: false,
        height: 40,
        margin: 0,
      });
      const barcodeBase64 = canvas.toDataURL();

      // Same 142x70pt (~5x2.5cm) label size as Surgical/Gyne/Non-Gyne.
      const docDefinition: any = {
        pageSize: { width: 142, height: 70 },
        pageMargins: [5, 4, 5, 2],
        defaultStyle: { font: "Sarabun", fontSize: 8 },
        content: [
          {
            columns: [
              { text: data.accession_no, bold: true, fontSize: 13, color: "black" },
              { text: `HN: ${data.hn || ""}`, alignment: "right", fontSize: 10 },
            ],
          },
          {
            image: barcodeBase64,
            width: 120,
            height: 12,
            alignment: "center",
            margin: [0, 1, 0, 0],
          },
          {
            text: data.patient_name || "-",
            fontSize: 9,
            bold: true,
            alignment: "center",
            margin: [0, 2, 0, 0],
            noWrap: true,
          },
          // Molecular test name (e.g. "EGFR MUTATION ANALYSIS") in place of
          // hospital/specimen-type — the more useful thing to see on a
          // Molecular label, since it names what's actually being tested.
          {
            text: (data.test_name || "MOLECULAR PATHOLOGY").toUpperCase(),
            fontSize: 6.5,
            alignment: "center",
            color: "black",
            margin: [0, 1, 0, 0],
          },
          {
            text: `Reg Date: ${
              data.registered_at ? dayjs(data.registered_at).format("DD/MM/YYYY") : "-"
            }`,
            fontSize: 6.5,
            alignment: "center",
            color: "black",
            margin: [0, 0, 0, 0],
          },
        ],
      };

      const pdfDoc = (pdfMake as any).createPdf(docDefinition);
      pdfDoc.getBlob((blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setLoading(false);
      });
    } catch (error) {
      logger.error("Molecular PDF Error:", error);
      setLoading(false);
    }
  };

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
