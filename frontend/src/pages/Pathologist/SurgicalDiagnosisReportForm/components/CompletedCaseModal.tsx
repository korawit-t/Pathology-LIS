import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalReportService from "../../../../services/surgicalReportService";
import { usePdfBlobUrl } from "../../../../hooks/usePdfBlobUrl";
import type { SurgicalCase } from "../../../../types/surgical";
import type { SurgicalReport } from "../../../../types/surgicalReport";

interface CompletedCaseModalProps {
  open: boolean;
  onClose: () => void;
  surgicalCase: SurgicalCase | null;
  /** Report history, fetched by the parent (shared with the Entry History drawer) */
  reports: SurgicalReport[];
  reportsLoading: boolean;
  /** Leave the report form entirely */
  onBack: () => void;
  /** Switch the form into addendum mode and close this popup */
  onAddendum: () => void;
  /** Ask the parent to refetch the report history after a delete */
  onReportsChanged: () => void;
}

const CompletedCaseModal: React.FC<CompletedCaseModalProps> = ({
  open,
  onClose,
  surgicalCase,
  reports,
  reportsLoading,
  onBack,
  onAddendum,
  onReportsChanged,
}) => {
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);

  // Default the preview to the newest published version whenever history arrives
  useEffect(() => {
    const published = reports.filter((r) => r.status === "published");
    const latest = published.reduce<SurgicalReport | null>(
      (best, r) => (!best || r.version_no > best.version_no ? r : best),
      null,
    );
    if (latest) setSelectedReportId(latest.id);
  }, [reports]);

  useEffect(() => {
    if (!open) setSelectedReportId(null);
  }, [open]);

  const fetchFn = useMemo(() => {
    if (!(open && selectedReportId)) return null;
    return () => SurgicalReportService.getReportPdf(selectedReportId);
  }, [open, selectedReportId]);
  const onError = useCallback(() => message.error("Failed to load PDF preview"), []);
  const { url: pdfUrl, loading: pdfLoading } = usePdfBlobUrl(fetchFn, { onError });

  const handleDeleteDraftReport = (reportId: number) => {
    Modal.confirm({
      title: "Delete Draft Report",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "This draft report will be permanently deleted. Continue?",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setDeletingReportId(reportId);
        try {
          await SurgicalReportService.deleteReport(reportId);
          message.success("Draft report deleted");
          if (selectedReportId === reportId) setSelectedReportId(null);
          onReportsChanged();
        } catch {
          message.error("Failed to delete draft report");
        } finally {
          setDeletingReportId(null);
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1300}
      centered
      closable
      style={{ top: 20 }}
    >
      <Row gutter={24}>
        <Col span={10} style={{ borderRight: "1px solid #f0f0f0", paddingRight: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Patient / case header */}
          <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <Typography.Text strong style={{ fontSize: 15 }}>
                {surgicalCase?.accession_no}
              </Typography.Text>
              <Tag color="green" style={{ margin: 0 }}>SIGNED</Tag>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {[surgicalCase?.patient?.title?.title, surgicalCase?.patient?.name, surgicalCase?.patient?.ln]
                .filter(Boolean).join(" ") || "—"}
            </div>
            <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
              HN: {surgicalCase?.patient?.hn || surgicalCase?.hn || "—"}
            </div>
          </div>

          {surgicalCase?.is_out_lab_consult && surgicalCase?.consult_status === "pending" && (
            <Alert
              type="warning"
              showIcon
              message="Pending Out-Lab Consult Dispatch"
              description="This case was flagged for Out-Lab Consult but hasn't been sent to an external lab yet. Go to Out-Lab Consult → Send to Consult to dispatch it."
            />
          )}

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
                onClick={onAddendum}
              >
                Add New Report
              </Button>
            </div>
          </div>

          <Table<SurgicalReport>
            size="small"
            loading={reportsLoading}
            dataSource={reports}
            rowKey="id"
            pagination={false}
            scroll={{ y: 300 }}
            onRow={(record) => ({
              onClick: () => setSelectedReportId(record.id),
              style: {
                cursor: "pointer",
                background: record.id === selectedReportId ? "#e6f4ff" : undefined,
              },
            })}
            columns={[
              {
                title: "Ver.",
                dataIndex: "version_no",
                width: 42,
                render: (v: number) => <Typography.Text strong>v{v}</Typography.Text>,
              },
              {
                title: "Type",
                dataIndex: "report_type",
                width: 82,
                render: (t: string) => (
                  <Tag color={t === "Final" ? "blue" : t === "Addendum" ? "orange" : "purple"} style={{ margin: 0 }}>
                    {t}
                  </Tag>
                ),
              },
              {
                title: "Status",
                dataIndex: "status",
                width: 90,
                render: (s: string) => (
                  <Tag
                    color={s === "published" ? "green" : s === "pending_approval" ? "orange" : "default"}
                    style={{ margin: 0 }}
                  >
                    {s?.replace(/_/g, " ").toUpperCase()}
                  </Tag>
                ),
              },
              {
                title: "Pathologist",
                dataIndex: "pathologist_name",
                ellipsis: true,
                render: (name: string) => (
                  <Typography.Text style={{ fontSize: 12 }}>{name || "—"}</Typography.Text>
                ),
              },
              {
                title: "Date",
                dataIndex: "published_at",
                width: 90,
                render: (v: string, record) =>
                  (v || record.created_at)
                    ? dayjs(v || record.created_at).format("DD/MM/YY HH:mm")
                    : "-",
              },
              {
                title: "",
                key: "actions",
                width: 64,
                render: (_: unknown, record) =>
                  record.status === "draft" ? (
                    <Space size={4}>
                      <Tooltip title="Continue Editing">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddendum();
                          }}
                        />
                      </Tooltip>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        loading={deletingReportId === record.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraftReport(record.id);
                        }}
                      />
                    </Space>
                  ) : null,
              },
            ]}
          />
        </Col>
        <Col span={14}>
          <div
            style={{
              height: "70vh",
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
              <Spin tip="Loading Report..." size="large" />
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="Signed Report Preview"
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
  );
};

export default CompletedCaseModal;
