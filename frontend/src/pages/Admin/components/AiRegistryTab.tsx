import React, { useEffect, useState } from "react";
import { Form, Switch, Select, Input, Typography, Divider, Row, Col, Space, Spin, Tag, Tooltip } from "antd";
import { ExperimentOutlined, RobotOutlined, InfoCircleOutlined } from "@ant-design/icons";
import LlmProfileService, { LlmProfile } from "../../../services/llmProfileService";

const { Text, Title } = Typography;

const DEFAULT_SYSTEM_PROMPT = `You are an expert pathologist assistant specializing in ICD-O-3 coding.

Given a surgical pathology diagnosis text, return a JSON object with:
- topography_code: ICD-O-3 C-code (e.g. "C50.1")
- topography_desc: anatomical site description
- morphology_code: M-code with behavior digit (e.g. "8500/3")
  /0 benign  /1 borderline  /2 in situ  /3 malignant primary
- morphology_desc: histologic type description

Return only valid JSON. No explanation or markdown.`;

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

const AiRegistryTab: React.FC = () => {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    setLoadingProfiles(true);
    LlmProfileService.list()
      .then(setProfiles)
      .finally(() => setLoadingProfiles(false));
  }, []);

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
    <div>
      <Title level={5} style={{ marginBottom: 4 }}>Tumor Registry</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        Enables the module for recording and reporting tumor registry data (ICD-O coding, staging)
      </Text>
      <Divider style={{ margin: "16px 0 0 0" }} />

      <SettingRow
        title="Enable Tumor Registry"
        description="When off, the system hides the entire tumor registry module, including the ICD-O entry button in surgical cases"
        icon={<ExperimentOutlined style={{ color: "#f5222d" }} />}
      >
        <Form.Item name="tumor_registry_enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="On" unCheckedChildren="Off" />
        </Form.Item>
      </SettingRow>

      <SettingRow
        title="AI Profile for ICD-O Coding"
        description="Select the LLM profile used to suggest topography/morphology codes from diagnosis text — configure profiles under AI Configuration"
        icon={<RobotOutlined style={{ color: "#722ed1" }} />}
      >
        <Spin spinning={loadingProfiles}>
          <Form.Item name="tumor_registry_llm_profile_id" style={{ marginBottom: 0 }}>
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

      <SettingRow
        title="Show ICD-O in Report"
        description="Adds an ICD-O Coding section after the Pathological Diagnosis in the PDF report — default off since it's administrative data, not clinical content"
        icon={<ExperimentOutlined style={{ color: "#1890ff" }} />}
      >
        <Form.Item name="show_icd_o_in_report" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="Show" unCheckedChildren="Hide" />
        </Form.Item>
      </SettingRow>

      {/* System Prompt — full width */}
      <div style={{ padding: "20px 0" }}>
        <Space style={{ marginBottom: 8 }}>
          <RobotOutlined style={{ color: "#8c8c8c" }} />
          <Text strong style={{ fontSize: "15px" }}>System Prompt</Text>
          <Tooltip title="If left blank, the built-in default prompt is used — fill in to override, e.g. to adjust language, add examples, or specify a hospital-specific convention">
            <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
          </Tooltip>
        </Space>
        <div>
          <Text type="secondary" style={{ fontSize: "13px" }}>
            Leave blank to use the default ICD-O coding prompt — fill in to override the AI's behavior specifically for this feature
          </Text>
        </div>
        <Form.Item name="tumor_registry_system_prompt" style={{ marginTop: 12, marginBottom: 0 }}>
          <Input.TextArea
            rows={8}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </Form.Item>
      </div>

    </div>
  );
};

export default AiRegistryTab;
