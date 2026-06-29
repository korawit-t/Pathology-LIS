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
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import { useApproval } from "./hooks/useApproval";
import dayjs from "dayjs";
import logger from "../../utils/logger";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface GyneReportSigner {
  role?: string;
  report_name?: string;
  full_name?: string;
}

interface GyneReport {
  id: number;
  status?: string;
  accession_no?: string;
  version_no?: number;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  patient_gender?: string;
  patient_age?: string;
  pathologist_name?: string;
  adequacy_text?: string;
  category_1_text?: string;
  category_2_text?: string;
  signers?: GyneReportSigner[];
  [key: string]: unknown;
}

interface GyneApprovalDetailPageProps {
  reportId?: number | null;
  onBack?: () => void;
}

const GyneApprovalDetailPage: React.FC<GyneApprovalDetailPageProps> = ({
  reportId,
  onBack,
}) => {
  const [report, setReport] = useState<GyneReport | null>(null);
  const [comment, setComment] = useState("");
  const [agreement, setAgreement] = useState<'agree' | 'disagree'>('agree');
  const [agreementNote, setAgreementNote] = useState('');
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
      // 1. Try to find if this is a Case ID and get the pending report from it
      // Because PendingApprovalList usually passes Case ID for Gyne
      let targetReportId = id;
      let data: GyneReport | null = null;

      try {
        const reports = await GyneDiagnosisService.getReportsByCase(id) as unknown as GyneReport[];
        const pendingReport = reports.find((r) => r.status === "pending_approval" || r.status === "draft");
        if (pendingReport) {
          targetReportId = pendingReport.id;
          data = pendingReport;
        } else if (reports.length > 0) {
            // Fallback to latest
            targetReportId = reports[0].id;
            data = reports[0];
        } else {
             // Maybe it IS a report ID?
             data = await GyneDiagnosisService.getReportById(id) as unknown as GyneReport;
             targetReportId = id;
        }
      } catch (e) {
         // If getReportsByCase fails, maybe it's a report ID
         try {
            data = await GyneDiagnosisService.getReportById(id) as unknown as GyneReport;
            targetReportId = id;
         } catch (e2) {
            logger.error("Not a valid Case ID or Report ID");
         }
      }

      if (data) {
        setReport(data);
        // Fetch PDF Blob for preview using the correct Report ID
        const blob = await GyneDiagnosisService.getReportPdf(targetReportId);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        // Handle not found
        logger.error("No report found");
      }

    } catch (error) {
      logger.error("Load gyne report or PDF failed:", error);
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

  const handleAction = async (
    action: "APPROVED" | "REJECTED" | "REQUEST_CHANGES",
  ) => {
    if (!report) return;

    await processApproval(report.id, { 
      action, 
      comment,
      agreement,
      agreement_note: agreement === 'disagree' ? agreementNote : undefined
    }, "gyne", () => {
      if (onBack) onBack();
    });
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
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space direction="vertical" size={0}>
          <Button type="link" icon={<RollbackOutlined />} onClick={onBack} style={{ padding: 0 }}>
            Back to Pending List
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Review Gyne Report: <Text color="purple">{report.accession_no}</Text>
          </Title>
        </Space>

        <Space>
          <Tag color="purple" icon={<HistoryOutlined />}>
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
                title="Gyne Report Preview"
              />
            ) : (
              <div style={{ height: 800, display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5" }}>
                <Skeleton active />
              </div>
            )}
          </Card>

          <Card bordered={false} className="standard-table-card" style={{ marginTop: 24 }} title="Data Summary">
            <Descriptions bordered size="small" column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
              <Descriptions.Item label="Accession No."><Text strong>{report.accession_no}</Text></Descriptions.Item>
              <Descriptions.Item label="Patient Name">{[report.patient_title, report.patient_name, report.patient_ln].filter(Boolean).join(" ")}</Descriptions.Item>
              <Descriptions.Item label="HN">{report.patient_hn || "-"}</Descriptions.Item>
              <Descriptions.Item label="Gender/Age">{`${report.patient_gender || "-"} / ${report.patient_age || "-"}`}</Descriptions.Item>
            </Descriptions>

            <Divider>Bethesda Findings</Divider>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Adequacy">{report.adequacy_text || "-"}</Descriptions.Item>
              <Descriptions.Item label="Category">
                <Space direction="vertical">
                    {report.category_1_text && <Tag color="blue">{report.category_1_text}</Tag>}
                    {report.category_2_text && <Tag color="magenta">{report.category_2_text}</Tag>}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <div style={{ position: "sticky", top: 20 }}>
            <Card title={<><CheckCircleOutlined /> Approval Decision</>} bordered={false} className="standard-table-card">
              <Alert
                message="Review Instruction"
                description="Please verify the report layout and content before releasing."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Agreement with previous signer:</Text>
                <Radio.Group 
                  value={agreement} 
                  onChange={(e) => setAgreement(e.target.value)}
                  style={{ marginBottom: 8 }}
                >
                  <Radio value="agree">Agree</Radio>
                  <Radio value="disagree">Disagree</Radio>
                </Radio.Group>
                
                {agreement === 'disagree' && (
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
                {report.signers && report.signers.length > 0 ? (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {report.signers.map((s: GyneReportSigner, idx: number) => {
                      const getRoleDisplay = (role: string) => {
                        switch (role) {
                          case "pathologist":
                            return "Pathologist";
                          case "cytotechnologist":
                            return "Cytotechnologist";
                          case "co-sign pathologist":
                          case "co_sign_pathologist":
                            return "Co-sign Pathologist";
                          case "co-sign cytotechnologist":
                          case "co_sign_cytotechnologist":
                            return "Co-sign Cytotechnologist";
                          case "co-signer":
                            return "Co-Signer";
                          default:
                            return "Signer";
                        }
                      };

                      return (
                        <Space key={idx}>
                          <UserOutlined />
                          <Text type="secondary">
                            {getRoleDisplay(s.role)}: {s.report_name || s.full_name}
                          </Text>
                        </Space>
                      );
                    })}
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

export default GyneApprovalDetailPage;
