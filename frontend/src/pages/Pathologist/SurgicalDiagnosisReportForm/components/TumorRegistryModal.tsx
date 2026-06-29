import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  Row,
  Col,
  Space,
  Typography,
  Spin,
  message,
  Button,
  Tooltip,
  Tag,
  Alert,
} from "antd";
import { ExperimentOutlined, RobotOutlined, InfoCircleOutlined, SendOutlined } from "@ant-design/icons";
import TumorRegistryService, { TumorRegistryUpsert, SuggestPreview } from "../../../../services/tumorRegistryService";

const { Text } = Typography;

interface TumorRegistryModalProps {
  open: boolean;
  onClose: () => void;
  caseId: number;
  isLocked?: boolean;
  aiEnabled?: boolean;
}

const GRADE_OPTIONS = [
  { value: "G1", label: "G1 — Well differentiated" },
  { value: "G2", label: "G2 — Moderately differentiated" },
  { value: "G3", label: "G3 — Poorly differentiated" },
  { value: "GX", label: "GX — Grade cannot be assessed" },
];

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "green" },
  anthropic: { label: "Anthropic", color: "purple" },
  openai_compatible: { label: "OpenAI-Compatible", color: "blue" },
};

const TumorRegistryModal: React.FC<TumorRegistryModalProps> = ({
  open,
  onClose,
  caseId,
  isLocked,
  aiEnabled,
}) => {
  const [form] = Form.useForm<TumorRegistryUpsert>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<SuggestPreview | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    TumorRegistryService.getByCase(caseId)
      .then((data) => form.setFieldsValue(data))
      .catch(() => form.resetFields())
      .finally(() => setLoading(false));
  }, [open, caseId]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await TumorRegistryService.upsert(caseId, values);
      message.success("บันทึก Tumor Registry แล้ว");
      onClose();
    } catch {
      message.error("ไม่สามารถบันทึกได้");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await TumorRegistryService.getPreview(caseId);
      setPreview(data);
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? "โหลด preview ไม่สำเร็จ");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmSuggest = async () => {
    setConfirming(true);
    try {
      const suggested = await TumorRegistryService.suggest(caseId);
      form.setFieldsValue(suggested);
      setPreview(null);
      message.success("AI suggest ICD-O codes แล้ว — ตรวจสอบและแก้ไขก่อนบันทึก");
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? "AI suggest ไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  };

  const providerMeta = preview ? (PROVIDER_LABELS[preview.provider] ?? { label: preview.provider, color: "default" }) : null;

  return (
    <>
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 32 }}>
            <Space>
              <ExperimentOutlined style={{ color: "#f5222d" }} />
              <span>Tumor Registry</span>
            </Space>
            {aiEnabled && !isLocked && (
              <Tooltip title="ดู prompt และ diagnosis text ก่อนส่ง AI — ตรวจสอบก่อนบันทึกเสมอ">
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  loading={previewLoading}
                  onClick={handleOpenPreview}
                  style={{ background: "#722ed1", borderColor: "#722ed1", color: "#fff" }}
                >
                  AI Suggest ICD-O
                </Button>
              </Tooltip>
            )}
          </div>
        }
        open={open}
        onCancel={onClose}
        onOk={handleSave}
        okText="Save"
        cancelText="Cancel"
        okButtonProps={{ loading: saving, disabled: isLocked }}
        width={640}
        destroyOnClose
      >
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" disabled={isLocked}>
            <div style={{ margin: "12px 0 8px", paddingBottom: 6, borderBottom: "1px solid #f0f0f0" }}>
              <Space size={4}>
                <Text strong style={{ fontSize: 12, color: "#8c8c8c", textTransform: "uppercase", letterSpacing: "0.5px" }}>ICD-O-3</Text>
                {aiEnabled && (
                  <Tooltip title="AI suggest จะกรอก section นี้ให้อัตโนมัติ">
                    <InfoCircleOutlined style={{ fontSize: 11, color: "#722ed1" }} />
                  </Tooltip>
                )}
              </Space>
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="topography_code" label="Topography Code">
                  <Input placeholder="C50.1" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="topography_desc" label="Topography Description">
                  <Input placeholder="Breast, upper-outer quadrant" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="morphology_code" label="Morphology Code">
                  <Input placeholder="8500/3" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="morphology_desc" label="Morphology Description">
                  <Input placeholder="Infiltrating duct carcinoma, NOS" />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ margin: "4px 0 8px", paddingBottom: 6, borderBottom: "1px solid #f0f0f0" }}>
              <Text strong style={{ fontSize: 12, color: "#8c8c8c", textTransform: "uppercase", letterSpacing: "0.5px" }}>Grade & Staging</Text>
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="grade" label="Histologic Grade">
                  <Select placeholder="Select grade" options={GRADE_OPTIONS} allowClear />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="pt" label="pT"><Input placeholder="pT1c" /></Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="pn" label="pN"><Input placeholder="pN1" /></Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="pm" label="pM"><Input placeholder="pM0" /></Form.Item>
              </Col>
            </Row>
          </Form>
        </Spin>
      </Modal>

      {/* AI Preview Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined style={{ color: "#722ed1" }} />
            <span>AI Suggest Preview</span>
          </Space>
        }
        open={!!preview}
        onCancel={() => setPreview(null)}
        width={680}
        footer={[
          <Button key="cancel" onClick={() => setPreview(null)}>ยกเลิก</Button>,
          <Button
            key="confirm"
            type="primary"
            icon={<SendOutlined />}
            loading={confirming}
            onClick={handleConfirmSuggest}
            style={{ background: "#722ed1", borderColor: "#722ed1" }}
          >
            ส่งให้ AI →
          </Button>,
        ]}
        destroyOnClose
      >
        {preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Model info */}
            <div style={{ padding: "12px 16px", background: "#f9f0ff", borderRadius: 8, border: "1px solid #d3adf7" }}>
              <Space wrap>
                <Text strong>{preview.profile_name}</Text>
                <Tag color={providerMeta?.color}>{providerMeta?.label}</Tag>
                <Text code style={{ fontSize: 12 }}>{preview.model}</Text>
              </Space>
            </div>

            {/* System Prompt */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>System Prompt</Text>
              <div style={{
                background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6,
                padding: "10px 12px", fontFamily: "monospace", fontSize: 12,
                whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto", color: "#434343",
              }}>
                {preview.system_prompt}
              </div>
            </div>

            {/* Diagnosis text (user message) */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Diagnosis Text (จะส่งเป็น user message)</Text>
              {preview.diagnosis_text ? (
                <div style={{
                  background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 6,
                  padding: "10px 12px", fontSize: 13, whiteSpace: "pre-wrap",
                  maxHeight: 140, overflowY: "auto",
                }}>
                  {preview.diagnosis_text}
                </div>
              ) : (
                <Alert type="warning" message="ยังไม่มี diagnosis text ที่บันทึกไว้ — กรุณาบันทึก draft ก่อน" showIcon />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default TumorRegistryModal;
