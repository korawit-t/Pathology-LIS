import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Typography,
  Modal,
  message,
} from "antd";

const { Title } = Typography;
import {
  PlayCircleOutlined,
  EyeOutlined,
  HistoryOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalStainRunService from "../../../services/surgicalStainRunService";
import { StainingRunResponse, StainRequest } from "../../../types/stains";
import { ColumnsType } from "antd/es/table";
import PageContainer from "../../../components/Layout/PageContainer";

interface Props {
  onCreateClick: () => void;
  onSelectRun: (id: number) => void;
}

const StainingRunList: React.FC<Props> = ({ onCreateClick, onSelectRun }) => {
  const [runs, setRuns] = useState<StainingRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await SurgicalStainRunService.getAllRuns();
      setRuns(data);
    } catch {
      message.error("Failed to load run history.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: "Delete this staining run?",
      content: "All slides inside will be reset to pending status.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await SurgicalStainRunService.deleteRun(id);
          message.success("Run deleted successfully.");
          loadHistory();
        } catch {
          message.error("Failed to delete run.");
        }
      },
    });
  };

  const columns: ColumnsType<StainingRunResponse> = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      render: (t) => (
        <Tag color="orange" style={{ fontWeight: "bold" }}>
          {t}
        </Tag>
      ),
    },
    {
      title: "Operator",
      key: "operator",
      render: (_, record) =>
        record.operator?.full_name || record.operator?.username || `ID: ${record.operator_id}`,
    },
    {
      title: "Started At",
      dataIndex: "started_at",
      render: (d) => dayjs(d).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Completed At",
      dataIndex: "completed_at",
      render: (d) => (d ? dayjs(d).format("DD/MM/YYYY HH:mm") : "—"),
    },
    {
      title: "Slides",
      dataIndex: "details",
      align: "center",
      render: (details: StainRequest[]) => (
        <Badge count={details?.length || 0} showZero color="blue" />
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) =>
        record.completed_at ? (
          <Tag color="success">Completed</Tag>
        ) : (
          <Tag color="processing">In Progress</Tag>
        ),
    },
    {
      title: "Action",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onSelectRun(record.id)}
          >
            View
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <HistoryOutlined style={{ marginRight: 12, color: "#595959" }} />
          Internal Staining Runs
        </Title>
      }
      subTitle={
        <Space size={16} style={{ marginTop: 2 }}>
          <Tag color="blue" style={{ fontWeight: 500 }}>Internal</Tag>
          <Space size={4}>
            <ClockCircleOutlined style={{ color: "#faad14" }} />
            <Typography.Text type="secondary">
              In Progress: <strong>{runs.filter((r) => !r.completed_at).length}</strong>
            </Typography.Text>
          </Space>
          <Space size={4}>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Typography.Text type="secondary">
              Completed: <strong>{runs.filter((r) => !!r.completed_at).length}</strong>
            </Typography.Text>
          </Space>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={onCreateClick}
          >
            New Staining Run
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={runs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        onRow={(record) => ({
          onClick: () => onSelectRun(record.id),
          style: { cursor: "pointer" },
        })}
      />
    </PageContainer>
  );
};

export default StainingRunList;
