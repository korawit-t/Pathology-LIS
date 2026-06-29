import React, { useState, useEffect } from "react";
import { Modal, Form, Radio, Tag, Input, Typography } from "antd";
import { SurgicalCase } from "../../types/surgical";
import { MarkTarget, ActiveCaseType } from "./types";

const { Text } = Typography;

const RESULT_OPTIONS = [
  { value: "agree",             label: "Agree",             color: "green"   },
  { value: "minor_discrepancy", label: "Minor Discrepancy", color: "orange"  },
  { value: "major_discrepancy", label: "Major Discrepancy", color: "red"     },
  { value: "no_follow_up",      label: "No Follow-up",      color: "default" },
];

export interface MarkSaveValues {
  result: string;
  histoDx: string;
  comment: string;
}

interface MarkCorrelationModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (values: MarkSaveValues) => Promise<void>;
  markTarget: MarkTarget | null;
  activeCaseType?: ActiveCaseType;
  activeCase: SurgicalCase | null;
}

const MarkCorrelationModal: React.FC<MarkCorrelationModalProps> = ({
  open,
  onClose,
  onSave,
  markTarget,
  activeCaseType,
  activeCase,
}) => {
  const [markResult, setMarkResult] = useState("agree");
  const [markHistoDx, setMarkHistoDx] = useState("");
  const [markComment, setMarkComment] = useState("");
  const [markSaving, setMarkSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMarkResult("agree");
      setMarkHistoDx("");
      setMarkComment("");
    }
  }, [open]);

  const handleConfirm = async () => {
    setMarkSaving(true);
    try {
      await onSave({ result: markResult, histoDx: markHistoDx, comment: markComment });
    } finally {
      setMarkSaving(false);
    }
  };

  const isSurgSurg = markTarget?.rowCaseType === "surgical" && activeCaseType === "surgical";

  return (
    <Modal
      open={open}
      title={isSurgSurg ? "Link Surgical Cases" : `Mark as Related — ${activeCase?.accession_no ?? ""}`}
      onCancel={onClose}
      onOk={handleConfirm}
      okText="Confirm"
      cancelText="Cancel"
      confirmLoading={markSaving}
      width={480}
      centered
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: "13px" }}>
          Linking <Text strong>{markTarget?.rowAccession}</Text>
          {" ↔ "}
          <Text strong>
            {activeCaseType === "surgical" ? activeCase?.accession_no : "Current case"}
          </Text>
        </Text>
      </div>
      <Form layout="vertical" size="small">
        <Form.Item label="Correlation Result" required style={{ marginBottom: 12 }}>
          <Radio.Group value={markResult} onChange={(e) => setMarkResult(e.target.value)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {RESULT_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  <Tag color={opt.color} style={{ margin: 0 }}>{opt.label}</Tag>
                </Radio>
              ))}
            </div>
          </Radio.Group>
        </Form.Item>
        {!isSurgSurg && (
          <Form.Item label="Histology Diagnosis" style={{ marginBottom: 12 }}>
            <Input.TextArea
              rows={2}
              value={markHistoDx}
              onChange={(e) => setMarkHistoDx(e.target.value)}
              placeholder="Optional histology diagnosis..."
            />
          </Form.Item>
        )}
        <Form.Item label="Comment" style={{ marginBottom: 0 }}>
          <Input
            value={markComment}
            onChange={(e) => setMarkComment(e.target.value)}
            placeholder="Optional comment..."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MarkCorrelationModal;
