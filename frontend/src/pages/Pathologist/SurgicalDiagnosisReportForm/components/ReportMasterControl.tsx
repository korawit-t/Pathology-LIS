import React, { useState } from "react";
import {
  Popover,
  Form,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Input,
  Divider,
  Select,
} from "antd";
import {
  InfoCircleOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  PlusCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import Title from "antd/es/typography/Title";
import { SurgicalDiagnosis } from "../../../../types/surgicalDiagnosis";
import type { FormInstance } from "antd";
import type { SurgicalSpecimen } from "../../../../types/surgical";

const { Text } = Typography;

type DiagnosisMode = "individual" | "integrated" | "clean";

const MODE_CONFIG: Record<DiagnosisMode, {
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}> = {
  individual: {
    label: "Per Specimen",
    description: "Diagnose each specimen separately",
    icon: DatabaseOutlined,
    color: "#1890ff",
  },
  integrated: {
    label: "Combined Case",
    description: "One diagnosis for all specimens",
    icon: FileTextOutlined,
    color: "#722ed1",
  },
  clean: {
    label: "Free Text",
    description: "Open format, no specimen labels",
    icon: CheckCircleOutlined,
    color: "#52c41a",
  },
};

// 1. ปรับการสร้าง Content สำหรับ Mode Selection
const getFormatHintContent = (specimens: SurgicalSpecimen[], showSpecimenName: boolean) => (
  <div style={{ padding: "4px", maxWidth: "300px" }}>
    <div style={{ marginBottom: 0 }}>
      <Text strong type="secondary" style={{ fontSize: "10px" }}>
        INDIVIDUAL MODE
      </Text>
      <div
        style={{
          background: "#f5f5f5",
          padding: "8px",
          borderRadius: "4px",
          marginTop: 4,
          fontSize: "11px",
          borderLeft: "3px solid #d9d9d9",
        }}
      >
        {specimens.length > 0 ? (
          specimens.slice(0, 3).map((s, idx) => (
            <div key={s.id} style={{ marginBottom: 6 }}>
              <Text strong>
                {s.specimen_label}
                {showSpecimenName ? `: ${s.specimen_name}` : ":"}
              </Text>
              {/* Skeleton Line แทนคำวินิจฉัย */}
              <div
                style={{
                  height: "4px",
                  width: "80%",
                  background: "#e0e0e0",
                  borderRadius: "2px",
                  marginTop: "3px",
                  marginLeft: "8px",
                }}
              />
            </div>
          ))
        ) : (
          <Text type="secondary">No specimens</Text>
        )}
      </div>
    </div>

    <div>
      <Text strong type="secondary" style={{ fontSize: "10px" }}>
        INTEGRATED MODE
      </Text>
      <div
        style={{
          background: "#e6f7ff",
          padding: "8px",
          borderRadius: "4px",
          marginTop: 4,
          fontSize: "11px",
          borderLeft: "3px solid #1890ff",
        }}
      >
        <Text strong style={{ fontSize: "13px" }}>
          {specimens.length > 0
            ? specimens.length > 1
              ? `${specimens[0].specimen_label}-${specimens[specimens.length - 1].specimen_label}:`
              : `${specimens[0].specimen_label}:`
            : "A-B:"}
        </Text>
        <div
          style={{
            height: "4px",
            width: "80%",
            background: "#d0e9ff",
            borderRadius: "2px",
            marginTop: "4px",
            marginLeft: "4px",
          }}
        />
        <div
          style={{
            height: "4px",
            width: "60%",
            background: "#d0e9ff",
            borderRadius: "2px",
            marginTop: "3px",
            marginLeft: "4px",
          }}
        />
      </div>
    </div>

    <div>
      <Text strong type="secondary" style={{ fontSize: "10px" }}>
        CLEAN MODE
      </Text>
      <div
        style={{
          background: "#f6ffed",
          padding: "8px",
          borderRadius: "4px",
          marginTop: 4,
          fontSize: "11px",
          borderLeft: "3px solid #52c41a",
        }}
      >
        {/* บรรทัดที่ 1 (ยาว 85%) */}
        <div
          style={{
            height: "4px",
            width: "85%",
            background: "#d9f7be", // สีเขียวจางให้เข้ากับ Clean Mode
            borderRadius: "2px",
            marginTop: "4px",
          }}
        />
        {/* 🚩 บรรทัดที่ 2 (สั้นลงหน่อย 60% ให้ดูเป็นธรรมชาติ) */}
        <div
          style={{
            height: "4px",
            width: "60%",
            background: "#d9f7be",
            borderRadius: "2px",
            marginTop: "6px", // เว้นระยะห่างระหว่างบรรทัด
          }}
        />
      </div>
    </div>
  </div>
);

interface ReportMasterControlProps {
  reports: SurgicalDiagnosis[];
  diagnosisMode: "individual" | "integrated" | "clean";
  setDiagnosisMode: (mode: "individual" | "integrated" | "clean") => void;
  isLocked: boolean;
  hasOriginalSigned: boolean;
  compact?: boolean;
  specimens: SurgicalSpecimen[];
  showSpecimenName: boolean;
  form: FormInstance;
}

const ReportMasterControl: React.FC<ReportMasterControlProps> = ({
  reports = [],
  diagnosisMode,
  setDiagnosisMode,
  isLocked,
  hasOriginalSigned,
  specimens = [],
  showSpecimenName,
  form,
}) => {
  // --- Logic การหา Order ล่าสุด ---
  // ถ้าไม่มี reports เลยให้เริ่มที่ 1
  // ถ้ามีแล้ว ให้หาเลข diagnosis_order ที่สูงที่สุดแล้วบวก 1
  const nextOrder =
    reports.length > 0
      ? Math.max(...reports.map((r) => r.diagnosis_order ?? 0)) + 1
      : 1;

  const [controlOpen, setControlOpen] = useState(false);

  const currentEntryType =
    Form.useWatch<string>("global_entry_type", form) || "Addendum";

  const getUpdateTypeHintContent = (
    specimens: SurgicalSpecimen[],
    diagnosisMode: string,
    showSpecimenName: boolean,
  ) => {
    const SkeletonText = () => (
      <div style={{ marginTop: 4, marginBottom: 8, marginLeft: "8px" }}>
        <div
          style={{
            height: "5px",
            width: "90%",
            background: "#f0f0f0",
            borderRadius: "2px",
            marginBottom: "3px",
          }}
        />
        <div
          style={{
            height: "5px",
            width: "70%",
            background: "#f0f0f0",
            borderRadius: "2px",
          }}
        />
      </div>
    );

    const renderExample = (type: string, color: string) => (
      <div
        style={{
          marginTop: 8,
          padding: "10px",
          background: "#ffffff",
          borderRadius: "6px",
          border: "1px solid #f0f0f0",
          borderLeft: `4px solid ${color}`,
          fontSize: "11px",
          fontFamily: "monospace",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{
            color: color,
            fontWeight: "bold",
            marginBottom: 6,
            fontSize: "10px",
            letterSpacing: "0.5px",
          }}
        >
          {type.toUpperCase()} Report
        </div>

        {diagnosisMode === "integrated" ? (
          <div>
            <Text strong style={{ fontSize: "12px" }}>
              {specimens.length > 1
                ? `${specimens[0].specimen_label}-${specimens[specimens.length - 1].specimen_label}:`
                : specimens.length === 1
                  ? `${specimens[0].specimen_label}:`
                  : "A-B:"}
            </Text>
            <SkeletonText />
          </div>
        ) : (
          specimens.slice(0, 2).map((s, idx) => (
            <div key={s.id} style={{ marginBottom: idx === 0 ? 4 : 0 }}>
              <Text strong style={{ fontSize: "12px" }}>
                {s.specimen_label}
                {showSpecimenName ? `: ${s.specimen_name}` : ":"}
              </Text>
              <SkeletonText />
              {idx === 0 && (
                <div
                  style={{
                    borderBottom: "1px dashed #f5f5f5",
                    margin: "4px 0 8px 0",
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    );

    return (
      <div style={{ padding: "8px", maxWidth: "850px" }}>
        {" "}
        {/* ขยายความกว้างเพื่อรับ 3 col */}
        <Row gutter={16}>
          {/* ADDENDUM */}
          <Col span={8}>
            <div style={{ height: "100%" }}>
              <Space
                direction="vertical"
                size={0}
                style={{ minHeight: "60px" }}
              >
                <Tag color="blue" bordered={false}>
                  ADDENDUM
                </Tag>
                <Text
                  type="secondary"
                  style={{ fontSize: "11px", paddingLeft: 4 }}
                >
                  Additional info without changing original results.
                </Text>
              </Space>
              {renderExample("Addendum", "#1890ff")}
            </div>
          </Col>

          {/* CORRECTED */}
          <Col span={8}>
            <div style={{ height: "100%" }}>
              <Space
                direction="vertical"
                size={0}
                style={{ minHeight: "60px" }}
              >
                <Tag color="cyan" bordered={false}>
                  CORRECTED
                </Tag>
                <Text
                  type="secondary"
                  style={{ fontSize: "11px", paddingLeft: 4 }}
                >
                  Minor error correction (Typos, Administrative).
                </Text>
              </Space>
              {renderExample("Corrected", "#13c2c2")}
            </div>
          </Col>

          {/* REVISED */}
          <Col span={8}>
            <div style={{ height: "100%" }}>
              <Space
                direction="vertical"
                size={0}
                style={{ minHeight: "60px" }}
              >
                <Tag color="red" bordered={false}>
                  REVISED
                </Tag>
                <Text
                  type="secondary"
                  style={{ fontSize: "11px", paddingLeft: 4 }}
                >
                  Major change impacting patient management.
                </Text>
              </Space>
              {renderExample("Revised", "#ff4d4f")}
            </div>
          </Col>
        </Row>
      </div>
    );
  };

  const controlBarContent = (
    <div
      style={{
        padding: "16px",
        background: hasOriginalSigned ? "#fffbe633" : "transparent",
        display: "flex",
        alignItems: "flex-start",
        gap: "32px",
        minWidth: 680,
      }}
    >
      {/* 1. Diagnosis Format Cards */}
      <div>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <Text strong style={{ fontSize: "11px", color: "#8c8c8c" }}>
            DIAGNOSIS FORMAT
          </Text>
          <Popover content={getFormatHintContent(specimens, showSpecimenName)} placement="bottomLeft">
            <InfoCircleOutlined style={{ fontSize: 11, color: "#bfbfbf", cursor: "help" }} />
          </Popover>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(Object.entries(MODE_CONFIG) as [DiagnosisMode, typeof MODE_CONFIG[DiagnosisMode]][]).map(([key, cfg]) => {
            const isActive = diagnosisMode === key;
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                disabled={isLocked}
                onClick={() => { if (!isLocked) { setDiagnosisMode(key); setControlOpen(false); } }}
                style={{
                  border: `2px solid ${isActive ? cfg.color : "#e8e8e8"}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  background: isActive ? `${cfg.color}12` : "#fafafa",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  textAlign: "left",
                  minWidth: 130,
                  transition: "all 0.2s",
                  opacity: isLocked ? 0.5 : 1,
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: isActive ? cfg.color : "#434343", fontWeight: 600, fontSize: 13 }}>
                  <Icon style={{ color: isActive ? cfg.color : "#8c8c8c", fontSize: 13 }} />
                  {cfg.label}
                </div>
                <div style={{ color: "#8c8c8c", fontSize: 11, marginTop: 3, lineHeight: 1.3 }}>
                  {cfg.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Dynamic Configuration Area */}
      {hasOriginalSigned && (
        <div style={{ flex: 1, display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ width: "200px" }}>
            <div style={{ marginBottom: "6px" }}>
              <Text strong style={{ fontSize: "11px", color: "#8c8c8c" }}>UPDATE TYPE</Text>
              <Popover
                content={getUpdateTypeHintContent(specimens, diagnosisMode, showSpecimenName)}
                title="Update Guidelines"
                placement="bottomLeft"
                styles={{ root: { width: "800px" } }}
              >
                <InfoCircleOutlined style={{ fontSize: "12px", marginLeft: 6, color: "#1890ff", cursor: "help", opacity: 0.8 }} />
              </Popover>
            </div>
            <Select
              value={currentEntryType}
              onChange={(val) => form.setFieldsValue({ global_entry_type: val })}
              style={{ width: 160 }}
              disabled={isLocked}
              options={[
                { value: "Addendum", label: (<Space><PlusCircleOutlined style={{ fontSize: "12px", color: "#1890ff" }} /><Text style={{ fontSize: "13px", color: "#1890ff" }}>Addendum</Text></Space>) },
                { value: "Corrected", label: (<Space><CheckCircleOutlined style={{ fontSize: "12px", color: "#13c2c2" }} /><Text style={{ fontSize: "13px", color: "#13c2c2" }}>Corrected</Text></Space>) },
                { value: "Revised", label: (<Space><WarningOutlined style={{ fontSize: "12px", color: "#ff4d4f" }} /><Text style={{ fontSize: "13px", color: "#ff4d4f" }}>Revised</Text></Space>) },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ marginBottom: "6px" }}>
              <Text strong style={{ fontSize: "11px", color: "#8c8c8c" }}>REASON FOR UPDATE</Text>
            </div>
            <Form.Item name="global_revision_reason" style={{ marginBottom: 0 }}>
              <Input
                variant="outlined"
                placeholder={currentEntryType !== "Addendum" ? "Required reason for update..." : "Optional notes..."}
                style={{ borderRadius: "6px", background: "#ffffff", height: "32px" }}
                disabled={isLocked}
              />
            </Form.Item>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ width: "100%", background: "#fff" }}>
      {/* --- Header --- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Title
          level={5}
          style={{ margin: 0, fontWeight: 700, letterSpacing: "0.5px", color: "#434343", flex: 1 }}
        >
          DIAGNOSIS & REPORTING
        </Title>

        {hasOriginalSigned && (
          <div
            style={{
              marginRight: 12,
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid #91d5ff",
              borderRadius: "4px",
              overflow: "hidden",
              height: "28px",
            }}
          >
            <div style={{ background: "#e6f7ff", color: "#1890ff", padding: "0 8px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", display: "flex", alignItems: "center", height: "100%", borderRight: "1px solid #91d5ff" }}>
              REPORT
            </div>
            <div style={{ background: "#1890ff", color: "#fff", padding: "0 10px", fontSize: "15px", fontWeight: 800, display: "flex", alignItems: "center", height: "100%", textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
              #{nextOrder}
            </div>
          </div>
        )}

        <Popover
          content={controlBarContent}
          trigger="click"
          open={controlOpen}
          onOpenChange={setControlOpen}
          placement="bottomRight"
        >
          <button
            style={{
              border: "1px solid #d9d9d9",
              borderRadius: 6,
              padding: "4px 8px",
              background: controlOpen ? "#f0f0f0" : "#fafafa",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#595959",
              fontSize: 13,
              outline: "none",
            }}
          >
            <SettingOutlined style={{ fontSize: 14 }} />
            <Text style={{ fontSize: 12, color: "#595959" }}>
              {MODE_CONFIG[diagnosisMode].label}
            </Text>
          </button>
        </Popover>
      </div>

      {/* Hidden Fields */}
      <Form.Item name="global_entry_type" noStyle initialValue="Addendum">
        <input type="hidden" />
      </Form.Item>
      <Form.Item name="global_entry_active" initialValue={true} hidden />
      <Divider style={{ margin: 0, opacity: 0.6 }} />
    </div>
  );
};

export default ReportMasterControl;
