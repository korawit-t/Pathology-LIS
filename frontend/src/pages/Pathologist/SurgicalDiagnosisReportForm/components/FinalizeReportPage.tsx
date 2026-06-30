import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import {
  Modal,
  Space,
  Form,
  Divider,
  Row,
  Col,
  Switch,
  Input,
  Radio,
  Tooltip,
  message,
  Spin,
  Typography,
  Alert,
  Button,
  Tag,
} from "antd";
import {
  FilePdfOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  ExperimentOutlined,
  LockOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import SurgicalReportService from "../../../../services/surgicalReportService";
import SurgicalBlockStainService from "../../../../services/surgicalBlockStainService";
import logger from "../../../../utils/logger";
import CriticalNotificationSection from "../../../../components/CriticalNotificationSection";
import NotificationRuleService from "../../../../services/notificationRuleService";

const { Text } = Typography;

export interface FinalizeData {
  stain_quality?: string;
  tissue_quality?: string;
  slide_quality?: string;
  is_pending?: boolean;
  pending_reason?: string;
}

interface StainOrder {
  stain_id: number;
  block_code: string;
  test_name: string;
  status: string;
  is_external: boolean;
}

interface FinalizeReportPageProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (data: FinalizeData) => Promise<void>;
  onConfirmWithConsult?: (data: FinalizeData) => Promise<void>;
  onConfirmAndOutLab?: (reason: string, data: FinalizeData) => Promise<void>;
  initialData?: FinalizeData;
  loading?: boolean;
  caseId?: number;
  accessionNo?: string;
  reportId?: number;
  pathologists?: Array<{ value: number; label: string }>;
  currentUserId?: number;
  senderName?: string;
}

const QUALITY_OPTIONS = [
  { value: "poor", label: "Poor" },
  { value: "fair", label: "Fair" },
  { value: "good", label: "Good" },
];

