import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Divider,
  Form,
  InputNumber,
  Row,
  Segmented,
  Space,
  Typography,
  message,
} from "antd";
import { PrinterOutlined, SaveOutlined, TagsOutlined } from "@ant-design/icons";
import SystemSettingService from "../../../services/systemSettingService";
import { executePrint } from "../../Stain/PrintStickerHE/utils/generateHEStickers";

const { Text, Title } = Typography;

const SettingRow = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Row gutter={[16, 16]} style={{ padding: "16px 0", borderBottom: "1px solid #f0f0f0" }}>
    <Col xs={24} md={14}>
      <Space direction="vertical" size={0}>
        <Text strong style={{ fontSize: "14px" }}>{title}</Text>
        {description && (
          <Text type="secondary" style={{ fontSize: "12px" }}>{description}</Text>
        )}
      </Space>
    </Col>
    <Col xs={24} md={10} style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
      {children}
    </Col>
  </Row>
);

const FontInput: React.FC<{ name: string }> = ({ name }) => (
  <Form.Item name={name} noStyle>
    <InputNumber min={4} max={24} step={1} precision={0} addonAfter="pt" style={{ width: 120 }} />
  </Form.Item>
);

const StickerPreview: React.FC<{
  width: number; height: number;
  fAccession: number; fBlock: number; fStain: number; fHospital: number; fDate: number;
}> = ({ width, height, fAccession, fBlock, fStain, fHospital, fDate }) => {
  const SCALE = 40;
  const pw = Math.max(24, (width || 2) * SCALE);
  const ph = Math.max(24, (height || 2) * SCALE);
  const sizeScale = Math.min(width || 2, height || 2) / 2.0;

  const px = (pt: number) => Math.max(3, (pt * sizeScale * 0.75));

  const qrSide = Math.max(10, 0.8 * sizeScale * SCALE);

  return (
    <div style={{ background: "#fafafa", borderRadius: 8, padding: 20, marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
        <div
          style={{
            width: pw, height: ph,
            border: "1.5px dashed #1890ff",
            borderRadius: 3,
            background: "#fff",
            padding: 3,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: px(fAccession), fontWeight: 700, color: "#333", lineHeight: 1.2 }}>S26-00001</div>
          <div style={{ lineHeight: 1.2 }}>
            <span style={{ fontSize: px(fBlock), fontWeight: 700, color: "#1890ff" }}>A1</span>
            <span style={{ fontSize: px(fDate), color: "#888", marginLeft: 4 }}>09/06/26</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: px(fStain), color: "#555", lineHeight: 1.2 }}>H&amp;E</div>
              <div style={{ fontSize: px(fHospital), fontWeight: 700, color: "#333", lineHeight: 1.2 }}>PATH</div>
            </div>
            <div style={{
              width: qrSide, height: qrSide,
              background: "repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0/4px 4px",
              borderRadius: 1, flexShrink: 0,
            }} />
          </div>
        </div>

        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>Width: <Text strong>{width || 2} cm</Text></Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Height: <Text strong>{height || 2} cm</Text></Text>
          <Divider style={{ margin: "6px 0" }} />
          <Text type="secondary" style={{ fontSize: 12 }}>Accession: <Text strong>{fAccession}pt</Text></Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Block code: <Text strong>{fBlock}pt</Text></Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Stain type: <Text strong>{fStain}pt</Text></Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Hospital: <Text strong>{fHospital}pt</Text></Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Date: <Text strong>{fDate}pt</Text></Text>
        </Space>
      </div>
    </div>
  );
};

const StickerTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const width       = Form.useWatch("sticker_width_cm", form)       ?? 2.0;
  const height      = Form.useWatch("sticker_height_cm", form)      ?? 2.0;
  const orientation = Form.useWatch("sticker_orientation", form)    ?? "portrait";
  const fAccession  = Form.useWatch("sticker_font_accession", form) ?? 7;
  const fBlock      = Form.useWatch("sticker_font_block", form)     ?? 7;
  const fStain      = Form.useWatch("sticker_font_stain", form)     ?? 6;
  const fHospital   = Form.useWatch("sticker_font_hospital", form)  ?? 6;
  const fDate       = Form.useWatch("sticker_font_date", form)      ?? 6;

  const previewW = orientation === "landscape" ? Math.max(width, height) : Math.min(width, height);
  const previewH = orientation === "landscape" ? Math.min(width, height) : Math.max(width, height);

  const load = async () => {
    try {
      const data = await SystemSettingService.getSettings();
      form.setFieldsValue(data);
    } catch {
      message.error("Failed to load sticker settings");
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Sticker settings saved");
      load();
    } catch {
      message.error("Failed to save sticker settings");
    } finally {
      setLoading(false);
    }
  };

  const handleTestPrint = async () => {
    setPrinting(true);
    try {
      const blob = await SystemSettingService.testPrintSticker();
      executePrint(blob);
    } catch {
      message.error("ไม่สามารถพิมพ์ทดสอบได้");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>
            <TagsOutlined /> Slide Sticker / Label
          </Title>
          <Button
            icon={<PrinterOutlined />}
            loading={printing}
            onClick={handleTestPrint}
          >
            Test Print
          </Button>
        </div>

        <Alert
          type="info"
          showIcon
          message="ตั้งค่าขนาดสติกเกอร์และตัวอักษรให้ตรงกับเครื่องพิมพ์"
          description="ขนาดตัวอักษรเป็นค่าที่ 2.0×2.0 cm — หากเปลี่ยนขนาด sticker ตัวอักษรจะ scale ตาม"
          style={{ marginBottom: 24 }}
        />

        {/* Size */}
        <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8, marginBottom: 16 }}>
          <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 13 }}>Sticker Size</Title>
          <SettingRow title="Width" description="ความกว้าง (cm)">
            <Form.Item name="sticker_width_cm" noStyle>
              <InputNumber min={1.0} max={10.0} step={0.1} precision={1} addonAfter="cm" style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
          <SettingRow title="Height" description="ความสูง (cm)">
            <Form.Item name="sticker_height_cm" noStyle>
              <InputNumber min={1.0} max={10.0} step={0.1} precision={1} addonAfter="cm" style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
          <SettingRow title="Orientation" description="แนวการพิมพ์ — Portrait (แนวตั้ง) / Landscape (แนวนอน)">
            <Form.Item name="sticker_orientation" noStyle>
              <Segmented
                options={[
                  { label: "Portrait (แนวตั้ง)", value: "portrait" },
                  { label: "Landscape (แนวนอน)", value: "landscape" },
                ]}
              />
            </Form.Item>
          </SettingRow>
        </div>

        {/* Font sizes */}
        <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8, marginBottom: 16 }}>
          <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 13 }}>Font Sizes (at 2.0 cm baseline)</Title>
          <SettingRow title="Accession No." description="เลข Accession — Row 1">
            <FontInput name="sticker_font_accession" />
          </SettingRow>
          <SettingRow title="Block Code" description="รหัส Block — Row 2 (bold)">
            <FontInput name="sticker_font_block" />
          </SettingRow>
          <SettingRow title="Date" description="วันที่ — Row 2 ต่อท้าย Block code (same line)">
            <FontInput name="sticker_font_date" />
          </SettingRow>
          <SettingRow title="Stain Type" description="ประเภทการย้อม — Row 3">
            <FontInput name="sticker_font_stain" />
          </SettingRow>
          <SettingRow title="Hospital Code" description="รหัสโรงพยาบาล — Row 4">
            <FontInput name="sticker_font_hospital" />
          </SettingRow>
        </div>

        {/* Layout */}
        <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8, marginBottom: 16 }}>
          <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 13 }}>Layout</Title>
          <SettingRow title="Top Margin" description="ระยะห่างจากขอบบน — เพิ่มถ้าข้อความล้นขอบ">
            <Form.Item name="sticker_margin_top_cm" noStyle>
              <InputNumber min={0} max={1.0} step={0.05} precision={2} suffix="cm" style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
        </div>

        {/* QR Code */}
        <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8 }}>
          <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 13 }}>QR Code</Title>
          <SettingRow title="Scale" description="ขนาด QR code — 1.0 = ปกติ, <1 เล็กลง, >1 ใหญ่ขึ้น">
            <Form.Item name="sticker_qr_scale" noStyle>
              <InputNumber min={0.3} max={2.0} step={0.1} precision={1} style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
          <SettingRow title="X Offset" description="เลื่อนซ้าย/ขวา — ค่าลบ = ซ้าย, ค่าบวก = ขวา">
            <Form.Item name="sticker_qr_offset_x_cm" noStyle>
              <InputNumber min={-1.0} max={1.0} step={0.05} precision={2} suffix="cm" style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
          <SettingRow title="Y Offset" description="เลื่อนขึ้น/ลง — ค่าบวก = ขึ้น, ค่าลบ = ลง">
            <Form.Item name="sticker_qr_offset_y_cm" noStyle>
              <InputNumber min={-1.0} max={1.0} step={0.05} precision={2} suffix="cm" style={{ width: 120 }} />
            </Form.Item>
          </SettingRow>
        </div>

        <StickerPreview
          width={previewW} height={previewH}
          fAccession={fAccession} fBlock={fBlock}
          fStain={fStain} fHospital={fHospital} fDate={fDate}
        />
      </div>

      <div style={{
        position: "sticky", bottom: 0, marginTop: 32,
        marginLeft: -48, marginRight: -48, padding: "12px 48px",
        background: "rgba(255,255,255,0.95)", borderTop: "1px solid #f0f0f0",
        backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end",
      }}>
        <Button type="primary" icon={<SaveOutlined />} size="large" loading={loading} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </Form>
  );
};

export default StickerTab;
