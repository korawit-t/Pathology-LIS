import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Typography,
  Tag,
  Space,
  Select,
  DatePicker,
  Button,
  Input,
  Tooltip,
  message,
} from "antd";
import { BellOutlined, ReloadOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import CriticalNotificationService, {
  CriticalNotificationRecord,
} from "../../services/criticalNotificationService";

const { Title } = Typography;
const { RangePicker } = DatePicker;

const TYPE_COLOR: Record<string, string> = {
  critical_value: "red",
  malignancy: "purple",
  other: "default",
};

const TYPE_LABEL: Record<string, string> = {
  critical_value: "Critical Value",
  malignancy: "Malignancy",
  other: "Other",
};

const CASE_TYPE_COLOR: Record<string, string> = {
  SURGICAL: "blue",
  GYNE_CYTO: "green",
  NONGYNE_CYTO: "orange",
};

const CriticalNotificationLogPage: React.FC = () => {
  const [records, setRecords] = useState<CriticalNotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [filterCaseType, setFilterCaseType] = useState<string | undefined>();
  const [filterNotifType, setFilterNotifType] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };
      if (filterCaseType) params.case_type = filterCaseType;
      if (filterNotifType) params.notification_type = filterNotifType;
      const res = await CriticalNotificationService.getAll(params);
      setRecords(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterCaseType, filterNotifType, dateRange]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (row: CriticalNotificationRecord) => {
    setEditingId(row.id);
    setEditName(row.recipient_name ?? "");
    setEditRole(row.recipient_role ?? "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await CriticalNotificationService.updateRecipient(id, {
        recipient_name: editName || undefined,
        recipient_role: editRole || undefined,
      });
      message.success("Saved");
      setEditingId(null);
      fetch();
    } catch {
      message.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Case Type",
      dataIndex: "case_type",
      width: 110,
      render: (v: string) => (
        <Tag color={CASE_TYPE_COLOR[v] ?? "default"}>{v}</Tag>
      ),
    },
    {
      title: "Accession No",
      dataIndex: "accession_no",
      width: 130,
      render: (v: string, row: CriticalNotificationRecord) => v || `#${row.case_id}`,
    },
    {
      title: "Notification Type",
      dataIndex: "notification_type",
      width: 140,
      render: (v: string) => (
        <Tag color={TYPE_COLOR[v] ?? "default"}>{TYPE_LABEL[v] ?? v}</Tag>
      ),
    },
    {
      title: "Notified Date/Time",
      dataIndex: "notified_at",
      width: 140,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      title: "Recipient",
      dataIndex: "recipient_name",
      render: (_: any, row: CriticalNotificationRecord) => {
        if (editingId === row.id) {
          return (
            <Space size={4}>
              <Input
                size="small"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Recipient name"
                style={{ width: 140 }}
              />
              <Input
                size="small"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                placeholder="Role"
                style={{ width: 100 }}
              />
              <Tooltip title="Save">
                <Button size="small" type="primary" icon={<CheckOutlined />} loading={saving} onClick={() => saveEdit(row.id)} />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
              </Tooltip>
            </Space>
          );
        }
        const display = row.recipient_name
          ? (row.recipient_role ? `${row.recipient_name} (${row.recipient_role})` : row.recipient_name)
          : <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>;
        return (
          <Space size={4}>
            {display}
            <Tooltip title="Edit recipient">
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(row)} />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "Notified Channel",
      dataIndex: "notified_channel_names",
      width: 160,
      render: (v: string[] | null) =>
        v?.length
          ? <Space size={2} wrap>{v.map((n) => <Tag key={n} style={{ fontSize: 11, margin: 0 }}>{n}</Tag>)}</Space>
          : <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>,
    },
    {
      title: "Notified By",
      dataIndex: "notified_by",
      width: 130,
      render: (v: any) => v?.full_name ?? v?.username ?? "—",
    },
    {
      title: "Note",
      dataIndex: "note",
      render: (v: string) => v || "—",
    },
    {
      title: "Recorded At",
      dataIndex: "created_at",
      width: 130,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title
          level={3}
          style={{ margin: 0, display: "flex", alignItems: "center" }}
        >
          <BellOutlined style={{ marginRight: 12, color: "#595959" }} />
          Critical & Malignancy Notification Log
        </Title>
      }
      subTitle="Records of Critical Value and Malignancy notifications"
    >
      <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Select
          placeholder="Case Type"
          allowClear
          style={{ width: 160 }}
          value={filterCaseType}
          onChange={(v) => {
            setFilterCaseType(v);
            setPage(1);
          }}
          options={[
            { value: "SURGICAL", label: "Surgical" },
            { value: "GYNE_CYTO", label: "Gyne Cyto" },
            { value: "NONGYNE_CYTO", label: "Non-Gyne Cyto" },
          ]}
        />
        <Select
          placeholder="Notification Type"
          allowClear
          style={{ width: 200 }}
          value={filterNotifType}
          onChange={(v) => {
            setFilterNotifType(v);
            setPage(1);
          }}
          options={[
            { value: "critical_value", label: "Critical Value" },
            { value: "malignancy", label: "Malignancy" },
            { value: "other", label: "Other" },
          ]}
        />
        <RangePicker
          onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
          placeholder={["Start date", "End date"]}
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

export default CriticalNotificationLogPage;
