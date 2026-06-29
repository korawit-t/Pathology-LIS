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
        เปิดใช้งาน module สำหรับบันทึกและรายงานข้อมูล tumor registry (ICD-O coding, staging)
      </Text>
      <Divider style={{ margin: "16px 0 0 0" }} />

      <SettingRow
        title="เปิดใช้งาน Tumor Registry"
        description="เมื่อปิด ระบบจะซ่อน module tumor registry ทั้งหมด รวมถึงปุ่มกรอก ICD-O ใน surgical case"
        icon={<ExperimentOutlined style={{ color: "#f5222d" }} />}
      >
        <Form.Item name="tumor_registry_enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="เปิด" unCheckedChildren="ปิด" />
        </Form.Item>
      </SettingRow>

      <SettingRow
        title="AI Profile สำหรับ ICD-O Coding"
        description="เลือก LLM profile ที่จะใช้ suggest topography/morphology code จาก diagnosis text — ตั้งค่า profiles ได้ที่ AI Configuration"
        icon={<RobotOutlined style={{ color: "#722ed1" }} />}
      >
        <Spin spinning={loadingProfiles}>
          <Form.Item name="tumor_registry_llm_profile_id" style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 300 }}
              allowClear
              placeholder={
                profiles.length === 0
                  ? "ยังไม่มี AI Profile — ตั้งค่าที่ AI Configuration"
                  : "เลือก AI Profile (optional)"
              }
              disabled={profiles.length === 0}
              options={profileOptions}
              optionLabelProp="label"
            />
          </Form.Item>
        </Spin>
      </SettingRow>

      <SettingRow
        title="แสดง ICD-O ใน Report"
        description="เพิ่ม section ICD-O Coding ท้าย Pathological Diagnosis ใน PDF report — default ปิด เพราะเป็น administrative data ไม่ใช่ clinical content"
        icon={<ExperimentOutlined style={{ color: "#1890ff" }} />}
      >
        <Form.Item name="show_icd_o_in_report" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="แสดง" unCheckedChildren="ซ่อน" />
        </Form.Item>
      </SettingRow>

      {/* System Prompt — full width */}
      <div style={{ padding: "20px 0" }}>
        <Space style={{ marginBottom: 8 }}>
          <RobotOutlined style={{ color: "#8c8c8c" }} />
          <Text strong style={{ fontSize: "15px" }}>System Prompt</Text>
          <Tooltip title="ถ้าว่างจะใช้ default prompt ที่ built-in ไว้ — กรอกเพื่อ override เช่น ปรับภาษา เพิ่มตัวอย่าง หรือระบุ convention เฉพาะของโรงพยาบาล">
            <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
          </Tooltip>
        </Space>
        <div>
          <Text type="secondary" style={{ fontSize: "13px" }}>
            เว้นว่างเพื่อใช้ default ICD-O coding prompt — กรอกเพื่อ override พฤติกรรม AI สำหรับ feature นี้โดยเฉพาะ
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
