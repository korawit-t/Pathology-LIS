import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  Table,
  Space,
  Tag,
  Badge,
  Typography,
  Spin,
  Descriptions,
  message,
  Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalStainRunService from "../../../services/surgicalStainRunService";
import { StainingRunDetailResponse } from "../../../types/stains";
import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

interface Props {
  runId: number;
  onBack: () => void;
}

const CAT_COLOR: Record<string, string> = {
  IHC: "purple",
  Histochem: "cyan",
  ROUTINE: "geekblue",
};

const STATUS_TAG_COLOR: Record<string, string> = {
  pending: "warning",
  stained: "success",
  completed: "processing",
  cancelled: "error",
};

type DetailRow = StainingRunDetailResponse["run_info"]["details"][number];

const StainingRunDetails: React.FC<Props> = ({ runId, onBack }) => {
  const [detail, setDetail] = useState<StainingRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const data = await SurgicalStainRunService.getRunDetail(runId);
      setDetail(data);
    } catch {
      message.error("Failed to load run details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [runId]);

  const handleUpdateStatus = async (
    status: "in_progress" | "completed" | "cancelled"
  ) => {
    setSubmitting(true);
    try {
      await SurgicalStainRunService.updateRunStatus(runId, status);
      message.success(`Run marked as ${status}.`);
      fetchDetail();
    } catch {
      message.error("Failed to update run status.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" tip="Loading..." />
      </div>
    );

  if (!detail) return null;

  const { run_info } = detail;
  const isCompleted = !!run_info.completed_at;
  const slides = run_info.details || [];
  const pendingCount = slides.filter(
    (d) => d.stain_order.status === "pending"
  ).length;
  const doneCount = slides.length - pendingCount;

  const columns: ColumnsType<DetailRow> = [
    {
      title: "#",
      key: "index",
      width: 48,
      render: (_, __, idx) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {idx + 1}
        </Text>
      ),
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Slide</span>,
      key: "slide_no",
      width: 62,
      render: (_, r) => <Text style={{ fontSize: 13 }}>#{r.stain_order.slide_no}</Text>,
    },
    {
      title: "Accession No.",
      key: "accession_no",
      render: (_, r) => {
        const accNo = r.stain_order.block?.specimen?.case?.accession_no;
        return (
          <Text strong style={{ fontSize: 13 }}>
            {accNo || "—"}
          </Text>
        );
      },
    },
    {
      title: "Block",
      key: "block_no",
      width: 80,
      render: (_, r) => {
        const blk = r.stain_order.block;
        const label = blk
          ? `${blk.specimen_label ?? ""}${blk.block_no ?? ""}`
          : "—";
        return (
          <Tag color="blue" style={{ fontWeight: 600 }}>
            {label}
          </Tag>
        );
      },
    },
    {
      title: "Test Name",
      key: "test_name",
      render: (_, r) => (
        <Text style={{ fontSize: 13 }}>
          {r.stain_order.test?.name || r.stain_order.test_name || "—"}
        </Text>
      ),
    },
    {
      title: "Category",
      key: "category",
      width: 100,
      render: (_, r) => {
        const cat =
          r.stain_order.test?.category ||
          r.stain_order.category ||
          "—";
        return (
          <Tag color={CAT_COLOR[cat] || "default"} style={{ fontSize: 12 }}>
            {cat}
          </Tag>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      width: 90,
      render: (_, r) => (
        <Tag
          color={STATUS_TAG_COLOR[r.stain_order.status] || "default"}
          style={{ fontSize: 12 }}
        >
          {r.stain_order.status}
        </Tag>
      ),
    },
    {
      title: "Printed",
      key: "is_printed",
      width: 70,
      align: "center",
      render: (_, r) =>
        r.stain_order.is_printed ? (
          <PrinterOutlined style={{ color: "#1890ff", fontSize: 15 }} />
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <div>
      {/* ── Sticky Toolbar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #f0f0f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          padding: "10px 24px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space size="large">
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={onBack}
            />
            <Space size={8}>
              <Text strong style={{ fontSize: 16 }}>
                {run_info.run_no}
              </Text>
              {isCompleted ? (
                <Tag color="success">Completed</Tag>
              ) : (
                <Tag color="processing">In Progress</Tag>
              )}
            </Space>
          </Space>

          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchDetail}
              loading={loading}
            >
              Refresh
            </Button>

            {!isCompleted && (
              <>
                <Popconfirm
                  title="Cancel this staining run?"
                  description="All slides will be reset to pending status."
                  okText="Cancel Run"
                  okButtonProps={{ danger: true }}
                  cancelText="Go Back"
                  onConfirm={() => handleUpdateStatus("cancelled")}
                >
                  <Button
                    danger
                    loading={submitting}
                    icon={<CloseCircleOutlined />}
                  >
                    Cancel Run
                  </Button>
                </Popconfirm>

                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={submitting}
                  onClick={() => handleUpdateStatus("completed")}
                  style={{ background: "#52c41a", border: "none" }}
                >
                  Complete Run
                </Button>
              </>
            )}
          </Space>
        </div>
      </div>

      <div style={{ padding: "0 24px 32px" }}>
        {/* ── Run Info Card ── */}
        <Card
          style={{
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            marginBottom: 16,
          }}
        >
          <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
            <Descriptions.Item label="Operator">
              <Text strong>
                {run_info.operator?.full_name ?? `ID: ${run_info.operator_id}`}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Stainer ID">
              {run_info.stainer_id || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Started At">
              {dayjs(run_info.started_at).format("DD/MM/YYYY HH:mm")}
            </Descriptions.Item>
            <Descriptions.Item label="Completed At">
              {run_info.completed_at
                ? dayjs(run_info.completed_at).format("DD/MM/YYYY HH:mm")
                : "—"}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 12, display: "flex", gap: 20 }}>
            <Space size={6}>
              <Badge count={slides.length} color="#1890ff" showZero />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Total Slides
              </Text>
            </Space>
            <Space size={6}>
              <Badge count={pendingCount} color="#faad14" showZero />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Pending
              </Text>
            </Space>
            <Space size={6}>
              <Badge count={doneCount} color="#52c41a" showZero />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Done
              </Text>
            </Space>
          </div>
        </Card>

        {/* ── Slides Table ── */}
        <Card
          style={{
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <Table
            dataSource={slides}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={slides.length > 50 ? { pageSize: 50 } : false}
          />
        </Card>
      </div>
    </div>
  );
};

export default StainingRunDetails;
