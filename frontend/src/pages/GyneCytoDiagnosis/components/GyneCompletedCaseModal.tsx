import React from "react";
import { Modal, Row, Col, Typography, Tag, Button, Table, Spin } from "antd";
import { CheckCircleOutlined, FileAddOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";

export interface CompletedReportSummary {
  id: number;
  status: string;
  created_at: string;
}

interface GyneCompletedCaseModalProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onReviseReport: () => void;
  caseData: GyneCytologyCase | null;
  completedReports: CompletedReportSummary[];
  completedReportsLoading: boolean;
  selectedReportId: number | null;
  onSelectReport: (id: number) => void;
  pdfUrl: string | null;
  pdfLoading: boolean;
}

/** "Case already signed off" popup shared by both the Pathologist and
 * cytotechnologist Gyne diagnosis pages — identical in both, so it lives
 * here once instead of being copy-pasted. */
const GyneCompletedCaseModal: React.FC<GyneCompletedCaseModalProps> = ({
  open,
  onClose,
  onBack,
  onReviseReport,
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: 15 }}>
              {caseData?.accession_no}
            </Typography.Text>
            <Tag color="green" style={{ margin: 0 }}>SIGNED</Tag>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {[caseData?.patient?.title?.title, caseData?.patient?.name, caseData?.patient?.ln]
              .filter(Boolean).join(" ") || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
            HN: {caseData?.patient?.hn || "—"}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <CheckCircleOutlined style={{ fontSize: 36, color: "#52c41a", marginBottom: 6 }} />
          <Typography.Title level={5} style={{ margin: "0 0 4px" }}>
            Case Already Signed Off
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            You are in view-only mode.
          </Typography.Text>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
            <Button onClick={onBack}>Go Back</Button>
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              danger
              onClick={onReviseReport}
            >
              Revise Report
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
              background: selectedReportId === record.id ? "#e6f4ff" : undefined,
            },
          })}
          columns={[
            {
              title: "Ver.",
              dataIndex: "version_no",
              width: 50,
              render: (_, __, idx) => `#${idx + 1}`,
            },
            {
              title: "Status",
              dataIndex: "status",
              width: 100,
              render: (s: string) => (
                <Tag
                  color={s === "published" ? "green" : s === "pending_approval" ? "orange" : "default"}
                  style={{ margin: 0 }}
                >
                  {s?.replace("_", " ").toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Date",
              dataIndex: "created_at",
              render: (d: string) => d ? dayjs(d).format("DD/MM/YY HH:mm") : "—",
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
            <iframe src={pdfUrl} width="100%" height="100%" style={{ border: "none" }} title="Report PDF" />
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

export default GyneCompletedCaseModal;
