import React from "react";
import { Button, Space, Tag, Badge, Tooltip, Checkbox, Typography } from "antd";
import type { BadgeProps } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  AlertOutlined,
  LockOutlined,
  FileTextOutlined,
  PlusOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { NongyneCytologyCase } from "../../../types/nongyne";

const { Text } = Typography;

interface NongyneDiagnosisToolbarProps {
  caseId?: string | number;
  caseData: NongyneCytologyCase | null;
  statusConfig: { badgeStatus: BadgeProps["status"]; label: string };
  isAddendumMode: boolean;
  isEditorLocked: boolean;
  isConsultEditorLocked: boolean;
  isFinalized: boolean;
  isFormMode: boolean;
  isFinalizeLocked: boolean;
  hasDiagnosis: boolean;
  activeReportId: number | null;
  submitting: boolean;
  onBack?: () => void;
  onToggleOutLabConsult: (checked: boolean) => void;
  onRequestConsult: () => void;
  onViewFinalPdf: () => void;
  onOpenCompletedPopup: () => void;
  onCancelAddendum: () => void;
  onPreviewPdf: () => void;
  onSaveDraft: () => void;
  onFinalizeClick: () => void;
}

const NongyneDiagnosisToolbar: React.FC<NongyneDiagnosisToolbarProps> = ({
  caseId,
  caseData,
  statusConfig,
  isAddendumMode,
  isEditorLocked,
  isConsultEditorLocked,
  isFinalized,
  isFormMode,
  isFinalizeLocked,
  hasDiagnosis,
  activeReportId,
  submitting,
  onBack,
  onToggleOutLabConsult,
  onRequestConsult,
  onViewFinalPdf,
  onOpenCompletedPopup,
  onCancelAddendum,
  onPreviewPdf,
  onSaveDraft,
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
          <Badge
            status={statusConfig.badgeStatus}
            text={<Text style={{ fontSize: 13 }}>{statusConfig.label}</Text>}
          />
          {caseData?.is_pending && (
            <Tag color="orange" icon={<ClockCircleOutlined />} style={{ margin: 0 }}>
              Provisional
            </Tag>
          )}
          {caseData?.has_malignancy && (
            <Tag color="red" icon={<WarningOutlined />} style={{ margin: 0 }}>
              Malignancy
            </Tag>
          )}
          {caseData?.has_critical && (
            <Tag color="gold" icon={<AlertOutlined />} style={{ margin: 0 }}>
              Critical
            </Tag>
          )}
          {isAddendumMode && <Tag color="orange">New Report Mode</Tag>}
          {isEditorLocked && (
            <Tooltip title="Form is locked after sign-off">
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
          disabled={isEditorLocked}
        >
          Out-Lab Consult
        </Checkbox>

        {activeReportId && (
          <Button size="small" icon={<FileTextOutlined />} onClick={onRequestConsult}>
            Request Consult
          </Button>
        )}

        {isFinalized && !isAddendumMode && (
          <>
            <Button icon={<FileTextOutlined />} onClick={onViewFinalPdf}>
              View Report
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={onOpenCompletedPopup}
              style={{
                background: "#fa8c16",
                border: "none",
                color: "#fff",
              }}
            >
              New Report
            </Button>
          </>
        )}

        {isAddendumMode && (
          <Button icon={<ArrowLeftOutlined />} onClick={onCancelAddendum}>
            Cancel
          </Button>
        )}

        {isFormMode && (
          <>
            <Button icon={<FileTextOutlined />} onClick={onPreviewPdf}>
              Preview PDF
            </Button>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={submitting}
              onClick={onSaveDraft}
              style={{ background: "#52c41a", border: "none" }}
            >
              Save Draft
            </Button>

            {(!isFinalized || isAddendumMode || isConsultEditorLocked) && hasDiagnosis && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={submitting}
                disabled={isFinalizeLocked}
                onClick={onFinalizeClick}
                style={{ background: "#cf1322", border: "none" }}
              >
                Sign-off
              </Button>
            )}
          </>
        )}
      </Space>
    </div>
  </div>
);

export default NongyneDiagnosisToolbar;
