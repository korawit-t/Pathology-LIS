import React, { useMemo, useEffect } from "react";
import {
  Card,
  Space,
  Typography,
  Tag,
  Form,
  message,
  Modal,
  Button,
} from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import SimpleTiptapEditor from "../../../../components/Editors/SimpleTiptapEditor";
import DiagnosticTemplateSystem from "../../SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import type { FormInstance } from "antd";
import type { SurgicalCase } from "../../../../types/surgical";

const { Text } = Typography;

interface IntegratedCaseDiagnosisEditorProps {
  surgicalCase: SurgicalCase;
  isLocked: boolean;
  form: FormInstance;
  diagnosisMode: "integrated" | "clean";
  onAIGenerate?: () => void;
  isAIGenerating?: boolean;
}

const IntegratedCaseDiagnosisEditor: React.FC<
  IntegratedCaseDiagnosisEditorProps
> = ({ surgicalCase, isLocked, form, diagnosisMode, onAIGenerate, isAIGenerating = false }) => {
  const isCleanMode = diagnosisMode === "clean";
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);

  // บังคับเลือกชิ้นเนื้อทั้งหมด (เหมือนเดิม)
  useEffect(() => {
    if (surgicalCase?.specimens) {
      const allIds = surgicalCase.specimens.map((s) => s.id);
      form.setFieldValue("case_linked_specimens", allIds);
    }
  }, [surgicalCase, form]);

  const dynamicLabel = useMemo(() => {
    // 🚩 ถ้าเป็น Clean Mode ไม่ต้องคำนวณ Label ให้รกหน้าจอ
    if (isCleanMode) return "";

    const specs = surgicalCase?.specimens || [];
    if (specs.length === 0) return "";

    const labels = specs
      .map((s) => s.specimen_label)
      .sort((a, b) => a.localeCompare(b));

    if (labels.length === 1) return labels[0];

    const firstCode = labels[0].charCodeAt(0);
    const lastCode = labels[labels.length - 1].charCodeAt(0);
    const isSequential = lastCode - firstCode === labels.length - 1;

    return isSequential
      ? `${labels[0]}-${labels[labels.length - 1]}`
      : labels.join(", ");
  }, [surgicalCase, isCleanMode]);

  // 🚩 Logic สำหรับการเลือก Template ในระดับ Case
  const handleApplyTemplate = (
    data: { diagnosis: string; microscopic: string },
    mode: "append" | "replace",
  ) => {
    const fieldName = "case_diagnosis_text";
    const currentDiag = form.getFieldValue(fieldName) || "";

    if (mode === "replace") {
      form.setFieldValue(fieldName, data.diagnosis);
    } else {
      // Append: ต่อท้ายเนื้อหาเดิม
      const combined = currentDiag
        ? `${currentDiag}<p>${data.diagnosis}</p>`
        : data.diagnosis;
      form.setFieldValue(fieldName, combined);
    }

    // แจ้งเตือนและปิด Modal
    message.success("Template applied to case diagnosis");
    setIsTemplateModalOpen(false);
  };

  return (
    <section
      id="case-diagnosis-section"
      style={{ width: "100%", marginBottom: 24 }}
    >
      <Card
        title={
          <Space>
            {isCleanMode ? (
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
            ) : (
              <FileTextOutlined style={{ color: "#1890ff" }} />
            )}
            <Text strong>
              {isCleanMode
                ? "Clean Case Diagnosis"
                : "Integrated Case Diagnosis"}
            </Text>
          </Space>
        }
        extra={
          <Space>
            {!isLocked && onAIGenerate && (
              <Button
                size="small"
                icon={<RobotOutlined />}
                loading={isAIGenerating}
                onClick={onAIGenerate}
              >
                AI Generate
              </Button>
            )}
            {!isLocked && (
              <Button
                size="small"
                type="link"
                icon={<ThunderboltOutlined />}
                onClick={() => setIsTemplateModalOpen(true)}
              >
                Templates
              </Button>
            )}
            <Tag color={isCleanMode ? "green" : "blue"}>
              {surgicalCase?.specimens?.length} Specimens
            </Tag>
            <Tag color="gold">CASE LEVEL</Tag>
          </Space>
        }
        style={{
          borderRadius: "12px",
          // 🚩 ปรับสีขอบและพื้นหลังตามโหมด
          border: isCleanMode ? "2px solid #52c41a" : "2px solid #1890ff",
          background: isCleanMode ? "#f6ffed" : "#f0f7ff",
          boxShadow: isCleanMode
            ? "0 4px 12px rgba(82, 196, 26, 0.1)"
            : "0 4px 12px rgba(24, 144, 255, 0.1)",
        }}
      >
        {/* 🚩 ซ่อนส่วน Label ถ้าเป็นโหมด Clean */}
        {!isCleanMode && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Diagnosis for Specimens: </Text>
            <Text
              strong
              style={{ fontSize: "20px", color: "#1890ff", marginLeft: 8 }}
            >
              {dynamicLabel}
            </Text>
          </div>
        )}

        <Form.Item
          name="case_diagnosis_text"
          label={
            <Text strong style={{ textTransform: "uppercase" }}>
              DIAGNOSIS
            </Text>
          }
          style={{ marginBottom: 0 }}
        >
          <SimpleTiptapEditor
            disabled={isLocked}
            placeholder={
              isCleanMode
                ? "ระบุคำวินิจฉัยอิสระที่นี่..."
                : `ระบุคำวินิจฉัยสรุปรวมสำหรับชิ้นเนื้อ ${dynamicLabel}...`
            }
            style={{ minHeight: "300px" }}
          />
        </Form.Item>

        <Form.Item name="case_linked_specimens" hidden>
          <input />
        </Form.Item>
      </Card>
      {/* 🚩 Modal Template System สำหรับ Case Level */}
      <Modal
        title="Diagnostic Templates (Case Level)"
        open={isTemplateModalOpen}
        onCancel={() => setIsTemplateModalOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
        zIndex={2000}
      >
        {/* ส่ง onApply โดยไม่ต้องสนเรื่อง "target all" เพราะโหมดนี้มีเป้าหมายเดียวคือ Case */}
        <DiagnosticTemplateSystem
          onApply={(data, mode) => handleApplyTemplate(data, mode)}
        />
      </Modal>
    </section>
  );
};

export default IntegratedCaseDiagnosisEditor;
