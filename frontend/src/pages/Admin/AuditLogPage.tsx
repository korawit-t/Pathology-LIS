import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Typography,
  Tag,
  Space,
  Input,
  Select,
  DatePicker,
  Button,
  Tooltip,
  Popover,
} from "antd";
import {
  AuditOutlined,
  ReloadOutlined,
  SearchOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import api from "../../services/httpClient";
import PageContainer from "../../components/Layout/PageContainer";
import logger from "../../utils/logger";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface AuditUser {
  id: number;
  full_name?: string;
  username?: string;
}

interface AuditLog {
  id: number;
  user_id?: number;
  user?: AuditUser;
  action: string;
  resource_type: string;
  resource_id?: number;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

const ACTION_COLOR: Record<string, string> = {
  create: "success",
  update: "processing",
  delete: "error",
  login: "purple",
  logout: "default",
  approve: "cyan",
  reject: "warning",
};

const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [filterResourceType, setFilterResourceType] = useState<string | undefined>();
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resource_type = filterResourceType;
      if (filterUserId) params.user_id = Number(filterUserId);
      if (dateRange) {
        params.date_from = dateRange[0].startOf("day").toISOString();
        params.date_to = dateRange[1].endOf("day").toISOString();
      }
      const res = await api.get("/audit-logs", { params });
      setLogs(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      logger.error("Failed to load audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterAction, filterResourceType, filterUserId, dateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleReset = () => {
    setFilterAction(undefined);
    setFilterResourceType(undefined);
    setFilterUserId("");
    setDateRange(null);
    setPage(1);
  };

  const columns = [
    {
      title: "Timestamp",
      dataIndex: "created_at",
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>{dayjs(v).format("DD/MM/YY HH:mm:ss")}</Text>
      ),
    },
    {
      title: "User",
      key: "user",
      width: 160,
      render: (_: unknown, record: AuditLog) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>
            {record.user?.full_name || "—"}
          </Text>
          {record.user?.username && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                @{record.user.username}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 100,
      render: (v: string) => (
        <Tag color={ACTION_COLOR[v?.toLowerCase()] || "default"}>
          {v?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Resource",
      key: "resource",
      width: 180,
      render: (_: unknown, record: AuditLog) => (
        <Space size={4}>
          <Tag color="geekblue" style={{ fontSize: 11 }}>
            {record.resource_type}
          </Tag>
          {record.resource_id && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              #{record.resource_id}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "IP Address",
      dataIndex: "ip_address",
      width: 130,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v || "—"}
        </Text>
      ),
    },
    {
      title: "Details",
      key: "details",
      width: 60,
      align: "center" as const,
      render: (_: unknown, record: AuditLog) => {
        const hasDetails = record.old_values || record.new_values;
        if (!hasDetails) return null;
        return (
          <Popover
            title="Change Details"
            trigger="click"
            content={
              <div style={{ maxWidth: 400, fontSize: 12 }}>
                {record.old_values && (
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Before:</Text>
                    <pre
                      style={{
                        background: "#fff1f0",
                        padding: "6px 10px",
                        borderRadius: 4,
                        fontSize: 11,
                        maxHeight: 200,
                        overflow: "auto",
                        marginTop: 4,
                      }}
                    >
                      {JSON.stringify(record.old_values, null, 2)}
                    </pre>
                  </div>
                )}
                {record.new_values && (
                  <div>
                    <Text type="secondary">After:</Text>
                    <pre
                      style={{
                        background: "#f6ffed",
                        padding: "6px 10px",
                        borderRadius: 4,
                        fontSize: 11,
                        maxHeight: 200,
                        overflow: "auto",
                        marginTop: 4,
                      }}
                    >
                      {JSON.stringify(record.new_values, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            }
          >
            <Tooltip title="View changes">
              <InfoCircleOutlined style={{ color: "#1890ff", cursor: "pointer" }} />
            </Tooltip>
          </Popover>
        );
      },
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <AuditOutlined style={{ marginRight: 12, color: "#595959" }} />
          Audit Log
        </Title>
      }
      subTitle="Track all system actions and changes"
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
          Refresh
        </Button>
      }
    >
      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="Action"
          allowClear
          style={{ width: 130 }}
          value={filterAction}
          onChange={(v) => { setFilterAction(v); setPage(1); }}
          options={[
            { value: "create", label: "Create" },
            { value: "update", label: "Update" },
            { value: "delete", label: "Delete" },
            { value: "login", label: "Login" },
            { value: "logout", label: "Logout" },
            { value: "approve", label: "Approve" },
            { value: "reject", label: "Reject" },
          ]}
        />
        <Input
          placeholder="Resource Type"
          prefix={<SearchOutlined />}
          allowClear
          style={{ width: 180 }}
          value={filterResourceType}
          onChange={(e) => { setFilterResourceType(e.target.value || undefined); setPage(1); }}
        />
        <Input
          placeholder="User ID"
          allowClear
          style={{ width: 110 }}
          value={filterUserId}
          onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
        />
        <RangePicker
          value={dateRange}
          onChange={(v) => { setDateRange(v as [Dayjs, Dayjs] | null); setPage(1); }}
          format="DD/MM/YYYY"
        />
        <Button onClick={handleReset}>Reset</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["25", "50", "100", "200"],
          showTotal: (t) => `${t} entries`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />
    </PageContainer>
  );
};

export default AuditLogPage;
