import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Spin, Empty, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import JsBarcode from "jsbarcode";
import pdfMake from "../../../pdfFonts";
import { GyneCytologyCase } from "../../../types/gyne-cytology";
import dayjs from "dayjs";
import logger from "../../../utils/logger";
const { Text } = Typography;

interface GynePrintPreviewModalProps {
  open: boolean;
  onCancel: () => void;
  data: GyneCytologyCase | null;
}

const GynePrintPreviewModal: React.FC<GynePrintPreviewModalProps> = ({
  open,
  onCancel,
  data,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (open && data) {
      generateGyneSticker();
    }
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [open, data]);

  const generateGyneSticker = () => {
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

      // ขนาดสติ๊กเกอร์มาตรฐานสำหรับ Slide (มม.) แปลงเป็น Points (142x70 pts ประมาณ 5x2.5 cm)
      const docDefinition: any = {
        pageSize: { width: 142, height: 70 },
        pageMargins: [5, 4, 5, 2],
        defaultStyle: { font: "Sarabun", fontSize: 8 },
        content: [
          // 1. เลขเคส (สีม่วง) และ HN
          {
            columns: [
              {
                text: data.accession_no,
                bold: true,
                fontSize: 13,
                color: "black",
              },
              {
                text: `HN: ${data.hn || ""}`,
                alignment: "right",
                fontSize: 10,
              },
            ],
          },
          // 2. Barcode (Slim - Pattern เดียวกับ Surgical)
          {
            image: barcodeBase64,
            width: 120,
            height: 12,
            alignment: "center",
            margin: [0, 1, 0, 0],
          },
          // 3. ชื่อคนไข้
          {
            text: [data.patient?.title?.title, data.patient?.name, data.patient?.ln].filter(Boolean).join(" "),
            fontSize: 9,
            bold: true,
            alignment: "center",
            margin: [0, 2, 0, 0],
            noWrap: true,
          },
          // 4. ประเภทสิ่งส่งตรวจ (Type) และ ชื่อหน่วยงาน/รพ.
          {
            text: (data.hospital?.name || "GYNE CYTOLOGY").toUpperCase(),
            fontSize: 6.5,
            alignment: "center",
            color: "black",
            margin: [0, 1, 0, 0],
          },
          // 5. วันที่ลงทะเบียน
          {
            text: `Reg Date: ${
              data.registered_at
                ? dayjs(data.registered_at).format("DD/MM/YYYY")
                : "-"
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
      logger.error("Gyne PDF Error:", error);
      setLoading(false);
    }
  };

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
