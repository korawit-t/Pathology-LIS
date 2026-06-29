import React, { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Tooltip,
  Badge,
  Popconfirm,
} from "antd";
import {
  ExperimentOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  SendOutlined,
  SyncOutlined,
  CheckSquareOutlined,
} from "@ant-design/icons";
import api from "../../../services/httpClient";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";

const { Text } = Typography;

type StainStatus = "pending" | "sent" | "stained" | "completed";

interface AdditionalStain {
  stain_id: number;
  block_code: string;
  test_name: string;
  category: string;
  status: StainStatus;
  is_external: boolean;
}

interface CaseGroup {
  case_id: number;
  accession_no: string;
  patient_name: string;
  patient_ln?: string;
  case_status: string;
  stains: AdditionalStain[];
}

interface Props {
  onSelectCase: (id: number) => void;
  pathologistId?: number;
}

const STATUS_CONFIG: Record<
  StainStatus,
  { label: string; color: string; icon: React.ReactNode; tagColor: string }
> = {
  pending: {
    label: "Pending",
    color: "#8c8c8c",
    tagColor: "default",
    icon: <ClockCircleOutlined />,
  },
  sent: {
    label: "Sent to Outlab",
    color: "#fa8c16",
    tagColor: "warning",
    icon: <SendOutlined />,
  },
  stained: {
    label: "Stained / Awaiting Review",
    color: "#52c41a",
    tagColor: "success",
    icon: <SyncOutlined />,
  },
  completed: {
    label: "Reviewed",
    color: "#13c2c2",
    tagColor: "cyan",
    icon: <CheckCircleFilled />,
  },
};

const CATEGORY_COLOR: Record<string, string> = {
  IHC: "blue",
  Histochem: "orange",
  FISH: "geekblue",
  Molecular: "purple",
  "Special stain": "volcano",
};

const StatusSummaryRow: React.FC<{ stains: AdditionalStain[] }> = ({ stains }) => {
  const counts: Partial<Record<StainStatus, number>> = {};
  stains.forEach((s) => {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  });
  const order: StainStatus[] = ["pending", "sent", "stained", "completed"];
  const allStained =
    stains.length > 0 &&
    stains.every((s) => s.status === "stained" || s.status === "completed");
  return (
    <Space size={4} wrap>
      {allStained && (
        <Tag color="success" icon={<CheckCircleFilled />}>
          ย้อมครบแล้ว
        </Tag>
      )}
      {order
        .filter((st) => counts[st])
        .map((st) => {
          const cfg = STATUS_CONFIG[st];
          return (
            <Tag key={st} color={cfg.tagColor} icon={cfg.icon}>
              {cfg.label} ({counts[st]})
            </Tag>
          );
        })}
    </Space>
  );
};

const StainTag: React.FC<{ stain: AdditionalStain }> = ({ stain }) => {
  const statusCfg = STATUS_CONFIG[stain.status] ?? STATUS_CONFIG.pending;
  const catColor = CATEGORY_COLOR[stain.category] ?? "#8c8c8c";
  return (
    <Tooltip
      title={
        <span>
          {stain.block_code} — {stain.category}
          {stain.is_external ? " • Outlab" : ""}
          {" • "}
          {statusCfg.label}
        </span>
      }
    >
      <Tag
        color={statusCfg.tagColor}
        style={{ marginBottom: 2, paddingLeft: 6 }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: catColor,
            marginRight: 5,
            verticalAlign: "middle",
          }}
        />
        <span style={{ marginRight: 4 }}>{statusCfg.icon}</span>
        {stain.block_code} — {stain.test_name}
      </Tag>
    </Tooltip>
  );
};

const MyReadyStains: React.FC<Props> = ({ onSelectCase, pathologistId }) => {
  const [data, setData] = useState<CaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewingIds, setReviewingIds] = useState<Set<number>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/surgical-block-stains/ready-additional", {
        params: pathologistId ? { pathologist_id: pathologistId } : undefined,
      });
      setData(res.data);
    } catch {
      message.error("Failed to load stain list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkReviewed = async (record: CaseGroup) => {
    const stainedIds = record.stains
      .filter((s) => s.status === "stained")
      .map((s) => s.stain_id);

    if (stainedIds.length === 0) return;

    setReviewingIds((prev) => new Set([...prev, record.case_id]));
    try {
      await Promise.all(
        stainedIds.map((id) =>
          SurgicalBlockStainService.updateStain(id, { status: "completed" })
        )
      );
      message.success(
        `${stainedIds.length} stain${stainedIds.length > 1 ? "s" : ""} marked as reviewed`
      );
      fetchData();
    } catch {
      message.error("Failed to update stain status");
    } finally {
      setReviewingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.case_id);
        return next;
      });
    }
  };

  const totalByStatus: Partial<Record<StainStatus, number>> = {};
  data.forEach((c) =>
    c.stains.forEach((s) => {
      totalByStatus[s.status] = (totalByStatus[s.status] ?? 0) + 1;
    })
  );

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 160,
      render: (text: string) => (
        <Text strong style={{ color: "#1890ff", fontSize: 14 }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Patient",
      key: "patient_name",
      width: 180,
      render: (_: unknown, record: CaseGroup) =>
        [record.patient_name, record.patient_ln].filter(Boolean).join(" ") || "-",
    },
    {
      title: "Status Summary",
      key: "summary",
      width: 320,
      render: (_: unknown, record: CaseGroup) => (
        <StatusSummaryRow stains={record.stains} />
      ),
    },
    {
      title: "Stains",
      key: "stains",
      render: (_: unknown, record: CaseGroup) => (
        <Space wrap size={4}>
          {record.stains.map((s) => (
            <StainTag key={s.stain_id} stain={s} />
          ))}
        </Space>
      ),
    },
    {
      title: "",
      key: "action",
      width: 200,
      render: (_: unknown, record: CaseGroup) => {
        const stainedCount = record.stains.filter((s) => s.status === "stained").length;
        const isReviewing = reviewingIds.has(record.case_id);

        return (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Button
              type="primary"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => onSelectCase(record.case_id)}
              block
            >
              Open Case
            </Button>
            {stainedCount > 0 && (
              <Popconfirm
                title={`Mark ${stainedCount} stain${stainedCount > 1 ? "s" : ""} as reviewed?`}
                description="This confirms you have reviewed the stain results."
                onConfirm={() => handleMarkReviewed(record)}
                okText="Confirm"
                cancelText="Cancel"
                okButtonProps={{ type: "primary" }}
              >
                <Button
                  size="small"
                  icon={<CheckSquareOutlined />}
                  loading={isReviewing}
                  style={{ color: "#52c41a", borderColor: "#52c41a" }}
                  block
                >
                  Mark Reviewed ({stainedCount})
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
        }}
      >
        <Space size={12} wrap>
          <ExperimentOutlined style={{ color: "#722ed1" }} />
          {(["pending", "sent", "stained", "completed"] as StainStatus[]).map((st) => {
            const cfg = STATUS_CONFIG[st];
            const cnt = totalByStatus[st] ?? 0;
            return (
              <Space key={st} size={4}>
                <Badge
                  count={cnt}
                  showZero
                  style={{ backgroundColor: cnt > 0 ? cfg.color : "#d9d9d9" }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {cfg.label}
                </Text>
              </Space>
            );
          })}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refresh
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="case_id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: "No IHC / Special Stain orders found" }}
      />
    </>
  );
};

export default MyReadyStains;
