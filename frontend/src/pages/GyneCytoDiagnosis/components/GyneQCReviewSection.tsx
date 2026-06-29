import React, { useState } from "react";
import { Alert, Button, Modal, Radio, Space, Tag, Input } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";

const { TextArea } = Input;

interface GyneQCReviewSectionProps {
  caseData: GyneCytologyCase | null;
  isPendingReview: boolean;
  isPathologist: boolean;
  completingReview: boolean;
  onAgree: () => void;
  onDisagree: (
    note: string,
    level: "minor" | "major" | null,
  ) => Promise<void>;
}

const GyneQCReviewSection: React.FC<GyneQCReviewSectionProps> = ({
  caseData,
  isPendingReview,
  isPathologist,
  completingReview,
  onAgree,
  onDisagree,
}) => {
  const [disagreeModalOpen, setDisagreeModalOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [discrepancyLevel, setDiscrepancyLevel] = useState<
    "minor" | "major" | null
  >(null);

  const handleDisagreeConfirm = async () => {
    await onDisagree(reviewNote, discrepancyLevel);
    setDisagreeModalOpen(false);
    setReviewNote("");
    setDiscrepancyLevel(null);
  };

  return (
    <>
      {/* QC Review Banner */}
      {isPendingReview && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={
            caseData?.review_reason === "abnormal"
              ? "Abnormal Case — Awaiting Pathologist Review"
              : "QC Review Required — 10% Random Sample"
          }
          description={
            caseData?.review_reason === "abnormal"
              ? "This case was flagged as abnormal by the cytotechnologist and requires pathologist evaluation before approval."
              : "This case has been randomly selected for 10% QC review. Does your finding agree with the cytotechnologist's interpretation?"
          }
          style={{ marginBottom: 16, borderRadius: 8 }}
          action={
            isPathologist ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Button
                  size="small"
                  type="primary"
                  loading={completingReview}
                  onClick={onAgree}
                  style={{
                    background:
                      caseData?.review_reason === "random_10pct"
                        ? "#52c41a"
                        : "#722ed1",
                    border: "none",
                    width: "100%",
                  }}
                >
                  Agree
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={() => setDisagreeModalOpen(true)}
                  style={{ width: "100%" }}
                >
                  Disagree
                </Button>
              </div>
            ) : null
          }
        />
      )}

      {/* Discordance recorded banner */}
      {!isPendingReview && caseData?.review_result === "disagree" && (
        <Alert
          type="error"
          showIcon
          message={
            <Space>
              {
                "Discordant Case — Pathologist Disagreed with CT Interpretation"
              }
              {caseData.discrepancy_level && (
                <Tag
                  color={
                    caseData.discrepancy_level === "major" ? "error" : "warning"
                  }
                  style={{ marginLeft: 4 }}
                >
                  {caseData.discrepancy_level === "major"
                    ? "Major Discrepancy"
                    : "Minor Discrepancy"}
                </Tag>
              )}
            </Space>
          }
          description={
            caseData.review_note ||
            "Please revise the report to reflect the pathologist's findings."
          }
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* Discordance Modal */}
      <Modal
        title="Record Discordance"
        open={disagreeModalOpen}
        onCancel={() => {
          setDisagreeModalOpen(false);
          setReviewNote("");
          setDiscrepancyLevel(null);
        }}
        onOk={handleDisagreeConfirm}
        okText="Confirm Disagreement"
        okButtonProps={{ danger: true, disabled: !discrepancyLevel }}
        confirmLoading={completingReview}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Discrepancy Level <span style={{ color: "#ff4d4f" }}>*</span>
          </div>
          <Radio.Group
            value={discrepancyLevel}
            onChange={(e) => setDiscrepancyLevel(e.target.value)}
            style={{ display: "flex", gap: 12 }}
          >
            <Radio.Button value="minor" style={{ flex: 1, textAlign: "center" }}>
              Minor Discrepancy
            </Radio.Button>
            <Radio.Button
              value="major"
              style={{
                flex: 1,
                textAlign: "center",
                borderColor:
                  discrepancyLevel === "major" ? "#ff4d4f" : undefined,
              }}
            >
              Major Discrepancy
            </Radio.Button>
          </Radio.Group>
          {discrepancyLevel === "minor" && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#8c8c8c" }}>
              Minor — interpretation difference with no significant impact on
              clinical management.
            </div>
          )}
          {discrepancyLevel === "major" && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#ff4d4f" }}>
              Major — significant difference that changes diagnosis or clinical
              management.
            </div>
          )}
        </div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Description</div>
        <TextArea
          rows={4}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Describe how your finding differs from the cytotechnologist's interpretation..."
        />
      </Modal>
    </>
  );
};

export default GyneQCReviewSection;
