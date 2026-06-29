import React, { useEffect, useState } from "react";
import { sanitizeHtml } from "../../utils/sanitize";
import {
  Card,
  Descriptions,
  Divider,
  Typography,
  Tag,
  Button,
  Input,
  Space,
  Skeleton,
  Row,
  Col,
  Alert,
  Result,
  Radio,
  Modal,
  Select,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  UserOutlined,
  HistoryOutlined,
  PlusOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import SurgicalReportService from "../../services/surgicalReportService";
import UserService from "../../services/userService";
import { SurgicalReport } from "../../types/surgicalReport";
import { User } from "../../types/user";
import { useApproval } from "./hooks/useApproval";
import PageContainer from "../../components/Layout/PageContainer";
import AccessionTag from "../../components/AccessionTag";
import logger from "../../utils/logger";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ApprovalDetailPageProps {
  reportId?: number | null;
  onBack?: () => void;
}

const ApprovalDetailPage: React.FC<ApprovalDetailPageProps> = ({
  reportId,
  onBack,
}) => {
  const [report, setReport] = useState<SurgicalReport | null>(null);
  const [comment, setComment] = useState("");
  const [agreement, setAgreement] = useState<"agree" | "disagree">("agree");
  const [agreementNote, setAgreementNote] = useState("");
  const [fetching, setFetching] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Add-signer modal state (Fix #4)
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [addSignerUserId, setAddSignerUserId] = useState<number | null>(null);
  const [addSignerRole, setAddSignerRole] = useState("co-signer");
  const [addSignerNote, setAddSignerNote] = useState("");
  const [addSignerLoading, setAddSignerLoading] = useState(false);
  const [pathologists, setPathologists] = useState<User[]>([]);

  const { processApproval, loading: actionLoading } = useApproval();

  useEffect(() => {
    if (reportId) {
      fetchData(reportId);
    }
  }, [reportId]);

  const fetchData = async (id: number) => {
    setFetching(true);
    try {
      const data = await SurgicalReportService.getReportById(id);
      setReport(data);

      // Fetch PDF Blob for preview
      const blob = await SurgicalReportService.getReportPdf(id);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      logger.error("Load report failed:", error);
    } finally {
      setFetching(false);
    }
  };

  // Cleanup PDF URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    UserService.getUsers({ role: "pathologist" }).then(setPathologists).catch(() => {});
  }, []);

  const handleAction = async (
    action: "APPROVED" | "REJECTED" | "REQUEST_CHANGES",
  ) => {
    if (!report) return;
    await processApproval(
      report.id,
      { action, comment, agreement, agreement_note: agreementNote },
      "surgical",
      () => { if (onBack) onBack(); },
    );
  };

  const handleAddSigner = async () => {
    if (!report || !addSignerUserId) return;
    setAddSignerLoading(true);
    try {
      await SurgicalReportService.addSigner(report.id, {
        user_id: addSignerUserId,
        role: addSignerRole,
        consult_note: addSignerNote || undefined,
      });
      message.success("Co-signer added successfully.");
      setAddSignerOpen(false);
      setAddSignerUserId(null);
      setAddSignerRole("co-signer");
      setAddSignerNote("");
      const updated = await SurgicalReportService.getReportById(report.id);
      setReport(updated);
    } catch {
      message.error("Failed to add co-signer.");
    } finally {
      setAddSignerLoading(false);
    }
  };

  if (fetching)
    return (
      <PageContainer withCard>
        <Skeleton active paragraph={{ rows: 10 }} />
      </PageContainer>
    );
  if (!report)
    return (
      <PageContainer withCard>
        <Result
          status="404"
          title="Report Not Found"
          extra={<Button onClick={onBack}>Back to List</Button>}
        />
      </PageContainer>
    );

  return (
    <PageContainer
      title={
        <Space>
          <Text>Review Report: <AccessionTag value={report.accession_no} copyable /></Text>
          <Tag color="processing" icon={<HistoryOutlined />}>
            VERSION {report.version_no}
          </Tag>
          <Tag color="gold">PENDING APPROVAL</Tag>
        </Space>
      }
      onBack={onBack}
    >
      <Row gutter={[24, 24]}>
        {/* Left Column: PDF Preview & Data Summary */}
        <Col xs={24} lg={16}>
          <Card
            bordered={false}
            className="standard-table-card"
            title="Report Preview"
            extra={
              <Button
                icon={<FileSearchOutlined />}
                onClick={() => window.open(pdfUrl || "", "_blank")}
                disabled={!pdfUrl}
              >
                Open in New Tab
              </Button>
            }
          >
            {pdfUrl ? (
              <iframe
                src={`${pdfUrl}#toolbar=0`}
                width="100%"
                height="800px"
                style={{ border: "1px solid #d9d9d9", borderRadius: 4 }}
                title="Surgical Report Preview"
              />
            ) : (
              <div style={{ height: 800, display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5" }}>
                <Skeleton active />
              </div>
            )}
          </Card>

          <Card bordered={false} className="standard-table-card" style={{ marginTop: 24 }} title="Data Summary">
            <Descriptions
              title="Patient Information"
              bordered
              size="small"
              column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}
            >
              <Descriptions.Item label="Accession No.">
                <Text strong>{report.accession_no}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Patient Name">{[report.patient_title, report.patient_name, report.patient_ln].filter(Boolean).join(" ")}</Descriptions.Item>
              <Descriptions.Item label="HN">
                {report.patient_hn || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Gender/Age">{`${report.patient_gender || "-"} / ${report.patient_age_display || "-"}`}</Descriptions.Item>
            </Descriptions>

            <Divider>Clinical Context</Divider>
            <Paragraph>
              <Text type="secondary">Clinical History:</Text>
              <div
                style={{
                  marginTop: 4,
                  padding: "8px 12px",
                  background: "#f5f5f5",
                  borderRadius: 4,
                }}
              >
                {report.clinical_history_snapshot || "No history recorded"}
              </div>
            </Paragraph>

            <Divider>Pathological Findings</Divider>

            <Title level={5}>Gross Description</Title>
            <div
              className="report-content-box"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(report.gross_description_summary || "<i>No content</i>"),
              }}
            />

            <Divider dashed />

            <Title level={5}>Microscopic Description</Title>
            <div
              className="report-content-box"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(report.microscopic_summary || "<i>See Diagnosis</i>"),
              }}
            />

            <Divider dashed />

            <Title level={4} style={{ color: "#d4380d" }}>
              Diagnosis
            </Title>
            <div
              className="diagnosis-content-box"
              style={{
                padding: "16px",
                background: "#fff2f0",
                border: "1px solid #ffccc7",
                borderRadius: 8,
              }}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(report.diagnosis_summary),
              }}
            />
          </Card>
        </Col>

        {/* Right Column: Decision Panel (Sticky) */}
        <Col xs={24} lg={8}>
          <div style={{ position: "sticky", top: 20 }}>
            <Card
              title={<><CheckCircleOutlined /> Approval Decision</>}
              bordered={false}
              className="standard-table-card"
              extra={
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setAddSignerOpen(true)}
                >
                  Add Co-signer
                </Button>
              }
            >
              <Alert
                message="Review Instruction"
                description="Please verify the report layout and content before releasing."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              {/* Consult notes from primary (Fix #2) */}
              {report.signers?.some((s) => s.consult_note) && (
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    <MessageOutlined /> Consult Notes:
                  </Text>
                  {report.signers
                    .filter((s) => s.consult_note)
                    .map((s, i) => (
                      <Alert
                        key={i}
                        type="warning"
                        showIcon
                        message={<span><Tag>{s.role}</Tag> {s.user_full_name || s.full_name}</span>}
                        description={s.consult_note}
                        style={{ marginBottom: 8 }}
                      />
                    ))}
                </div>
              )}

              {/* Agreement (Fix #1) */}
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Agreement with report:</Text>
                <Radio.Group value={agreement} onChange={(e) => setAgreement(e.target.value)} style={{ marginBottom: 8 }}>
                  <Radio value="agree">Agree</Radio>
                  <Radio value="disagree">Disagree</Radio>
                </Radio.Group>
                {agreement === "disagree" && (
                  <TextArea
                    rows={2}
                    value={agreementNote}
                    onChange={(e) => setAgreementNote(e.target.value)}
                    placeholder="Reason for disagreement..."
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Comment (Optional):</Text>
                <TextArea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Additional notes or reason for rejection..."
                  style={{ marginTop: 8 }}
                />
              </div>

              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<CheckCircleOutlined />}
                  loading={actionLoading}
                  onClick={() => handleAction("APPROVED")}
                  style={{ background: "#52c41a", borderColor: "#52c41a", height: 50, fontSize: 18 }}
                >
                  Release Report
                </Button>

                <Button
                  block
                  size="large"
                  icon={<FileSearchOutlined />}
                  loading={actionLoading}
                  onClick={() => handleAction("REQUEST_CHANGES")}
                >
                  Request Changes
                </Button>

                <Button
                  danger
                  block
                  size="large"
                  icon={<CloseCircleOutlined />}
                  loading={actionLoading}
                  onClick={() => handleAction("REJECTED")}
                >
                  Reject
                </Button>
              </Space>

              <Divider />
              <div style={{ textAlign: "center" }}>
                <Space>
                  <UserOutlined />
                  <Text type="secondary">Pathologist: {report.pathologist_name}</Text>
                </Space>
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      {/* Add Co-signer Modal (Fix #4) */}
      <Modal
        title="Add Co-signer"
        open={addSignerOpen}
        onCancel={() => setAddSignerOpen(false)}
        onOk={handleAddSigner}
        okText="Add"
        confirmLoading={addSignerLoading}
        okButtonProps={{ disabled: !addSignerUserId }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>Pathologist</Text>
            <Select
              showSearch
              placeholder="Select pathologist"
              optionFilterProp="label"
              style={{ width: "100%" }}
              value={addSignerUserId}
              onChange={setAddSignerUserId}
              options={pathologists.map((p) => ({ value: p.id, label: p.full_name }))}
            />
          </div>
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>Role</Text>
            <Select
              style={{ width: "100%" }}
              value={addSignerRole}
              onChange={setAddSignerRole}
              options={[
                { value: "co-signer", label: "Co-Signer" },
                { value: "consultant", label: "Consultant" },
                { value: "resident", label: "Resident" },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>Consult Note (Optional)</Text>
            <Input.TextArea
              rows={3}
              value={addSignerNote}
              onChange={(e) => setAddSignerNote(e.target.value)}
              placeholder="Question or context for the co-signer..."
            />
          </div>
        </Space>
      </Modal>
    </PageContainer>
  );
};

export default ApprovalDetailPage;
