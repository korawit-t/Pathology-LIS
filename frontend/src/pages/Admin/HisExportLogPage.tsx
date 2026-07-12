import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Typography,
  Tag,
  Space,
  Select,
  Button,
  Input,
  Tooltip,
  Popover,
  message,
} from "antd";
import { CloudUploadOutlined, ReloadOutlined, InfoCircleOutlined, RedoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import HisExportLogService, {
  HisExportLogRecord,
  HisExportLogStatus,
} from "../../services/hisExportLogService";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<HisExportLogStatus, string> = {
  pending: "processing",
  processing: "processing",
  sent: "success",
  dead_letter: "error",
  cancelled: "default",
};

const STATUS_LABEL: Record<HisExportLogStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  sent: "Sent",
  dead_letter: "Dead Letter",
  cancelled: "Cancelled",
};

const RESOURCE_TYPE_COLOR: Record<string, string> = {
  SurgicalReport: "blue",
  GyneCytoReport: "green",
  NongyneCytoReport: "orange",
};

const RETRYABLE_STATUSES: HisExportLogStatus[] = ["sent", "dead_letter", "cancelled"];

const HisExportLogPage: React.FC = () => {
  const [records, setRecords] = useState<HisExportLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterResourceType, setFilterResourceType] = useState<string | undefined>();
  const [filterAccessionNo, setFilterAccessionNo] = useState<string>("");

  const [retryingId, setRetryingId] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };
      if (filterStatus) params.status = filterStatus;
      if (filterResourceType) params.resource_type = filterResourceType;
      if (filterAccessionNo) params.accession_no = filterAccessionNo;
      const res = await HisExportLogService.getAll(params);
      setRecords(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterResourceType, filterAccessionNo]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await HisExportLogService.retry(id);
      message.success("Retry queued");
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "Failed to queue retry");
    } finally {
      setRetryingId(null);
    }
  };

  const renderJsonPopover = (title: string, value: unknown) => {
    if (!value) return null;
    return (
      <Popover
        title={title}
        trigger="click"
        content={
          <pre
            style={{
              maxWidth: 480,
              maxHeight: 320,
              overflow: "auto",
              background: "#fafafa",
              padding: "6px 10px",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            {JSON.stringify(value, null, 2)}
          </pre>
        }
      >
        <Tooltip title={`View ${title.toLowerCase()}`}>
          <InfoCircleOutlined style={{ color: "#1890ff", cursor: "pointer" }} />
        </Tooltip>
      </Popover>
    );
  };

  const columns = [
    {
      title: "Resource Type",
      dataIndex: "resource_type",
      width: 140,
      render: (v: string) => <Tag color={RESOURCE_TYPE_COLOR[v] ?? "default"}>{v}</Tag>,
    },
    {
      title: "Accession No",
      dataIndex: "accession_no",
      width: 130,
      render: (v: string | null, row: HisExportLogRecord) => v || `#${row.resource_id}`,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v: HisExportLogStatus) => <Tag color={STATUS_COLOR[v] ?? "default"}>{STATUS_LABEL[v] ?? v}</Tag>,
    },
    {
      title: "Adapter",
      dataIndex: "adapter_type",
      width: 130,
      render: (v: string | null) => v || <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: "Attempts",
      dataIndex: "attempt_count",
      width: 90,
      render: (v: number, row: HisExportLogRecord) => `${v} / ${row.max_attempts}`,
    },
    {
      title: "Next / Sent At",
      dataIndex: "sent_at",
      width: 140,
      render: (_: string | null, row: HisExportLogRecord) => {
        if (row.sent_at) return dayjs(row.sent_at).format("DD/MM/YY HH:mm");
        if (row.next_attempt_at) return dayjs(row.next_attempt_at).format("DD/MM/YY HH:mm");
        return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
      },
    },
    {
      title: "Error",
      dataIndex: "error_message",
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Text type="danger" style={{ fontSize: 12 }} ellipsis>
              {v}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: "Details",
      key: "details",
      width: 90,
      render: (_: any, row: HisExportLogRecord) => (
        <Space size={4}>
          {renderJsonPopover("Payload", row.payload_snapshot)}
          {renderJsonPopover("Response", row.response_snapshot)}
        </Space>
      ),
    },
    {
      title: "Triggered By",
      dataIndex: "triggered_by",
      width: 110,
    },
    {
      title: "Created At",
      dataIndex: "created_at",
      width: 130,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      title: "Action",
      key: "action",
      width: 90,
      render: (_: any, row: HisExportLogRecord) =>
        RETRYABLE_STATUSES.includes(row.status) ? (
          <Tooltip title="Retry">
            <Button
              size="small"
              icon={<RedoOutlined />}
              loading={retryingId === row.id}
              onClick={() => handleRetry(row.id)}
            />
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <CloudUploadOutlined style={{ marginRight: 12, color: "#595959" }} />
          HIS Export Log
        </Title>
      }
      subTitle="Outbound report delivery status to the external HIS"
    >
      <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          value={filterStatus}
          onChange={(v) => {
            setFilterStatus(v);
            setPage(1);
          }}
          options={[
            { value: "pending", label: "Pending" },
            { value: "processing", label: "Processing" },
            { value: "sent", label: "Sent" },
            { value: "dead_letter", label: "Dead Letter" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Select
          placeholder="Resource Type"
          allowClear
          style={{ width: 180 }}
          value={filterResourceType}
          onChange={(v) => {
            setFilterResourceType(v);
            setPage(1);
          }}
          options={[
            { value: "SurgicalReport", label: "Surgical" },
            { value: "GyneCytoReport", label: "Gyne Cyto" },
            { value: "NongyneCytoReport", label: "Non-Gyne Cyto" },
          ]}
        />
        <Input.Search
          placeholder="Accession No"
          allowClear
          style={{ width: 180 }}
          onSearch={(v) => {
            setFilterAccessionNo(v);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>
          Reload
        </Button>
      </Space>

      <Table
        dataSource={records}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `Total ${t} records`,
          onChange: setPage,
        }}
      />
    </PageContainer>
  );
};

export default HisExportLogPage;
