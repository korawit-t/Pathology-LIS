import React, { useEffect, useState } from "react";
import { Modal, Space, Typography, Tag, Button, Segmented, Spin } from "antd";
import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import type { ReportGenPreview } from "../../../../services/reportGenerationService";

const { Text } = Typography;

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "green" },
  anthropic: { label: "Anthropic", color: "purple" },
  openai_compatible: { label: "OpenAI-Compatible", color: "blue" },
};

export type AIGenerateSource = "gross_and_micro" | "gross_only" | "micro_only";

interface AIGeneratePreviewModalProps {
  open: boolean;
  fetchPreview: (source: AIGenerateSource) => Promise<ReportGenPreview>;
  confirming: boolean;
  onConfirm: (source: AIGenerateSource) => void;
  onCancel: () => void;
}

const AIGeneratePreviewModal: React.FC<AIGeneratePreviewModalProps> = ({
  open,
  fetchPreview,
  confirming,
  onConfirm,
  onCancel,
}) => {
  const [source, setSource] = useState<AIGenerateSource>("gross_and_micro");
  const [preview, setPreview] = useState<ReportGenPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPreview(source)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [open, source]);

  const handleCancel = () => {
    setSource("gross_and_micro");
    setPreview(null);
    onCancel();
  };

  const providerMeta = preview
    ? (PROVIDER_LABELS[preview.provider] ?? { label: preview.provider, color: "default" })
    : null;

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined style={{ color: "#722ed1" }} />
          <span>AI Generate Report — Preview</span>
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          ยกเลิก
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<SendOutlined />}
          loading={confirming}
          disabled={loading || !preview}
          onClick={() => onConfirm(source)}
          style={{ background: "#722ed1", borderColor: "#722ed1" }}
        >
          ส่งให้ AI →
        </Button>,
      ]}
      destroyOnClose
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Source selector */}
        <div>
          <Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginBottom: 8 }}
          >
            Generate from
          </Text>
          <Segmented
            value={source}
            onChange={(v) => setSource(v as AIGenerateSource)}
            options={[
              { label: "Gross + Microscopic", value: "gross_and_micro" },
              { label: "Gross only", value: "gross_only" },
              { label: "Microscopic only", value: "micro_only" },
            ]}
            disabled={loading || confirming}
          />
        </div>

        <Spin spinning={loading}>
          {preview && (
            <>
              {/* Model info */}
              <div
                style={{
                  padding: "12px 16px",
                  background: "#f9f0ff",
                  borderRadius: 8,
                  border: "1px solid #d3adf7",
                }}
              >
                <Space wrap>
                  <Text strong>{preview.profile_name}</Text>
                  <Tag color={providerMeta?.color}>{providerMeta?.label}</Tag>
                  <Text code style={{ fontSize: 12 }}>
                    {preview.model}
                  </Text>
                </Space>
              </div>

              {/* System Prompt */}
              <div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: "block", marginBottom: 4 }}
                >
                  System Prompt
                </Text>
                <div
                  style={{
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    maxHeight: 180,
                    overflowY: "auto",
                    color: "#434343",
                  }}
                >
                  {preview.system_prompt}
                </div>
              </div>

              {/* User Message */}
              <div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: "block", marginBottom: 4 }}
                >
                  User Message (จะส่งให้ AI)
                </Text>
                <div
                  style={{
                    background: "#fff7e6",
                    border: "1px solid #ffd591",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {preview.user_message}
                </div>
              </div>
            </>
          )}
        </Spin>
      </div>
    </Modal>
  );
};

export default AIGeneratePreviewModal;
