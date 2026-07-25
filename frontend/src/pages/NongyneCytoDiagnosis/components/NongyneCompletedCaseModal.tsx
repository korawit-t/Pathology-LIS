import React from "react";
import { Modal, Row, Col, Typography, Tag, Button, Table, Spin } from "antd";
import { CheckCircleOutlined, FileAddOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { NongyneCytologyCase } from "../../../types/nongyne";
import type { NongyneDiagnosisResponse } from "../../../types/nongyneDiagnosis";

interface NongyneCompletedCaseModalProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onAddNewReport: () => void;
  caseData: NongyneCytologyCase | null;
  completedReports: NongyneDiagnosisResponse[];
  completedReportsLoading: boolean;
  selectedReportId: number | null;
  onSelectReport: (id: number) => void;
  pdfUrl: string | null;
  pdfLoading: boolean;
}

/** "Case already signed off" popup for the Nongyne pathologist page.
 * Structurally similar to Gyne's GyneCompletedCaseModal but not merged with
 * it — the two evolved real differences (button label/styling, a
 * PROVISIONAL tag Gyne cases don't have, an extra case-level hn fallback,
 * different table column labels) that would over-parameterize a shared
 * component for little benefit. */
const NongyneCompletedCaseModal: React.FC<NongyneCompletedCaseModalProps> = ({
  open,
  onClose,
  onBack,
  onAddNewReport,
  caseData,
  completedReports,
  completedReportsLoading,
  selectedReportId,
  onSelectReport,
  pdfUrl,
  pdfLoading,
}) => (
  <Modal
    open={open}
    onCancel={onClose}
    footer={null}
    width={1100}
    centered
    closable
    style={{ top: 20 }}
  >
    <Row gutter={24}>
      <Col
        span={9}
        style={{
          borderRight: "1px solid #f0f0f0",
          paddingRight: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "#f6ffed",
            border: "1px solid #b7eb8f",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Typography.Text strong style={{ fontSize: 15 }}>
              {caseData?.accession_no}
            </Typography.Text>
            <Tag color="green" style={{ margin: 0 }}>
              SIGNED
            </Tag>
            {caseData?.is_pending && (
              <Tag color="orange" style={{ margin: 0 }}>
                PROVISIONAL
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {[
              caseData?.patient?.title?.title,
              caseData?.patient?.name,
              caseData?.patient?.ln,
            ]
              .filter(Boolean)
              .join(" ") || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
            HN: {caseData?.patient?.hn || caseData?.hn || "—"}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <CheckCircleOutlined
            style={{ fontSize: 36, color: "#52c41a", marginBottom: 6 }}
          />
          <Typography.Title level={5} style={{ margin: "0 0 4px" }}>
            Case Already Signed Off
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            You are in view-only mode.
          </Typography.Text>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <Button onClick={onBack}>Go Back</Button>
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              style={{ background: "#fa8c16", borderColor: "#fa8c16" }}
              onClick={onAddNewReport}
            >
              Add New Report
            </Button>
          </div>
        </div>
        <Table
          size="small"
          loading={completedReportsLoading}
          dataSource={completedReports}
          rowKey="id"
          pagination={false}
          scroll={{ y: 300 }}
          onRow={(record) => ({
            onClick: () => onSelectReport(record.id),
            style: {
              cursor: "pointer",
              background:
                selectedReportId === record.id ? "#e6f4ff" : undefined,
            },
          })}
          columns={[
            {
              title: "Round",
              key: "round",
              width: 60,
              render: (_, __, idx) => `#${idx + 1}`,
            },
            {
              title: "Status",
              dataIndex: "status",
              key: "status",
              width: 100,
              render: (s: string) => (
                <Tag
                  color={
                    s === "published"
                      ? "green"
                      : s === "pending_approval"
                        ? "orange"
                        : "default"
                  }
                  style={{ margin: 0 }}
                >
                  {s?.replace("_", " ").toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Published",
              dataIndex: "created_at",
              key: "created_at",
              render: (d: string) =>
                d ? dayjs(d).format("DD/MM/YY HH:mm") : "—",
            },
          ]}
        />
      </Col>
      <Col span={15}>
        <div
          style={{
            height: "70vh",
            background: "#f5f5f5",
            borderRadius: 8,
            border: "1px solid #d9d9d9",
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {pdfLoading ? (
            <Spin tip="Loading PDF..." size="large" />
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              width="100%"
              height="100%"
              style={{ border: "none" }}
              title="Report PDF"
            />
          ) : (
            <div style={{ textAlign: "center", color: "#999" }}>
              <FilePdfOutlined style={{ fontSize: 48, marginBottom: 8 }} />
              <p>Select a report to preview</p>
            </div>
          )}
        </div>
      </Col>
    </Row>
  </Modal>
);

export default NongyneCompletedCaseModal;
