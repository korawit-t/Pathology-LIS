import React, { useEffect, useState } from "react";
import { Modal, Space, Typography, message, Button, Tag, Alert, Spin } from "antd";
import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import GrossingAssistService, { GrossingAssistPreview } from "../../../services/grossingAssistService";

const { Text } = Typography;

interface GrossingAssistModalProps {
  open: boolean;
  onClose: () => void;
  caseId: number;
}

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "green" },
  anthropic: { label: "Anthropic", color: "purple" },
  openai_compatible: { label: "OpenAI-Compatible", color: "blue" },
};

const GrossingAssistModal: React.FC<GrossingAssistModalProps> = ({ open, onClose, caseId }) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<GrossingAssistPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setPreview(null);
    setLoading(true);
    GrossingAssistService.getPreview(caseId)
      .then(setPreview)
      .catch((err) => {
        message.error(err?.response?.data?.detail ?? "โหลด preview ไม่สำเร็จ");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, caseId]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const result = await GrossingAssistService.suggest(caseId);
      setFeedback(result.feedback);
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? "AI ตรวจสอบไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  };

  const providerMeta = preview ? (PROVIDER_LABELS[preview.provider] ?? { label: preview.provider, color: "default" }) : null;

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined style={{ color: "#722ed1" }} />
          <span>AI Grossing Assistant</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnHidden
      footer={
        feedback !== null
          ? [<Button key="close" onClick={onClose}>Close</Button>]
          : [
              <Button key="cancel" onClick={onClose}>Cancel</Button>,
              <Button
                key="confirm"
                type="primary"
                icon={<SendOutlined />}
                loading={confirming}
                disabled={!preview?.specimens_text}
                onClick={handleConfirm}
                style={{ background: "#722ed1", borderColor: "#722ed1" }}
              >
                ส่งให้ AI →
              </Button>,
            ]
      }
    >
      <Spin spinning={loading}>
        {feedback !== null ? (
          <div style={{
            background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 6,
            padding: "12px 16px", fontSize: 13, whiteSpace: "pre-wrap",
            maxHeight: 400, overflowY: "auto",
          }}>
            {feedback}
          </div>
        ) : preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: "12px 16px", background: "#f9f0ff", borderRadius: 8, border: "1px solid #d3adf7" }}>
              <Space wrap>
                <Text strong>{preview.profile_name}</Text>
                <Tag color={providerMeta?.color}>{providerMeta?.label}</Tag>
                <Text code style={{ fontSize: 12 }}>{preview.model}</Text>
              </Space>
            </div>

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

            <div>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Gross Descriptions (จะส่งเป็น user message)</Text>
              {preview.specimens_text ? (
                <div style={{
                  background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 6,
                  padding: "10px 12px", fontSize: 13, whiteSpace: "pre-wrap",
                  maxHeight: 200, overflowY: "auto",
                }}>
                  {preview.specimens_text}
                </div>
              ) : (
                <Alert type="warning" message="ยังไม่มี gross description ที่บันทึกไว้ — กรุณากรอกก่อน" showIcon />
              )}
            </div>
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default GrossingAssistModal;
