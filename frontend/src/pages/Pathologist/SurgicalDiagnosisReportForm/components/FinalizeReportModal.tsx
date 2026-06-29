import React, { useEffect, useState } from "react";
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
} from "antd";
import {
  FilePdfOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  ExperimentOutlined,
  LockOutlined,
  SendOutlined,
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

interface FinalizeReportModalProps {
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

const FinalizeReportModal: React.FC<FinalizeReportModalProps> = ({
  open,
  onCancel,
  onConfirm,
  onConfirmWithConsult,
  onConfirmAndOutLab,
  initialData,
  loading,
  caseId,
  accessionNo,
  reportId,
  pathologists,
  currentUserId,
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

  // Load initial data when modal opens
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

  // Fetch PDF Preview when modal opens or when pending status changes
  useEffect(() => {
    let activeUrl: string | null = null;
    let timeoutId: number;

    if (open && caseId) {
      // Debounce the fetch to avoid spamming the backend while typing
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
      }, 500); // 500ms debounce
    } else {
      setPdfUrl(null);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [open, caseId, data.is_pending, data.pending_reason]);

  // Fetch stains for this case and check for unreviewed ones
  useEffect(() => {
    if (!open || !accessionNo) {
      setUnreviewedStains([]);
      return;
    }
    SurgicalBlockStainService.getStainOrdersByAccession(accessionNo)
      .then((stains) => {
        const typed = stains as unknown as StainOrder[];
        setUnreviewedStains(
          typed.filter(
            (s) =>
              s.status === "stained" &&
              !s.test_name?.toLowerCase().includes("h&e"),
          ),
        );
      })
      .catch(() => setUnreviewedStains([]));
  }, [open, accessionNo]);

  const handleMarkAllReviewed = async () => {
    setMarkingReviewed(true);
    try {
      await Promise.all(
        unreviewedStains.map((s) =>
          SurgicalBlockStainService.updateStain(s.stain_id, { status: "completed" })
        )
      );
      message.success(`${unreviewedStains.length} stain(s) marked as reviewed`);
      setUnreviewedStains([]);
    } catch {
      message.error("Failed to mark stains as reviewed");
    } finally {
      setMarkingReviewed(false);
    }
  };

  const [pendingSignOff, setPendingSignOff] = useState(false);
  const [outLabOpen, setOutLabOpen] = useState(false);
  const [outLabReason, setOutLabReason] = useState("");

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

  const handleConfirm = () => {
    if (validate()) onConfirm(data);
  };

  const handleConfirmAndOutLab = () => {
    if (!validate()) return;
    setOutLabReason("");
    setOutLabOpen(true);
  };

  const handleOutLabConfirm = async () => {
    if (!outLabReason.trim()) {
      message.warning("Please enter a reason for Out-Lab Consult.");
      return;
    }
    setOutLabOpen(false);
    NotificationRuleService.triggerEvent("outlab_consult", {
      id_case: accessionNo ?? String(caseId ?? ""),
      accession_no: accessionNo ?? "",
      sender: senderName ?? "-",
      lab_name: "-",
    }).catch(() => {});
    await onConfirmAndOutLab?.(outLabReason, data);
  };

  return (
    <>
    <Modal
      title="Sign Off Report"
      open={open}
      onCancel={onCancel}
      width={1400}
      centered
      style={{ top: 20 }}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
          <Space>
            {onConfirmWithConsult && (
              <Button
                icon={<SendOutlined />}
                onClick={() => { if (validate()) onConfirmWithConsult(data); }}
                disabled={loading}
                style={{ color: "#1890ff", borderColor: "#1890ff" }}
              >
                Internal Consult
              </Button>
            )}
            {onConfirmAndOutLab && (
              <Button icon={<SendOutlined />} onClick={handleConfirmAndOutLab} disabled={loading} style={{ color: "#722ed1", borderColor: "#722ed1" }}>
                Out-Lab Consult
              </Button>
            )}
          </Space>
          <Space>
            <Button onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button danger loading={loading} onClick={handleConfirm}>
              Confirm &amp; Sign Off
            </Button>
          </Space>
        </div>
      }
    >
      <Row gutter={24}>
        {/* Left Column: Form & Tabs */}
        <Col span={7} style={{ borderRight: "1px solid #f0f0f0" }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: 0 }}>
              Results cannot be edited after sign-off. Please verify the
              accuracy of the report before confirming.
            </p>
          </div>

          <Form layout="vertical">
            {/* Unreviewed stains warning */}
            {unreviewedStains.length > 0 && (
              <Alert
                type="warning"
                showIcon
                icon={<ExperimentOutlined />}
                style={{ marginBottom: 16 }}
                message={`${unreviewedStains.length} stain${unreviewedStains.length > 1 ? "s" : ""} awaiting pathologist review`}
                description={
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 12, color: "#595959" }}>
                      {unreviewedStains.map((s) => (
                        <span key={s.stain_id} style={{ marginRight: 8 }}>
                          {s.block_code} — {s.test_name}
                          {s.is_external ? " (Outlab)" : ""}
                        </span>
                      ))}
                    </div>
                    <Button
                      size="small"
                      icon={<CheckSquareOutlined />}
                      loading={markingReviewed}
                      onClick={handleMarkAllReviewed}
                      style={{ color: "#52c41a", borderColor: "#52c41a" }}
                    >
                      Mark All as Reviewed
                    </Button>
                  </div>
                }
              />
            )}

            {/* Case Flags Section */}
            <Divider style={{ margin: "0 0 16px 0" }}>
              Report Completion
            </Divider>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Form.Item
                  label="Is this report complete?"
                  style={{ marginBottom: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <Switch
                      checked={!data.is_pending}
                      onChange={(checked) =>
                        setData((prev) => ({ ...prev, is_pending: !checked }))
                      }
                      checkedChildren="Yes, Signed Off"
                      unCheckedChildren="No, Pending"
                      style={{
                        backgroundColor: !data.is_pending
                          ? "#52c41a"
                          : "#faad14",
                      }}
                    />
                    {!data.is_pending && (
                      <LockOutlined style={{ color: "#52c41a", fontSize: 16 }} />
                    )}
                  </div>
                  <div
                    style={{
                      color: "#8c8c8c",
                      fontSize: "12px",
                      marginTop: "4px",
                    }}
                  >
                    (Toggle "No, Pending" if waiting for IHC, Special Stain, or Consult)
                  </div>
                </Form.Item>
              </Col>
            </Row>

            {/* ส่วนนี้ยังใช้ data.is_pending ในการโชว์/ซ่อน ได้ตามปกติเลยครับ */}
            {data.is_pending && (
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="Reason for Pending" required>
                    <Input.TextArea
                      rows={2}
                      placeholder="Identify the reason (e.g. Awaiting IHC / Consult)"
                      value={data.pending_reason}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          pending_reason: e.target.value,
                        }))
                      }
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {/* Quality Assessment Section */}
            <Divider style={{ margin: "8px 0 16px 0" }}>
              Quality Assessment{" "}
              <span
                style={{
                  color: "#ff4d4f",
                  fontSize: "12px",
                  fontWeight: "normal",
                }}
              >
                (Required)
              </span>
            </Divider>
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item
                  label={
                    <Space>
                      Stain Quality
                      <Tooltip title="Visual clarity of H&E staining">
                        <InfoCircleOutlined
                          style={{ color: "#8c8c8c", cursor: "help" }}
                        />
                      </Tooltip>
                    </Space>
                  }
                  required
                >
                  <Radio.Group
                    value={data.stain_quality}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        stain_quality: e.target.value,
                      }))
                    }
                  >
                    <Space size="middle">
                      <Tooltip title="Understain, uninterpretable">
                        <Radio value="poor">Poor</Radio>
                      </Tooltip>
                      <Tooltip title="Acceptable">
                        <Radio value="fair">Fair</Radio>
                      </Tooltip>
                      <Tooltip title="Appropriate, uniform">
                        <Radio value="good">Good</Radio>
                      </Tooltip>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item
                  label={
                    <Space>
                      Tissue Quality
                      <Tooltip title="Preservation of tissue morphology during processing and technical quality of sectioning">
                        <InfoCircleOutlined
                          style={{ color: "#8c8c8c", cursor: "help" }}
                        />
                      </Tooltip>
                    </Space>
                  }
                  required
                >
                  <Radio.Group
                    value={data.tissue_quality}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        tissue_quality: e.target.value,
                      }))
                    }
                  >
                    <Space size="middle">
                      <Tooltip title="Fragmented tissue">
                        <Radio value="poor">Poor</Radio>
                      </Tooltip>
                      <Tooltip title="Minor issues (e.g., tissue tearing, folding)">
                        <Radio value="fair">Fair</Radio>
                      </Tooltip>
                      <Tooltip title="Easy to interpret">
                        <Radio value="good">Good</Radio>
                      </Tooltip>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item
                  label={
                    <Space>
                      Slide Quality
                      <Tooltip title="Technical quality of mounting">
                        <InfoCircleOutlined
                          style={{ color: "#8c8c8c", cursor: "help" }}
                        />
                      </Tooltip>
                    </Space>
                  }
                  required
                >
                  <Radio.Group
                    value={data.slide_quality}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        slide_quality: e.target.value,
                      }))
                    }
                  >
                    <Space size="middle">
                      <Tooltip title="Uninterpretable (e.g., excessive bubbles)">
                        <Radio value="poor">Poor</Radio>
                      </Tooltip>
                      <Tooltip title="Minor defects (e.g., excessive xylene)">
                        <Radio value="fair">Fair</Radio>
                      </Tooltip>
                      <Tooltip title="Easy to interpret">
                        <Radio value="good">Good</Radio>
                      </Tooltip>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>

            {caseId && (
              <CriticalNotificationSection caseId={caseId} caseType="SURGICAL" accessionNo={accessionNo} />
            )}
          </Form>
        </Col>

        {/* Right Column: PDF Preview */}
        <Col span={17}>
          <div
            style={{
              height: "75vh",
              background: "#f5f5f5",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 8,
              border: "1px solid #d9d9d9",
              overflow: "hidden",
            }}
          >
            {pdfLoading ? (
              <Spin tip="Generating Preview..." size="large" />
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="PDF Preview"
              />
            ) : (
              <div style={{ textAlign: "center", color: "#999" }}>
                <FilePdfOutlined style={{ fontSize: 48, marginBottom: 8 }} />
                <p>No Preview Available</p>
              </div>
            )}
          </div>
        </Col>
      </Row>
    </Modal>

      {/* Out-Lab Consult reason modal */}
      <Modal
        title={
          <Space>
            <SendOutlined style={{ color: "#722ed1" }} />
            <span style={{ color: "#722ed1" }}>Out-Lab Consult — Reason</span>
          </Space>
        }
        open={outLabOpen}
        onCancel={() => setOutLabOpen(false)}
        onOk={handleOutLabConfirm}
        okText="Confirm & Sign Off"
        okButtonProps={{ style: { backgroundColor: "#722ed1", borderColor: "#722ed1" } }}
        width={480}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12 }}>
          Report will be signed off and the case flagged as Out-Lab Consult.
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Reason for Out-Lab Consult (e.g. Complex case, need subspecialty)..."
          value={outLabReason}
          onChange={(e) => setOutLabReason(e.target.value)}
          autoFocus
        />
      </Modal>
    </>
  );
};

export default FinalizeReportModal;
