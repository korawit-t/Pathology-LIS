import React, { useState } from "react";
import {
  Form,
  Switch,
  Space,
  Flex,
  Typography,
  Input,
  FormInstance,
  Button,
  Divider,
  Tooltip,
} from "antd";
import {
  ExclamationCircleOutlined,
  AlertOutlined,
  FlagOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  FormOutlined,
} from "@ant-design/icons";
import ConsultRequestModal from "../../../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../../../components/InternalConsult/ConsultHistorySection";
import StyledCard from "../../../../components/Layout/StyledCard";
import TumorRegistryModal from "./TumorRegistryModal";

const { Text, Title } = Typography;
const { TextArea } = Input;

interface CaseFlagManagerProps {
  isLocked?: boolean;
  form?: FormInstance;
  caseId?: number;
  reportId?: number;
  currentUserId?: number;
  pathologists?: Array<{ value: number; label: string }>;
  tumorRegistryEnabled?: boolean;
  tumorRegistryAiEnabled?: boolean;
}

const CaseFlagManager: React.FC<CaseFlagManagerProps> = ({
  isLocked,
  form,
  caseId,
  reportId,
  currentUserId,
  pathologists,
  tumorRegistryEnabled,
  tumorRegistryAiEnabled,
}) => {
  const isPending = Form.useWatch("is_pending", form);
  const [internalConsultOpen, setInternalConsultOpen] = useState(false);
  const [internalConsultKey, setInternalConsultKey] = useState(0);
  const [registryOpen, setRegistryOpen] = useState(false);

  return (
    <>
      <StyledCard
        size="small"
        style={{
          height: "100%",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #e8e8e8",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex",
          flexDirection: "column",
        }}
        styles={{
          body: {
            padding: "16px 20px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Title
            level={5}
            style={{
              margin: 0,
              color: "#262626",
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              fontWeight: 600,
            }}
          >
            <FlagOutlined style={{ marginRight: 8, color: "#ff4d4f" }} />
            Case Actions
          </Title>
        </div>

        <Flex vertical gap={12}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Malignancy */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "#fff1f0",
                borderRadius: "8px",
                border: "1px solid #ffa39e",
              }}
            >
              <Space>
                <ExclamationCircleOutlined style={{ color: "#cf1322" }} />
                <Text strong style={{ color: "#cf1322", fontSize: "13px" }}>
                  Malignancy
                </Text>
              </Space>
              <Form.Item
                name="has_malignancy"
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Switch
                  disabled={isLocked}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>
            </div>

            {/* Tumor Registry button */}
            {tumorRegistryEnabled && caseId && (
              <div style={{ paddingLeft: 12 }}>
                <Button
                  size="small"
                  type="link"
                  icon={<FormOutlined />}
                  style={{ padding: 0, color: "#cf1322" }}
                  onClick={() => setRegistryOpen(true)}
                >
                  Fill Tumor Registry →
                </Button>
              </div>
            )}

            {/* Critical */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "#fffbe6",
                borderRadius: "8px",
                border: "1px solid #ffe58f",
              }}
            >
              <Space>
                <AlertOutlined style={{ color: "#d48806" }} />
                <Text strong style={{ color: "#d48806", fontSize: "13px" }}>
                  Critical Case
                </Text>
              </Space>
              <Form.Item
                name="has_critical"
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Switch
                  disabled={isLocked}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>
            </div>

            {/* Provisional */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "#e6f7ff",
                borderRadius: "8px",
                border: "1px solid #91d5ff",
              }}
            >
              <Flex vertical gap={0}>
                <Space>
                  <ClockCircleOutlined style={{ color: "#1890ff" }} />
                  <Text strong style={{ color: "#1890ff", fontSize: "13px" }}>
                    Provisional
                  </Text>
                </Space>
                <Text
                  type="secondary"
                  style={{ fontSize: "10px", paddingLeft: 22 }}
                >
                  (Awaiting IHC / Special Stain)
                </Text>
              </Flex>
              <Form.Item
                name="is_pending"
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Switch
                  disabled={isLocked}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>
            </div>

            {/* Internal Consult */}
            <Tooltip title={!reportId ? "Save a draft first to request a consult" : undefined}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: reportId ? "#f0f5ff" : "#fafafa",
                  borderRadius: "8px",
                  border: `1px solid ${reportId ? "#adc6ff" : "#d9d9d9"}`,
                  cursor: reportId ? "pointer" : "not-allowed",
                  opacity: reportId ? 1 : 0.5,
                }}
                onClick={() => reportId && setInternalConsultOpen(true)}
              >
                <Space>
                  <MessageOutlined style={{ color: "#2f54eb" }} />
                  <Text strong style={{ color: "#2f54eb", fontSize: "13px" }}>
                    Internal Consult
                  </Text>
                </Space>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  disabled={!reportId}
                  onClick={(e) => { e.stopPropagation(); setInternalConsultOpen(true); }}
                >
                  Request
                </Button>
              </div>
            </Tooltip>
          </div>

          {/* Pending reason */}
          {isPending && (
            <div style={{ paddingLeft: 4, paddingRight: 4 }}>
              <Form.Item
                name="pending_reason"
                rules={[{ required: true, message: "Please specify reason" }]}
              >
                <TextArea
                  rows={2}
                  placeholder="Reason for pending (e.g. Wait for stains)..."
                  disabled={isLocked}
                  style={{ borderRadius: 8, fontSize: "13px" }}
                />
              </Form.Item>
            </div>
          )}

          {/* Internal Consult history */}
          {reportId && (
            <>
              <Divider style={{ margin: "4px 0" }} />
              <ConsultHistorySection
                caseType="surgical"
                reportId={reportId}
                currentUserId={currentUserId}
                refreshKey={internalConsultKey}
              />
            </>
          )}
        </Flex>
      </StyledCard>

      {reportId && (
        <ConsultRequestModal
          open={internalConsultOpen}
          onClose={() => setInternalConsultOpen(false)}
          onSuccess={() => setInternalConsultKey((k) => k + 1)}
          caseType="surgical"
          reportId={reportId}
          pathologists={pathologists ?? []}
        />
      )}
      {caseId && (
        <TumorRegistryModal
          open={registryOpen}
          onClose={() => setRegistryOpen(false)}
          caseId={caseId}
          isLocked={isLocked}
          aiEnabled={tumorRegistryAiEnabled}
        />
      )}
    </>
  );
};

export default CaseFlagManager;
