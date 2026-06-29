import React from "react";
import { Button, Space, Tag, Badge, Typography } from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { SectioningRunResponse } from "../../../../types/sectioning";
import dayjs from "dayjs";

const { Text } = Typography;

interface ColumnProps {
  onSelectRun: (run: SectioningRunResponse) => void;
  onDelete: (run: SectioningRunResponse) => void;
}

// 🌟 สร้าง Function ที่ส่งคืน Columns
export const getSectioningColumns = ({
  onSelectRun,
  onDelete,
}: ColumnProps): ColumnsType<SectioningRunResponse> => [
  {
    title: "Run Number",
    dataIndex: "run_no",
    render: (t: string) => (
      <Tag
        color="cyan"
        style={{ fontWeight: "bold" }}
        icon={<ScissorOutlined />}
      >
        {t}
      </Tag>
    ),
  },
  {
    title: "Sectioner",
    dataIndex: "user",
    render: (u) => `${u?.full_name || u?.username || "Staff"}`,
  },
  {
    title: "Microtome",
    dataIndex: "microtome_id",
    render: (m?: string) => (m ? <Tag>{m}</Tag> : "-"),
  },
  {
    title: "Started At",
    dataIndex: "started_at",
    render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm"),
  },
  {
    title: "Slides",
    dataIndex: "details",
    render: (details) => {
      const totalSlides =
        details?.reduce(
          (sum: number, item: SectioningRunResponse["details"][number]) => sum + (item.slide_count || 0),
          0,
        ) || 0;
      return (
        <Space>
          <Badge count={details?.length || 0} showZero color="#108ee9" />
          <Text type="secondary">({totalSlides} slides)</Text>
        </Space>
      );
    },
  },
  {
    title: "Status",
    dataIndex: "finished_at",
    render: (val?: string) =>
      val ? (
        <Tag color="success">Finished</Tag>
      ) : (
        <Tag color="processing">In Progress</Tag>
      ),
  },
  {
    title: "Action",
    key: "action",
    render: (_, record) => (
      <Space>
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => onSelectRun(record)}
        >
          View
        </Button>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(record)}
          disabled={!!(record.details && record.details.length > 0)}
        >
          Delete
        </Button>
      </Space>
    ),
  },
];
