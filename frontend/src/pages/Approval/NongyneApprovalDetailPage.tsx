import React, { useEffect, useState } from "react";
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
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  FileSearchOutlined,
  UserOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import NongyneReportService from "../../services/nongyneReportService";
import { useApproval } from "./hooks/useApproval";
import logger from "../../utils/logger";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface NongyneReportSigner {
  role?: string;
  report_name?: string;
  full_name?: string;
}

interface NongyneReport {
  id: number;
  status?: string;
  accession_no?: string;
  version_no?: number | string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  patient_gender?: string;
  patient_age?: string | number;
  specimen_type?: string;
  collection_site?: string;
  pathologist_name?: string;
  diagnosis?: string;
  microscopic_description?: string;
  comment?: string;
  has_malignancy?: boolean;
  created_at?: string;
  signers?: NongyneReportSigner[];
}

interface NongyneApprovalDetailPageProps {
  reportId?: number | null;
  onBack?: () => void;
}

const NongyneApprovalDetailPage: React.FC<NongyneApprovalDetailPageProps> = ({
  reportId,
  onBack,
}) => {
  const [report, setReport] = useState<NongyneReport | null>(null);
  const [comment, setComment] = useState("");
  const [agreement, setAgreement] = useState<"agree" | "disagree">("agree");
  const [agreementNote, setAgreementNote] = useState("");
  const [fetching, setFetching] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { processApproval, loading: actionLoading } = useApproval();

  useEffect(() => {
    if (reportId) {
      fetchData(reportId);
    }
  }, [reportId]);

  const fetchData = async (id: number) => {
    setFetching(true);
    try {
      let targetReportId = id;
      let data: NongyneReport | null = null;

      try {
        const reports = await NongyneReportService.getReportsByCase(id) as unknown as NongyneReport[];
        const pending = reports.find(
          (r) => r.status === "pending" || r.status === "draft",
        );
        if (pending) {
          targetReportId = pending.id;
          data = pending;
        } else if (reports.length > 0) {
          targetReportId = reports[0].id;
          data = reports[0];
        } else {
          data = await NongyneReportService.getReportById(id) as unknown as NongyneReport;
          targetReportId = id;
        }
      } catch {
        try {
          data = await NongyneReportService.getReportById(id) as unknown as NongyneReport;
          targetReportId = id;
        } catch {
          logger.error("Not a valid Case ID or Report ID");
        }
      }

      if (data) {
        setReport(data);
        const blob = await NongyneReportService.getReportPdf(targetReportId);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      }
    } catch (error) {
      logger.error("Load nongyne report or PDF failed:", error);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleAction = async (
    action: "APPROVED" | "REJECTED" | "REQUEST_CHANGES",
  ) => {
    if (!report) return;
    await processApproval(
      report.id,
      {
        action,
        comment,
        agreement,
        agreement_note: agreement === "disagree" ? agreementNote : undefined,
      },
      "nongyne",
      () => {
        if (onBack) onBack();
      },
    );
  };

  if (fetching)
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 10 }} />
      </Card>
    );
  if (!report)
    return (
      <Result
        status="404"
        title="Report Not Found"
        extra={<Button onClick={onBack}>Back to List</Button>}
      />
    );

  return (
    <div style={{ padding: "0 24px 24px 24px" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Space direction="vertical" size={0}>
          <Button
            type="link"
            icon={<RollbackOutlined />}
            onClick={onBack}
            style={{ padding: 0 }}
          >
            Back to Pending List
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Review Non-Gyne Report:{" "}
            <Text style={{ color: "#13c2c2" }}>{report.accession_no}</Text>
          </Title>
        </Space>

        <Space>
          <Tag color="cyan" icon={<HistoryOutlined />}>
            VERSION {report.version_no}
          </Tag>
          <Tag color="orange">PENDING APPROVAL</Tag>
        </Space>
      </div>

      <Row gutter={[24, 24]}>
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
                title="Non-Gyne Report Preview"
              />
            ) : (
              <div
                style={{
                  height: 800,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  background: "#f5f5f5",
                }}
              >
                <Skeleton active />
              </div>
            )}
          </Card>

          <Card
            bordered={false}
            className="standard-table-card"
            style={{ marginTop: 24 }}
            title="Data Summary"
          >
            <Descriptions
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
              <Descriptions.Item label="Gender/Age">{`${report.patient_gender || "-"} / ${report.patient_age || "-"}`}</Descriptions.Item>
            </Descriptions>

            <Divider>Cytology Findings</Divider>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Specimen Type">
                {report.specimen_type || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Collection Site">
                {report.collection_site || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Diagnosis">
                {report.diagnosis || "-"}
              </Descriptions.Item>
              {report.has_malignancy && (
                <Descriptions.Item label="Malignancy">
                  <Tag color="red">MALIGNANCY</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <div style={{ position: "sticky", top: 20 }}>
            <Card
              title={
                <>
                  <CheckCircleOutlined /> Approval Decision
                </>
              }
              bordered={false}
              className="standard-table-card"
            >
              <Alert
                message="Review Instruction"
                description="Please verify the report layout and content before releasing."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>
                  Agreement with previous signer:
                </Text>
                <Radio.Group
                  value={agreement}
                  onChange={(e) => setAgreement(e.target.value)}
                  style={{ marginBottom: 8 }}
                >
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
                <Text strong>Approver's Comment (Optional):</Text>
                <TextArea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Reason for rejection or additional notes..."
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
                  style={{
                    background: "#52c41a",
                    borderColor: "#52c41a",
                    height: 50,
                    fontSize: 18,
                  }}
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
                {report.signers && report.signers.length > 0 ? (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {report.signers.map((s: NongyneReportSigner, idx: number) => (
                      <Space key={idx}>
                        <UserOutlined />
                        <Text type="secondary">
                          {s.role === "cytotechnologist"
                            ? "Cytotechnologist"
                            : "Pathologist"}
                          : {s.report_name || s.full_name}
                        </Text>
                      </Space>
                    ))}
                  </Space>
                ) : (
                  <Space>
                    <UserOutlined />
                    <Text type="secondary">
                      Pathologist: {report.pathologist_name}
                    </Text>
                  </Space>
                )}
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default NongyneApprovalDetailPage;
