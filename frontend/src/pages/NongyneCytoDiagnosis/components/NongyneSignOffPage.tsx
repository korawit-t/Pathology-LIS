import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Radio, Space, Tag, Spin, Button, Typography, Switch, Input } from "antd";
import {
  ArrowLeftOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import NongyneDiagnosisService from "../../../services/nongyneDiagnosisService";
import CriticalNotificationSection from "../../../components/CriticalNotificationSection";
import type { NongyneCytologyCase } from "../../../types/nongyne";
import logger from "../../../utils/logger";

const { Text } = Typography;

const QUALITY_OPTIONS = [
  { value: "good",  tag: "success" as const, label: "Good" },
  { value: "fair",  tag: "warning" as const, label: "Fair" },
  { value: "poor",  tag: "error"   as const, label: "Poor" },
];

interface NongyneSignOffPageProps {
  open: boolean;
  caseId: number | string | undefined;
  caseData: NongyneCytologyCase | null;
  finalizing: boolean;
  initialSlideQuality?: string | null;
  initialStainQuality?: string | null;
  initialIsCasePending?: boolean;
  onClose: () => void;
  onConfirm: (
    slideQuality: string | null,
    stainQuality: string | null,
    isCasePending: boolean,
    pendingReason: string,
  ) => Promise<void>;
}

const NongyneSignOffPage: React.FC<NongyneSignOffPageProps> = ({
  open,
  caseId,
  caseData,
  finalizing,
  initialSlideQuality,
  initialStainQuality,
  initialIsCasePending = false,
  onClose,
  onConfirm,
}) => {
  const [slideQuality, setSlideQuality] = useState<string | null>(null);
  const [stainQuality, setStainQuality] = useState<string | null>(null);
  const [isCasePending, setIsCasePending] = useState(false);
  const [pendingReason, setPendingReason] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSlideQuality(initialSlideQuality ?? null);
      setStainQuality(initialStainQuality ?? null);
      setIsCasePending(initialIsCasePending);
      setPendingReason("");
    }
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // PDF preview — reload when pending status/reason changes
  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    if (open && caseId) {
      setPdfLoading(true);
      NongyneDiagnosisService.previewReportPdf(
        Number(caseId),
        isCasePending,
        isCasePending ? pendingReason : undefined,
      )
        .then((blob) => {
          if (cancelled) return;
          activeUrl = URL.createObjectURL(blob);
          setPdfUrl(activeUrl);
        })
        .catch((err) => { if (!cancelled) logger.error("nongyne signoff pdf preview", err); })
        .finally(() => { if (!cancelled) setPdfLoading(false); });
    } else {
      setPdfUrl(null);
    }
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [open, caseId, isCasePending, pendingReason]);

  const canFinalize = !!slideQuality && !!stainQuality;

  const handleConfirm = async () => {
    if (!canFinalize) return;
    onClose();
    await onConfirm(slideQuality, stainQuality, isCasePending, pendingReason);
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

        {/* LEFT: Form */}
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

          {/* Report Completion */}
          <div style={{ paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>3. Report Completion</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <Switch
                checked={!isCasePending}
                onChange={(checked) => {
                  setIsCasePending(!checked);
                  if (checked) setPendingReason("");
                }}
                checkedChildren="Complete"
                unCheckedChildren="Pending"
                style={{ backgroundColor: !isCasePending ? "#52c41a" : "#faad14" }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isCasePending ? "Report will be marked as Provisional/Pending" : "Final signed report"}
              </Text>
            </div>
            {isCasePending && (
              <Input.TextArea
                rows={2}
                placeholder="Reason for provisional status (e.g. awaiting IHC results)..."
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                style={{ marginTop: 4 }}
              />
            )}
          </div>

          {caseId && (
            <CriticalNotificationSection
              caseId={Number(caseId)}
              caseType="NONGYNE_CYTO"
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
    </div>,
    document.body,
  );
};

export default NongyneSignOffPage;
