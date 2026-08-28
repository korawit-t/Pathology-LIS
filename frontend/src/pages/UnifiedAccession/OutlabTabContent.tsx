import React from "react";
import {
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Popconfirm,
} from "antd";
import {
  ReloadOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { TYPE_TAG } from "./constants";
import ConsultRunExpansionPanel from "./ConsultRunExpansionPanel";
import "../../styles/table-common.css";
import type { OutlabConsultRunResponse } from "../../services/outlabConsultRunService";

const { Text } = Typography;

interface OutlabTabContentProps {
  runs: OutlabConsultRunResponse[];
  loading: boolean;
  onRefresh: () => void;
  onReceive: (runId: number) => void;
  pendingCount: number;
}

const OutlabTabContent: React.FC<OutlabTabContentProps> = ({
  runs,
  loading,
  onRefresh,
  onReceive,
  pendingCount,
}) => (
  <>
    <Space style={{ marginBottom: 12 }} wrap>
      <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
        Refresh
      </Button>
      <Tag color="processing">Pending: {pendingCount}</Tag>
      <Tag color="success">Completed: {runs.length - pendingCount}</Tag>
    </Space>
    <Table
      dataSource={runs}
      rowKey="id"
      loading={loading}
      className="standard-table"
      // Only expandable rows get the clickable-row affordance (cursor + hover
      // highlight) — a run with no cases does nothing when clicked.
      rowClassName={(run: OutlabConsultRunResponse) => (run.details.length > 0 ? "editable-row" : "")}
      size="middle"
      bordered
      pagination={{
        pageSize: 20,
        showSizeChanger: false,
        showTotal: (t) => `Total ${t} runs`,
        hideOnSinglePage: true,
      }}
      scroll={{ x: 900, y: "calc(100vh - 360px)" }}
      sticky
      expandable={{
        // Click anywhere on the run row to see its cases — same affordance as
        // OutlabManagement's TrackingTab, except the expand icon stays visible
        // here so the tab advertises that a run has cases to look at.
        expandRowByClick: true,
        expandedRowRender: (run: OutlabConsultRunResponse) => (
          <ConsultRunExpansionPanel details={run.details} />
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
          // Without this, clicking Receive (or its confirm popup, which bubbles
          // through the React tree even though it renders in a portal) would
          // also toggle the row's expansion.
          onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
          render: (_: unknown, r: OutlabConsultRunResponse) =>
            r.status !== "completed" ? (
              <Popconfirm
                title="Confirm report receipt?"
                onConfirm={() => onReceive(r.id)}
                okText="Confirm"
                cancelText="Cancel"
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
