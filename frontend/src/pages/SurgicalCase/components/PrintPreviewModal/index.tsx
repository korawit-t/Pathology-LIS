import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import JsBarcode from "jsbarcode";
import pdfMake from "../../../../pdfFonts";
import { SurgicalCase } from "../../../../types/surgical";
import dayjs from "dayjs";
import logger from "../../../../utils/logger";

const { Text } = Typography;

interface PrintPreviewModalProps {
  open: boolean;
  onCancel: () => void;
  surgicalCase: SurgicalCase | null; // ✅ รับมาตัวเดียว เพราะใน Case มี Patient อยู่แล้ว
}

const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  open,
  onCancel,
  surgicalCase,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // พิมพ์เพียงใบเดียวเมื่อเปิด Modal และมีข้อมูลเคส
    if (open && surgicalCase) {
      generateCaseSticker();
    }
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [open, surgicalCase]);

  const generateCaseSticker = () => {
    if (!surgicalCase) return;
    setLoading(true);

    try {
      // 1. สร้าง Barcode จาก Accession No หลัก (เช่น S26-00001)
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, surgicalCase.accession_no, {
        format: "CODE128",
        displayValue: false,
        height: 40,
        margin: 0,
      });
      const barcodeBase64 = canvas.toDataURL();

      // 2. กำหนดโครงสร้าง PDF ใบเดียว (Size 142x70)
      const docDefinition: any = {
        pageSize: { width: 142, height: 70 },
        pageMargins: [5, 4, 5, 2],
        defaultStyle: { font: "Sarabun", fontSize: 8 },
        content: [
          // แถวบน: Accession No และ HN
          {
            columns: [
              { text: surgicalCase.accession_no, bold: false, fontSize: 14 },
              {
                text: `HN: ${surgicalCase.hn || ""}`,
                alignment: "right",
                fontSize: 10,
              },
            ],
          },
          // Barcode (แบบ Slim)
          {
            image: barcodeBase64,
            width: 120,
            height: 10,
            alignment: "center",
            margin: [0, 1, 0, 0],
          },
          {
            text: [surgicalCase.patient?.title?.title, surgicalCase.patient?.name, surgicalCase.patient?.ln].filter(Boolean).join(" "),
            fontSize: 9,
            bold: false,
            alignment: "center",
            margin: [0, 2, 0, 0],
          },
          // ชื่อโรงพยาบาล (อยู่ตรงกลาง ใต้ชื่อคนไข้)
          {
            text: (
              surgicalCase.hospital?.name || "PATHOLOGY UNIT"
            ).toUpperCase(),
            fontSize: 6,
            alignment: "center",
            color: "black",
            margin: [0, 1, 0, 0],
          },
          {
            text: `Reg: ${
              surgicalCase.registered_at
                ? dayjs(surgicalCase.registered_at).format("DD/MM/YYYY")
                : "-"
            }`,
            fontSize: 6, // ขยายขนาดฟอนต์ขึ้นเล็กน้อยเพราะข้อความสั้นลง
            alignment: "center",
            color: "black",
            margin: [0, 0, 0, 0], // เพิ่ม margin บนอีกนิดเพื่อให้สมดุลกับพื้นที่ว่าง
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
      logger.error("PDF Error:", error);
      setLoading(false);
    }
  };

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Modal
      title="Print Main Case Label"
      open={open}
      onCancel={onCancel}
      width={400}
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
              สติ๊กเกอร์หลักสำหรับ Accession No: {surgicalCase?.accession_no}
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
