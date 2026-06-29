import React, { useEffect, useState } from "react";
import {
  Form,
  Input,
  Typography,
  Row,
  Col,
  Space,
  Alert,
  Card,
  Tag,
  Divider,
  Button,
  message,
} from "antd";
import { BarcodeOutlined, InfoCircleOutlined, SaveOutlined } from "@ant-design/icons";
import SystemSettingService from "../../../services/systemSettingService";

const { Text, Title } = Typography;

const SettingRow = ({ title, description, children, icon }: { title: string; description?: string; children: React.ReactNode; icon?: React.ReactNode }) => (
  <Row
    gutter={[16, 16]}
    style={{ padding: "20px 0", borderBottom: "1px solid #f0f0f0" }}
  >
    <Col xs={24} md={14}>
      <Space direction="vertical" size={0}>
        <Space>
          {icon}
          <Text strong style={{ fontSize: "15px" }}>
            {title}
          </Text>
        </Space>
        <Text type="secondary" style={{ fontSize: "13px" }}>
          {description}
        </Text>
      </Space>
    </Col>
    <Col
      xs={24}
      md={10}
      style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}
    >
      {children}
    </Col>
  </Row>
);

const BarcodePreview: React.FC<{
  opdPrefix: string;
  ipdPrefix: string;
  surgicalCode: string;
  gyneCode: string;
  nongyneCode: string;
}> = ({ opdPrefix, ipdPrefix, surgicalCode, gyneCode, nongyneCode }) => {
  const op = opdPrefix || "2";
  const ip = ipdPrefix || "3";
  const sc = surgicalCode || "08";
  const gc = gyneCode || "09";
  const nc = nongyneCode || "10";

  const examples = [
    { label: "Surgical OPD (VN)", value: `${op}${sc}VN001234`, color: "blue" },
    { label: "Surgical IPD (AN)", value: `${ip}${sc}AN001234`, color: "geekblue" },
    { label: "Gyne OPD (VN)", value: `${op}${gc}VN001234`, color: "pink" },
    { label: "Non-Gyne OPD (VN)", value: `${op}${nc}VN001234`, color: "purple" },
  ];

  return (
    <Card
      size="small"
      title={
        <Space>
          <BarcodeOutlined />
          <Text strong>Barcode Preview (Example)</Text>
        </Space>
      }
      style={{ background: "#fafafa", marginTop: 24 }}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Pattern: <Text code>{"{aa}{bb}{VN or AN}"}</Text>
        </Text>
        <Row gutter={[12, 12]}>
          {examples.map((ex) => (
            <Col key={ex.label} xs={24} sm={12}>
              <Space direction="vertical" size={2}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {ex.label}
                </Text>
                <Tag
                  color={ex.color}
                  style={{ fontFamily: "monospace", fontSize: 14, padding: "4px 10px" }}
                >
                  {ex.value}
                </Tag>
              </Space>
            </Col>
          ))}
        </Row>
      </Space>
    </Card>
  );
};

