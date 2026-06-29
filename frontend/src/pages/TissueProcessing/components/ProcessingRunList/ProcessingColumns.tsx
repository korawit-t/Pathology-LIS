import React from "react";
import { Tag, Button, Space, Typography } from "antd";
import {
  CheckCircleOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { ColumnsType } from "antd/es/table";
import { TissueProcessingRun } from "../../../../types/tissueProcessing";
import dayjs from "dayjs";

const { Text } = Typography;

interface ColumnProps {
  onShowDetails: (record: TissueProcessingRun) => void;
  onComplete: (id: number) => void;
  onEdit: (record: TissueProcessingRun) => void;
}

export const getProcessingColumns = ({
  onShowDetails,
  onComplete,
  onEdit,
}: ColumnProps): ColumnsType<TissueProcessingRun> => [
  {
    title: "Run Number",
    dataIndex: "run_number",
    key: "run_number",
    render: (text: string) => <b>{text}</b>,
  },
  {
    title: "Date",
    key: "date",
    width: 160,
    sorter: (a, b) => dayjs(a.start_at).unix() - dayjs(b.start_at).unix(),
    defaultSortOrder: "descend" as const,
    render: (_, record) => (
      <Space direction="vertical" size={0}>
        <Text style={{ fontSize: 13 }}>{dayjs(record.start_at).format("DD/MM/YYYY HH:mm")}</Text>
        {record.completed_at && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Done: {dayjs(record.completed_at).format("DD/MM HH:mm")}
          </Text>
        )}
      </Space>
    ),
  },
  {
    title: "Processor / Program",
    render: (_, record) => (
      <div>
        <div>{record.processor_name}</div>
        <Text type="secondary" style={{ fontSize: "12px" }}>
          {record.program_name}
        </Text>
      </div>
    ),
  },
  {
    title: "In / Out Blocks",
    render: (_, record) => (
      <Space direction="vertical" size={0}>
        <Tag color="blue">
          In: {record.block_in_total || record.items?.length || 0}
        </Tag>
        {record.status === "completed" && (
          <Tag color="cyan">Out: {record.block_out_total || 0}</Tag>
        )}
      </Space>
    ),
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    render: (status: string) => {
      const isCompleted = status === "completed";
      return (
        <Tag
          icon={
            isCompleted ? <CheckCircleOutlined /> : <PlayCircleOutlined spin />
          }
          color={isCompleted ? "success" : "processing"}
        >
          {status.toUpperCase()}
        </Tag>
      );
    },
  },
  {
    title: "Action",
    key: "action",
    render: (_, record) => (
      <Space onClick={(e) => e.stopPropagation()}>
        <Button
          icon={<EyeOutlined />}
          onClick={(e) => { e.stopPropagation(); onShowDetails(record); }}
        >
          Details
        </Button>
        <Button
          icon={<EditOutlined />}
          onClick={(e) => { e.stopPropagation(); onEdit(record); }}
        >
          Edit
        </Button>
        {record.status === "processing" && (
          <Button
            type="primary"
            onClick={(e) => { e.stopPropagation(); onComplete(record.id); }}
          >
            Complete
          </Button>
        )}
      </Space>
    ),
  },
];
