import React, { useEffect, useState } from "react";
import {
  Form,
  Typography,
  InputNumber,
  Row,
  Col,
  Space,
  Button,
  message,
} from "antd";
import {
  ClockCircleOutlined,
  ControlOutlined,
  SaveOutlined,
} from "@ant-design/icons";
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
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {children}
    </Col>
  </Row>
);

const SecurityTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const warningMinutes = Form.useWatch("idle_warning_minutes", form) ?? 1;

  const load = async () => {
    try {
      const settings = await SystemSettingService.getSettings();
      form.setFieldsValue(settings);
    } catch {
      message.error("Failed to load security settings");
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Security settings saved");
      load();
    } catch {
      message.error("Failed to save security settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        {/* Section: Session Security */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ControlOutlined /> Session Security
          </Title>
          <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8 }}>
            <SettingRow
              title="Idle Timeout"
              description={`Automatically logs out when idle — a warning is shown ${warningMinutes} minutes before timeout`}
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Form.Item name="idle_timeout_minutes" noStyle>
                <InputNumber min={2} max={480} step={5} addonAfter="min" style={{ width: 160 }} />
              </Form.Item>
            </SettingRow>
            <SettingRow
              title="Warning Lead Time"
              description="Shows a warning before automatically logging out"
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Form.Item name="idle_warning_minutes" noStyle>
                <InputNumber min={1} max={10} step={1} addonAfter="min" style={{ width: 160 }} />
              </Form.Item>
            </SettingRow>
          </div>
        </div>

        {/* Password Policy */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ControlOutlined /> Password Policy
          </Title>
          <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8 }}>
            <SettingRow
              title="Minimum Password Length"
              description="Minimum number of characters required for all user passwords"
              icon={<ControlOutlined style={{ color: "#1890ff" }} />}
            >
              <Space>
                <Form.Item name="password_min_length" noStyle>
                  <InputNumber min={6} max={32} style={{ width: 100 }} />
                </Form.Item>
                <Text type="secondary">chars</Text>
              </Space>
            </SettingRow>
            <SettingRow
              title="Password Expiry"
              description="Users must change their password after this many days. Set to 0 to disable."
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Space>
                <Form.Item name="password_expiry_days" noStyle>
                  <InputNumber min={0} max={365} style={{ width: 100 }} />
                </Form.Item>
                <Text type="secondary">days</Text>
              </Space>
            </SettingRow>
          </div>
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

export default SecurityTab;
