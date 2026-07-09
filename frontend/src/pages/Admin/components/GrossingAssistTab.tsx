import React, { useEffect, useState } from "react";
import { Form, Switch, Select, Input, Typography, Divider, Row, Col, Space, Spin, Tag, Tooltip, Button, message } from "antd";
import { ExperimentOutlined, RobotOutlined, InfoCircleOutlined, SaveOutlined } from "@ant-design/icons";
import LlmProfileService, { LlmProfile } from "../../../services/llmProfileService";
import SystemSettingService from "../../../services/systemSettingService";

const { Text, Title } = Typography;

const DEFAULT_SYSTEM_PROMPT = `You are an expert pathology assistant performing a quality-control review of gross specimen descriptions before sign-out.

Given the gross description of each specimen in a surgical pathology case, check for completeness. For each specimen, flag missing or unclear standard elements where applicable, such as:
- Specimen size / dimensions
- Number of pieces / fragments
- Margins (inked, distance to margin)
- Orientation / marking sutures
- Fixation status (fresh vs. formalin-fixed)

Return only valid JSON, no markdown, in this shape:
{"feedback": "Specimen A: ...\\n\\nSpecimen B: ..."}`;

const PROVIDER_COLORS: Record<string, string> = {
  openai: "green",
  anthropic: "purple",
  openai_compatible: "blue",
};

const SettingRow = ({
  title,
  description,
  children,
  icon,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <Row gutter={[16, 16]} style={{ padding: "20px 0", borderBottom: "1px solid #f0f0f0" }}>
    <Col xs={24} md={14}>
      <Space direction="vertical" size={0}>
        <Space>
          {icon}
          <Text strong style={{ fontSize: "15px" }}>{title}</Text>
        </Space>
        <Text type="secondary" style={{ fontSize: "13px" }}>{description}</Text>
      </Space>
    </Col>
    <Col xs={24} md={10} style={{ display: "flex", alignItems: "center" }}>
      {children}
    </Col>
  </Row>
);

const GrossingAssistTab: React.FC = () => {
  const [form] = Form.useForm();
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoadingProfiles(true);
    LlmProfileService.list()
      .then(setProfiles)
      .finally(() => setLoadingProfiles(false));

    SystemSettingService.getSettings()
      .then((data) => form.setFieldsValue(data))
      .catch(() => message.error("Failed to load grossing assistant settings"));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Grossing assistant settings saved");
    } catch {
      message.error("Failed to save grossing assistant settings");
    } finally {
      setSaving(false);
    }
  };

  const profileOptions = profiles
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id,
      label: (
        <Space>
          <span>{p.display_name}</span>
          <Tag color={PROVIDER_COLORS[p.provider] ?? "default"} style={{ fontSize: 11 }}>
            {p.model}
          </Tag>
        </Space>
      ),
    }));

  return (
    <Form form={form} layout="vertical">
      <Title level={5} style={{ marginBottom: 4 }}>Grossing Assistant</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        AI-assisted completeness check for gross specimen descriptions during grossing
      </Text>
      <Divider style={{ margin: "16px 0 0 0" }} />

      <SettingRow
        title="Enable Grossing Assistant"
        description="When off, the AI Grossing Assistant button is hidden from the grossing page entirely"
        icon={<ExperimentOutlined style={{ color: "#f5222d" }} />}
      >
        <Form.Item name="grossing_assist_enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="On" unCheckedChildren="Off" />
        </Form.Item>
      </SettingRow>

      <SettingRow
        title="AI Profile for Grossing Assistant"
        description="Select the LLM profile used to check gross description completeness — configure profiles under AI Configuration"
        icon={<RobotOutlined style={{ color: "#722ed1" }} />}
      >
        <Spin spinning={loadingProfiles}>
          <Form.Item name="grossing_assist_llm_profile_id" style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 300 }}
              allowClear
              placeholder={
                profiles.length === 0
                  ? "No AI Profile yet — configure it under AI Configuration"
                  : "Select AI Profile (optional)"
              }
              disabled={profiles.length === 0}
              options={profileOptions}
              optionLabelProp="label"
            />
          </Form.Item>
        </Spin>
      </SettingRow>

      {/* System Prompt — full width */}
      <div style={{ padding: "20px 0" }}>
        <Space style={{ marginBottom: 8 }}>
          <RobotOutlined style={{ color: "#8c8c8c" }} />
          <Text strong style={{ fontSize: "15px" }}>System Prompt</Text>
          <Tooltip title="If left blank, the built-in default prompt is used — fill in to override, e.g. to adjust which elements are checked or add a hospital-specific convention">
            <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
          </Tooltip>
        </Space>
        <div>
          <Text type="secondary" style={{ fontSize: "13px" }}>
            Leave blank to use the default completeness-check prompt — fill in to override the AI's behavior specifically for this feature
          </Text>
        </div>
        <Form.Item name="grossing_assist_system_prompt" style={{ marginTop: 12, marginBottom: 0 }}>
          <Input.TextArea
            rows={8}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </Form.Item>
      </div>

      <div style={{
        position: "sticky", bottom: 0, marginTop: 32,
        marginLeft: -48, marginRight: -48, padding: "12px 48px",
        background: "rgba(255,255,255,0.95)", borderTop: "1px solid #f0f0f0",
        backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end",
      }}>
        <Button type="primary" icon={<SaveOutlined />} size="large" loading={saving} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </Form>
  );
};

export default GrossingAssistTab;
