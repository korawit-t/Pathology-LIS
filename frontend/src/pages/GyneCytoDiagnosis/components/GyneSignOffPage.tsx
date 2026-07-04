import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Radio, Space, Tag, Spin, Button, Typography, Modal, Input, message } from "antd";
import {
  ArrowLeftOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  SendOutlined,
} from "@ant-design/icons";
import GyneDiagnosisService from "../../../services/gyneDiagnosisService";
import CriticalNotificationSection from "../../../components/CriticalNotificationSection";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import logger from "../../../utils/logger";

const { Text } = Typography;

interface GyneSignOffPageProps {
  open: boolean;
  caseId: number | string | undefined;
  caseData: GyneCytologyCase | null;
  finalizing: boolean;
  onClose: () => void;
  onFinalize: (slideQuality: string | null, stainQuality: string | null) => Promise<void>;
  onConfirmAndOutLab?: (
    reason: string,
    slideQuality: string,
    stainQuality: string,
  ) => Promise<void>;
}

const QUALITY_OPTIONS = [
  { value: "good",  tag: "success", label: "Good" },
  { value: "fair",  tag: "warning", label: "Fair" },
  { value: "poor",  tag: "error",   label: "Poor" },
] as const;

const GyneSignOffPage: React.FC<GyneSignOffPageProps> = ({
  open,
  caseId,
  caseData,
  finalizing,
  onClose,
  onFinalize,
  onConfirmAndOutLab,
}) => {
  const [slideQuality, setSlideQuality] = useState<string | null>(null);
  const [stainQuality, setStainQuality] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [outLabOpen, setOutLabOpen] = useState(false);
  const [outLabReason, setOutLabReason] = useState("");

  useEffect(() => {
    let activeUrl: string | null = null;
    if (open && caseId) {
      setSlideQuality(null);
      setStainQuality(null);
      setPdfLoading(true);
      GyneDiagnosisService.previewReportPdf(Number(caseId))
        .then((blob) => {
          activeUrl = URL.createObjectURL(blob);
          setPdfUrl(activeUrl);
        })
        .catch((err) => logger.error("slideQuality pdf preview", err))
        .finally(() => setPdfLoading(false));
    } else {
      setPdfUrl(null);
    }
    return () => { if (activeUrl) URL.revokeObjectURL(activeUrl); };
  }, [open, caseId]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const canFinalize = !!slideQuality && !!stainQuality;

  const handleConfirm = async () => {
    if (!canFinalize) return;
    onClose();
    await onFinalize(slideQuality, stainQuality);
  };

  const handleConfirmAndOutLabClick = () => {
    if (!canFinalize) return;
    setOutLabReason("");
    setOutLabOpen(true);
  };

  const handleOutLabConfirm = async () => {
    if (!outLabReason.trim()) {
      message.warning("Please enter a reason for Out-Lab Consult.");
      return;
    }
    setOutLabOpen(false);
    onClose();
    await onConfirmAndOutLab?.(outLabReason, slideQuality as string, stainQuality as string);
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1050, background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid #f0f0f0", background: "#fff", flexShrink: 0, gap: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onClose} disabled={finalizing}>
          Back
        </Button>
        <Space size={8}>
          <SafetyCertificateOutlined style={{ color: "#52c41a", fontSize: 16 }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>Sign Off</span>
        </Space>
        {caseData?.accession_no && (
          <Tag color="blue" style={{ fontSize: 14 }}>{caseData.accession_no}</Tag>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {onConfirmAndOutLab && (
            <Button
              icon={<SendOutlined />}
              onClick={handleConfirmAndOutLabClick}
              disabled={!canFinalize || finalizing}
              style={{ color: "#722ed1", borderColor: "#722ed1" }}
            >
              Out-Lab Consult
            </Button>
          )}
          <Button onClick={onClose} disabled={finalizing}>Cancel</Button>
          <Button
            type="primary"
            danger
            icon={<LockOutlined />}
            loading={finalizing}
            disabled={!canFinalize}
            onClick={handleConfirm}
          >
            Confirm &amp; Sign Off
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Quality form */}
        <div style={{ width: 360, flexShrink: 0, padding: "20px 24px", borderRight: "1px solid #f0f0f0", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Results cannot be edited after sign-off. Please verify the accuracy of the report before confirming.
          </Text>

          {/* Slide Quality */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              1. Slide Quality <span style={{ color: "#ff4d4f" }}>*</span>
            </div>
            <Radio.Group value={slideQuality} onChange={(e) => setSlideQuality(e.target.value)} style={{ width: "100%" }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {QUALITY_OPTIONS.map(({ value, tag, label }) => (
                  <Radio key={value} value={value}>
                    <Tag color={tag}>{label}</Tag>
                    <span style={{ color: "#595959" }}>
                      {value === "good" && "Good quality, ready to read"}
                      {value === "fair" && "Moderate quality, readable with limitations"}
                      {value === "poor" && "Poor quality, difficult to read"}
                    </span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>

          {/* Stain Quality */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              2. Stain Quality <span style={{ color: "#ff4d4f" }}>*</span>
            </div>
            <Radio.Group value={stainQuality} onChange={(e) => setStainQuality(e.target.value)} style={{ width: "100%" }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {QUALITY_OPTIONS.map(({ value, tag, label }) => (
                  <Radio key={value} value={value}>
                    <Tag color={tag}>{label}</Tag>
                    <span style={{ color: "#595959" }}>
                      {value === "good" && "Uniform and clear staining"}
                      {value === "fair" && "Acceptable staining with minor defects"}
                      {value === "poor" && "Non-uniform staining, affecting diagnosis"}
                    </span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>

          {!canFinalize && (
            <Text style={{ color: "#ff4d4f", fontSize: 12 }}>
              Please complete both assessments before proceeding.
            </Text>
          )}

          {caseId && (
            <CriticalNotificationSection
              caseId={Number(caseId)}
              caseType="GYNE_CYTO"
              accessionNo={caseData?.accession_no}
            />
          )}
        </div>

        {/* RIGHT: PDF Preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f5f5f5", overflow: "hidden" }}>
          {pdfLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Spin tip="Generating Preview..." size="large" />
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} width="100%" height="100%" style={{ border: "none", flex: 1 }} title="PDF Preview" />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#999" }}>
              <FilePdfOutlined style={{ fontSize: 48, marginBottom: 8 }} />
              <p>No Preview Available</p>
            </div>
          )}
        </div>

      </div>

      <Modal
        open={outLabOpen}
        title="Out-Lab Consult Reason"
        onCancel={() => setOutLabOpen(false)}
        onOk={handleOutLabConfirm}
        okText="Confirm & Sign Off"
      >
        <Input.TextArea
          rows={3}
          placeholder="Why is this case being sent for external consultation?"
          value={outLabReason}
          onChange={(e) => setOutLabReason(e.target.value)}
        />
      </Modal>
    </div>,
    document.body,
  );
};

export default GyneSignOffPage;
