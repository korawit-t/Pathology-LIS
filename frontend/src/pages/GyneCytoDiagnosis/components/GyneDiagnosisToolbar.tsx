import React from "react";
import { Button, Space, Tag, Badge, Tooltip, Checkbox, Typography } from "antd";
import type { BadgeProps } from "antd";
import {
  ArrowLeftOutlined,
  LockOutlined,
  HistoryOutlined,
  FileTextOutlined,
  EditOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";

const { Text } = Typography;

interface GyneDiagnosisToolbarProps {
  caseId?: string | number;
  caseData: GyneCytologyCase | null;
  statusConfig: { color: BadgeProps["status"]; label: string };
  isRevision: boolean;
  isEditorLocked: boolean;
  isConsultEditorLocked: boolean;
  isFinalized: boolean;
  isPendingReview: boolean;
  isFormMode: boolean;
  isFinalizeLocked: boolean;
  hasDiagnosis: boolean;
  historyCount: number;
  isCurrentUserSigned: boolean;
  forceEdit: boolean;
  submitting: boolean;
  finalizing: boolean;
  requiresPathologistReview: boolean;
  onBack?: () => void;
  onToggleOutLabConsult: (checked: boolean) => void;
  onOpenHistory: () => void;
  onViewFinalPDF: () => void;
  onStartRevision: () => void;
  onPreviewPDF: () => void;
  onSaveDraft: () => void;
  onSendToPathologistClick: () => void;
  onFinalizeClick: () => void;
}

const GyneDiagnosisToolbar: React.FC<GyneDiagnosisToolbarProps> = ({
  caseId,
  caseData,
  statusConfig,
  isRevision,
  isEditorLocked,
  isConsultEditorLocked,
  isFinalized,
  isPendingReview,
  isFormMode,
  isFinalizeLocked,
  hasDiagnosis,
  historyCount,
  isCurrentUserSigned,
  forceEdit,
  submitting,
  finalizing,
  requiresPathologistReview,
  onBack,
  onToggleOutLabConsult,
  onOpenHistory,
  onViewFinalPDF,
  onStartRevision,
  onPreviewPDF,
  onSaveDraft,
  onSendToPathologistClick,
  onFinalizeClick,
}) => (
  <div
    style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #f0f0f0",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      padding: "10px 24px",
      marginBottom: 20,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Left */}
      <Space size="large">
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} />
        <Space size={8}>
          <Text strong style={{ fontSize: 16 }}>
            {caseData?.accession_no || `Case #${caseId}`}
          </Text>
          <Badge status={statusConfig.color} text={<Text style={{ fontSize: 13 }}>{statusConfig.label}</Text>} />
          {isRevision && <Tag color="orange">Revision Mode</Tag>}
          {isEditorLocked && (
            <Tooltip title="Form is locked">
              <LockOutlined style={{ color: "#8c8c8c" }} />
            </Tooltip>
          )}
        </Space>
      </Space>

      {/* Right */}
      <Space>
        <Checkbox
          checked={caseData?.is_out_lab_consult || false}
          onChange={(e) => onToggleOutLabConsult(e.target.checked)}
          disabled={isEditorLocked && !isRevision}
        >
          Out-Lab Consult
        </Checkbox>

        {hasDiagnosis && historyCount > 0 && (
          <Badge count={historyCount} size="small">
            <Button icon={<HistoryOutlined />} onClick={onOpenHistory}>
              History
            </Button>
          </Badge>
        )}

        {hasDiagnosis && isFinalized && !isRevision && (
          <>
            <Button icon={<FileTextOutlined />} onClick={onViewFinalPDF}>
              View Report
            </Button>
            {!isPendingReview && (
              <Button danger icon={<EditOutlined />} onClick={onStartRevision}>
                Revise
              </Button>
            )}
          </>
        )}

        {isFormMode && (!isCurrentUserSigned || forceEdit || isRevision) && (
          <>
            {hasDiagnosis && (
              <Button icon={<FileTextOutlined />} onClick={onPreviewPDF}>
                Preview PDF
              </Button>
            )}

            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={submitting}
              disabled={finalizing}
              onClick={onSaveDraft}
              style={{ background: "#52c41a", border: "none" }}
            >
              {isRevision ? "Save Draft Revision" : "Save Draft"}
            </Button>
            {(!isFinalized || isRevision || isConsultEditorLocked) && hasDiagnosis && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={finalizing}
                onClick={requiresPathologistReview ? onSendToPathologistClick : onFinalizeClick}
                disabled={submitting || isFinalizeLocked}
                style={{
                  background: requiresPathologistReview ? "#fa8c16" : "#cf1322",
                  border: "none",
                }}
              >
                {requiresPathologistReview ? "Send to Pathologist" : "Sign-off"}
              </Button>
            )}
          </>
        )}
      </Space>
    </div>
  </div>
);

export default GyneDiagnosisToolbar;