const BarcodeTabInner: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const opdPrefix = Form.useWatch("barcode_opd_prefix", form);
  const ipdPrefix = Form.useWatch("barcode_ipd_prefix", form);
  const surgicalCode = Form.useWatch("barcode_surgical_type_code", form);
  const gyneCode = Form.useWatch("barcode_gyne_type_code", form);
  const nongyneCode = Form.useWatch("barcode_nongyne_type_code", form);

  const load = async () => {
    try {
      const data = await SystemSettingService.getSettings();
      form.setFieldsValue(data);
    } catch {
      message.error("Failed to load barcode settings");
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Barcode settings saved");
      load();
    } catch {
      message.error("Failed to save barcode settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ marginBottom: 32 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <BarcodeOutlined /> Barcode Label Format
          </Title>
          <Alert
            icon={<InfoCircleOutlined />}
            showIcon
            type="info"
            message="วัตถุประสงค์และรูปแบบ Barcode"
            description={
              <Space direction="vertical" size={6} style={{ marginTop: 4 }}>
                <Text>
                  Barcode ที่พิมพ์บนรายงานผลใช้สำหรับให้{" "}
                  <Text strong>HOSxP อ่านอัตโนมัติ</Text>{" "}
                  เมื่อ Upload ไฟล์ PDF เข้าระบบ{" "}
                  <Text strong>"เอกสาร Scan"</Text> ของ HOSxP
                  โดยระบบจะจับคู่ผลตรวจกับ Visit (VN) หรือ Admission (AN) ของผู้ป่วยได้ทันที
                </Text>
                <Text type="secondary">
                  รูปแบบ Code 39:{" "}
                  <Text code>aa</Text> รหัสประเภทการเข้ารับบริการ (OPD / IPD){" "}
                  + <Text code>bb</Text> รหัสประเภทเคส{" "}
                  + <Text code>xxx</Text> เลข VN (ผู้ป่วยนอก) หรือ AN (ผู้ป่วยใน)
                </Text>
              </Space>
            }
            style={{ marginBottom: 24 }}
          />

          {/* Visit Type Prefixes */}
          <div
            style={{
              background: "#fafafa",
              padding: "0 20px",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 14 }}>
              Visit Type Prefix (aa)
            </Title>

            <SettingRow
              title="OPD Prefix"
              description="รหัสนำหน้าสำหรับผู้ป่วยนอก (Outpatient) — ค่าเริ่มต้น: 2"
            >
              <Form.Item name="barcode_opd_prefix" noStyle>
                <Input
                  style={{ width: 120, fontFamily: "monospace", fontSize: 16 }}
                  maxLength={4}
                  placeholder="2"
                />
              </Form.Item>
            </SettingRow>

            <SettingRow
              title="IPD Prefix"
              description="รหัสนำหน้าสำหรับผู้ป่วยใน (Inpatient) — ค่าเริ่มต้น: 3"
            >
              <Form.Item name="barcode_ipd_prefix" noStyle>
                <Input
                  style={{ width: 120, fontFamily: "monospace", fontSize: 16 }}
                  maxLength={4}
                  placeholder="3"
                />
              </Form.Item>
            </SettingRow>
          </div>

          {/* Case Type Codes */}
          <div
            style={{
              background: "#fafafa",
              padding: "0 20px",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Title level={5} style={{ padding: "16px 0 0", marginBottom: 0, fontSize: 14 }}>
              Case Type Code (bb)
            </Title>

            <SettingRow
              title="Surgical Pathology Code"
              description="รหัสสำหรับเคส Surgical Pathology — ค่าเริ่มต้น: 08"
            >
              <Form.Item name="barcode_surgical_type_code" noStyle>
                <Input
                  style={{ width: 120, fontFamily: "monospace", fontSize: 16 }}
                  maxLength={4}
                  placeholder="08"
                />
              </Form.Item>
            </SettingRow>

            <SettingRow
              title="Gyne Cytology Code"
              description="รหัสสำหรับเคส Gyne Cytology (Pap Smear) — ค่าเริ่มต้น: 09"
            >
              <Form.Item name="barcode_gyne_type_code" noStyle>
                <Input
                  style={{ width: 120, fontFamily: "monospace", fontSize: 16 }}
                  maxLength={4}
                  placeholder="09"
                />
              </Form.Item>
            </SettingRow>

            <SettingRow
              title="Non-Gyne Cytology Code"
              description="รหัสสำหรับเคส Non-Gyne Cytology — ค่าเริ่มต้น: 10"
            >
              <Form.Item name="barcode_nongyne_type_code" noStyle>
                <Input
                  style={{ width: 120, fontFamily: "monospace", fontSize: 16 }}
                  maxLength={4}
                  placeholder="10"
                />
              </Form.Item>
            </SettingRow>
          </div>

          <Divider />

          <BarcodePreview
            opdPrefix={opdPrefix}
            ipdPrefix={ipdPrefix}
            surgicalCode={surgicalCode}
            gyneCode={gyneCode}
            nongyneCode={nongyneCode}
          />
        </div>
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

export default BarcodeTabInner;
