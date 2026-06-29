import React from "react";
import {
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Input,
  Popconfirm,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { TYPE_TAG } from "./constants";
import type { OutlabConsultRunResponse, OutlabConsultRunDetailResponse } from "../../services/outlabConsultRunService";

const { Text } = Typography;

interface OutlabTabContentProps {
  runs: OutlabConsultRunResponse[];
  loading: boolean;
  searchText: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onReceive: (runId: number) => void;
  pendingCount: number;
}

const OutlabTabContent: React.FC<OutlabTabContentProps> = ({
  runs,
  loading,
  searchText,
  onSearchChange,
  onRefresh,
  onReceive,
  pendingCount,
}) => (
  <>
    <Space style={{ marginBottom: 12 }} wrap>
      <Input
        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
        placeholder="Search by Run No., Accession No., Lab, or Patient"
        allowClear
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ width: 380 }}
      />
      <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
        Refresh
      </Button>
    </Space>
    <Space style={{ marginBottom: 12 }}>
      <Tag color="processing">Pending: {pendingCount}</Tag>
      <Tag color="success">Completed: {runs.length - pendingCount}</Tag>
    </Space>
    <Table
      dataSource={runs}
      rowKey="id"
      loading={loading}
      size="middle"
      bordered
      pagination={{ pageSize: 20, showTotal: (t) => `Total ${t} runs`, hideOnSinglePage: true }}
      scroll={{ x: 900, y: "calc(100vh - 380px)" }}
      sticky
      expandable={{
        expandedRowRender: (run: OutlabConsultRunResponse) => (
          <Table
            dataSource={run.details}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: "Type",
                dataIndex: "case_type",
                width: 90,
                render: (v: string) => (
                  <Tag color={TYPE_TAG[v]?.color || "default"}>{TYPE_TAG[v]?.label || v}</Tag>
                ),
              },
              { title: "Accession No.", dataIndex: "accession_no", width: 150 },
              { title: "Patient", dataIndex: "patient_name", width: 200 },
              {
                title: "Block",
                dataIndex: "block_code",
                width: 80,
                render: (v: string) => v || "—",
              },
              {
                title: "Report Out",
                dataIndex: "report_out_at",
                width: 150,
                render: (v: string) =>
                  v ? dayjs(v).format("DD/MM/YY HH:mm") : <Tag color="orange">Pending</Tag>,
              },
              {
                title: "Block Returned",
                key: "block_returned",
                width: 140,
                render: (_: unknown, d: OutlabConsultRunDetailResponse) =>
                  d.block_returned ? (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      Returned{d.block_returned_at ? ` ${dayjs(d.block_returned_at).format("DD/MM/YY")}` : ""}
                    </Tag>
                  ) : (
                    <Tag color="default">Pending</Tag>
                  ),
              },
            ]}
          />
        ),
        rowExpandable: (run: OutlabConsultRunResponse) => run.details.length > 0,
      }}
      columns={[
        {
          title: "Run No.",
          dataIndex: "run_no",
          width: 120,
          render: (v: string) => <Text strong>{v || "—"}</Text>,
        },
        {
          title: "Destination Lab",
          dataIndex: "destination_lab",
          width: 200,
          render: (v: string) => <Tag color="geekblue">{v || "—"}</Tag>,
        },
        {
          title: "Sent At",
          dataIndex: "sent_at",
          width: 150,
          render: (v: string) => (v ? dayjs(v).format("DD/MM/YY HH:mm") : "—"),
        },
        {
          title: "Cases",
          key: "cases",
          render: (_: unknown, r: OutlabConsultRunResponse) => {
            const types = r.details.reduce<Record<string, number>>((acc, d) => {
              acc[d.case_type] = (acc[d.case_type] || 0) + 1;
              return acc;
            }, {});
            return (
              <Space size={4} wrap>
                {Object.entries(types).map(([type, count]) => (
                  <Tag key={type} color={TYPE_TAG[type]?.color || "default"} style={{ fontSize: 11 }}>
                    {TYPE_TAG[type]?.label || type} ×{count}
                  </Tag>
                ))}
              </Space>
            );
          },
        },
        {
          title: "Status",
          dataIndex: "status",
          width: 130,
          render: (v: string) => (
            <Tag color={v === "completed" ? "success" : v === "processing" ? "blue" : "orange"}>
              {v === "completed" ? "Completed" : v === "processing" ? "Processing" : "Pending"}
            </Tag>
          ),
        },
        {
          title: "",
          key: "action",
          width: 110,
          fixed: "right" as const,
          render: (_: unknown, r: OutlabConsultRunResponse) =>
            r.status !== "completed" ? (
              <Popconfirm
                title="ยืนยันการรับรายงานกลับ?"
                onConfirm={() => onReceive(r.id)}
                okText="ยืนยัน"
                cancelText="ยกเลิก"
              >
                <Button size="small" type="primary" icon={<CheckCircleOutlined />}>
                  Receive
                </Button>
              </Popconfirm>
            ) : (
              <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 16 }} />
            ),
        },
      ]}
    />
  </>
);

export default OutlabTabContent;