const FinalizeReportPage: React.FC<FinalizeReportPageProps> = ({
  open,
  onCancel,
  onConfirm,
  onConfirmWithConsult,
  onConfirmAndOutLab,
  initialData,
  loading,
  caseId,
  accessionNo,
  senderName,
}) => {
  const [data, setData] = useState<FinalizeData>({
    stain_quality: undefined,
    tissue_quality: undefined,
    slide_quality: undefined,
    is_pending: false,
    pending_reason: "",
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [unreviewedStains, setUnreviewedStains] = useState<StainOrder[]>([]);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [outLabOpen, setOutLabOpen] = useState(false);
  const [outLabReason, setOutLabReason] = useState("");

  // Load initial data
  useEffect(() => {
    if (open && initialData) {
      setData({
        stain_quality: initialData.stain_quality,
        tissue_quality: initialData.tissue_quality,
        slide_quality: initialData.slide_quality,
        is_pending: initialData.is_pending ?? false,
        pending_reason: initialData.pending_reason || "",
      });
    }
  }, [open, initialData]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // PDF preview — debounced
  useEffect(() => {
    let activeUrl: string | null = null;
    let timeoutId: number;
    if (open && caseId) {
      timeoutId = window.setTimeout(() => {
        setPdfLoading(true);
        SurgicalReportService.previewReportPdf(caseId, undefined, {
          is_pending: data.is_pending,
          pending_reason: data.pending_reason,
        })
          .then((blob) => {
            activeUrl = URL.createObjectURL(blob);
            setPdfUrl(activeUrl);
          })
          .catch((err) => {
            logger.error("Failed to load PDF preview", err);
            message.error("Failed to load PDF preview");
          })
          .finally(() => setPdfLoading(false));
      }, 500);
    } else {
      setPdfUrl(null);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [open, caseId, data.is_pending, data.pending_reason]);

  // Fetch unreviewed stains
  useEffect(() => {
    if (!open || !accessionNo) { setUnreviewedStains([]); return; }
    SurgicalBlockStainService.getStainOrdersByAccession(accessionNo)
      .then((stains) => {
        const typed = stains as unknown as StainOrder[];
        setUnreviewedStains(typed.filter((s) => s.status === "stained" && !s.test_name?.toLowerCase().includes("h&e")));
      })
      .catch(() => setUnreviewedStains([]));
  }, [open, accessionNo]);

  const handleMarkAllReviewed = async () => {
    setMarkingReviewed(true);
    try {
      await Promise.all(unreviewedStains.map((s) => SurgicalBlockStainService.updateStain(s.stain_id, { status: "completed" })));
      message.success(`${unreviewedStains.length} stain(s) marked as reviewed`);
      setUnreviewedStains([]);
    } catch {
      message.error("Failed to mark stains as reviewed");
    } finally {
      setMarkingReviewed(false);
    }
  };

  const validate = (): boolean => {
    if (data.is_pending && !data.pending_reason?.trim()) {
      message.warning("Please provide a reason for provisional status.");
      return false;
    }
    if (!data.stain_quality || !data.tissue_quality || !data.slide_quality) {
      message.warning("Please complete all quality assessments before signing off.");
      return false;
    }
    return true;
  };

  const handleConfirm = () => { if (validate()) onConfirm(data); };

  const handleConfirmAndOutLab = () => {
    if (!validate()) return;
    setOutLabReason("");
    setOutLabOpen(true);
  };

  const handleOutLabConfirm = async () => {
    if (!outLabReason.trim()) { message.warning("Please enter a reason for Out-Lab Consult."); return; }
    setOutLabOpen(false);
    NotificationRuleService.triggerEvent("outlab_consult", {
      id_case: accessionNo ?? String(caseId ?? ""),
      accession_no: accessionNo ?? "",
      sender: senderName ?? "-",
      lab_name: "-",
    }).catch(() => {});
    await onConfirmAndOutLab?.(outLabReason, data);
  };

  const qualityComplete = data.stain_quality && data.tissue_quality && data.slide_quality;

  if (!open) return null;

  return ReactDOM.createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 1050, background: "#fff", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid #f0f0f0", background: "#fff", flexShrink: 0, gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={onCancel} disabled={loading}>
            Back
          </Button>
          <Space size={8}>
            <SafetyCertificateOutlined style={{ color: "#52c41a", fontSize: 16 }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Sign Off Report</span>
          </Space>
          {accessionNo && <Tag color="blue" style={{ fontSize: 14 }}>{accessionNo}</Tag>}

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {onConfirmWithConsult && (
              <Button icon={<SendOutlined />} onClick={() => { if (validate()) onConfirmWithConsult(data); }} disabled={loading} style={{ color: "#1890ff", borderColor: "#1890ff" }}>
                Internal Consult
              </Button>
            )}
            {onConfirmAndOutLab && (
              <Button icon={<SendOutlined />} onClick={handleConfirmAndOutLab} disabled={loading} style={{ color: "#722ed1", borderColor: "#722ed1" }}>
                Out-Lab Consult
              </Button>
            )}
            <Button onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button
              type="primary"
              danger
              loading={loading}
              onClick={handleConfirm}
              disabled={!qualityComplete}
              icon={<LockOutlined />}
            >
              Confirm &amp; Sign Off
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT: Form */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 24px", borderRight: "1px solid #f0f0f0", overflowY: "auto" }}>

            <Text type="secondary" style={{ fontSize: 12, marginBottom: 16, display: "block" }}>
              Results cannot be edited after sign-off. Please verify the accuracy of the report before confirming.
            </Text>

            <Form layout="vertical">
              {/* Unreviewed stains warning */}
              {unreviewedStains.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<ExperimentOutlined />}
                  style={{ marginBottom: 16 }}
                  message={`${unreviewedStains.length} stain${unreviewedStains.length > 1 ? "s" : ""} awaiting review`}
                  description={
                    <div>
                      <div style={{ marginBottom: 8, fontSize: 12, color: "#595959" }}>
                        {unreviewedStains.map((s) => (
                          <span key={s.stain_id} style={{ marginRight: 8 }}>
                            {s.block_code} — {s.test_name}{s.is_external ? " (Outlab)" : ""}
                          </span>
                        ))}
                      </div>
                      <Button size="small" icon={<CheckSquareOutlined />} loading={markingReviewed} onClick={handleMarkAllReviewed} style={{ color: "#52c41a", borderColor: "#52c41a" }}>
                        Mark All as Reviewed
                      </Button>
                    </div>
                  }
                />
              )}

              {/* Report Completion */}
              <Divider style={{ margin: "0 0 16px 0" }}>Report Completion</Divider>
              <Form.Item label="Is this report complete?" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Switch
                    checked={!data.is_pending}
                    onChange={(checked) => setData((prev) => ({ ...prev, is_pending: !checked }))}
                    checkedChildren="Yes, Signed Off"
                    unCheckedChildren="No, Pending"
                    style={{ backgroundColor: !data.is_pending ? "#52c41a" : "#faad14" }}
                  />
                  {!data.is_pending && <LockOutlined style={{ color: "#52c41a", fontSize: 16 }} />}
                </div>
                <div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 4 }}>
                  Toggle "No, Pending" if waiting for IHC, Special Stain, or Consult
                </div>
              </Form.Item>

              {data.is_pending && (
                <Form.Item label="Reason for Pending" required style={{ marginBottom: 16 }}>
                  <Input.TextArea
                    rows={2}
                    placeholder="Identify the reason (e.g. Awaiting IHC / Consult)"
                    value={data.pending_reason}
                    onChange={(e) => setData((prev) => ({ ...prev, pending_reason: e.target.value }))}
                  />
                </Form.Item>
              )}

              {/* Quality Assessment */}
              <Divider style={{ margin: "8px 0 16px 0" }}>
                Quality Assessment <span style={{ color: "#ff4d4f", fontSize: 12, fontWeight: "normal" }}>(Required)</span>
              </Divider>

              {[
                { key: "stain_quality" as const, label: "Stain Quality", tooltip: "Visual clarity of H&E staining" },
                { key: "tissue_quality" as const, label: "Tissue Quality", tooltip: "Preservation of tissue morphology during processing and technical quality of sectioning" },
                { key: "slide_quality" as const, label: "Slide Quality", tooltip: "Technical quality of mounting" },
              ].map(({ key, label, tooltip }) => (
                <Form.Item key={key} label={<Space>{label}<Tooltip title={tooltip}><InfoCircleOutlined style={{ color: "#8c8c8c", cursor: "help" }} /></Tooltip></Space>} required style={{ marginBottom: 16 }}>
                  <Radio.Group value={data[key]} onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}>
                    <Space size="middle">
                      {QUALITY_OPTIONS.map((opt) => (
                        <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
                      ))}
                    </Space>
                  </Radio.Group>
                </Form.Item>
              ))}

              {caseId && (
                <CriticalNotificationSection caseId={caseId} caseType="SURGICAL" accessionNo={accessionNo} />
              )}
            </Form>
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
      </div>

      {/* Out-Lab Consult reason modal */}
      <Modal
        title={<Space><SendOutlined style={{ color: "#722ed1" }} /><span style={{ color: "#722ed1" }}>Out-Lab Consult — Reason</span></Space>}
        open={outLabOpen}
        onCancel={() => setOutLabOpen(false)}
        onOk={handleOutLabConfirm}
        okText="Confirm & Sign Off"
        okButtonProps={{ style: { backgroundColor: "#722ed1", borderColor: "#722ed1" } }}
        width={480}
        zIndex={1200}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12 }}>Report will be signed off and the case flagged as Out-Lab Consult.</p>
        <Input.TextArea
          rows={3}
          placeholder="Reason for Out-Lab Consult (e.g. Complex case, need subspecialty)..."
          value={outLabReason}
          onChange={(e) => setOutLabReason(e.target.value)}
          autoFocus
        />
      </Modal>
    </>,
    document.body,
  );
};

export default FinalizeReportPage;
