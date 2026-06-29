import React, { useEffect, useState } from "react";
import { Descriptions, Table, Tag, Spin, Typography, Space, message } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import EmbeddingService from "../../../services/embeddingService";

const { Text } = Typography;

interface BlockLite {
  block_code?: string;
  specimen_label?: string;
  block_no?: string;
  accession_no?: string;
  is_decal?: boolean;
}

interface EmbeddingDetailRow {
  id: number;
  run_id: number;
  block_id: number;
  embedded_at: string;
  block?: BlockLite;
}

interface RunData {
  id: number;
  run_no: string;
  started_at: string;
  user_id: number;
  station_id?: string | null;
  operator?: { full_name?: string; username?: string };
  details?: EmbeddingDetailRow[];
}

interface Props {
  runId: number;
}

const EmbeddingRunDetail: React.FC<Props> = ({ runId }) => {
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    EmbeddingService.getRuns()
      .then((list) => {
        const found = list.find((r) => r.id === runId);
        if (found) setRun(found as unknown as RunData);
        else message.error("Run not found");
      })
      .catch(() => message.error("Failed to load run data"))
      .finally(() => setLoading(false));
  }, [runId]);

  const columns: ColumnsType<EmbeddingDetailRow> = [
    {
      title: "#",
      render: (_: unknown, __: EmbeddingDetailRow, i: number) => i + 1,
      width: 52,
    },
    {
      title: "Accession No.",
      render: (_: unknown, r: EmbeddingDetailRow) => {
        const acc = r.block?.accession_no;
        return acc ? <Text strong style={{ color: "#1890ff" }}>{acc}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: "Block",
      render: (_: unknown, r: EmbeddingDetailRow) => {
        const code =
          r.block?.block_code ||
          (r.block?.specimen_label && r.block?.block_no
            ? `${r.block.specimen_label}${r.block.block_no}`
            : null);
        return (
          <Space size={4}>
            {code ? (
              <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>
            ) : (
              <Tag>Block ID: {r.block_id}</Tag>
            )}
            {r.block?.is_decal && (
              <Tag color="volcano" icon={<ExperimentOutlined />}>Decal</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "Embedded At",
      dataIndex: "embedded_at",
      render: (val: string) =>
        val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "—",
    },
    {
      title: "Status",
      render: (_: unknown, r: EmbeddingDetailRow) =>
        r.embedded_at ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>Embedded</Tag>
        ) : (
          <Tag color="processing" icon={<ClockCircleOutlined />}>Pending</Tag>
        ),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!run) return null;

  const operatorName =
    run.operator?.full_name || run.operator?.username || `Staff ID: ${run.user_id}`;
  const totalBlocks = run.details?.length ?? 0;
  const isFinished = totalBlocks > 0;

  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2, md: 4 }}
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label="Run Number">
          <Tag color="blue" style={{ fontWeight: 700, fontSize: 14 }}>
            {run.run_no}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          {isFinished ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>Completed</Tag>
          ) : (
            <Tag color="processing" icon={<ClockCircleOutlined />}>In Progress</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Operator">{operatorName}</Descriptions.Item>
        <Descriptions.Item label="Station">
          {run.station_id || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Started At">
          {dayjs(run.started_at).format("DD/MM/YYYY HH:mm")}
        </Descriptions.Item>
        <Descriptions.Item label="Total Blocks">
          <Tag color={totalBlocks > 0 ? "green" : "default"}>{totalBlocks} blocks</Tag>
        </Descriptions.Item>
      </Descriptions>

      <Table<EmbeddingDetailRow>
        dataSource={run.details ?? []}
        columns={columns}
        rowKey="id"
        size="middle"
        bordered
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
    </>
  );
};

export default EmbeddingRunDetail;
