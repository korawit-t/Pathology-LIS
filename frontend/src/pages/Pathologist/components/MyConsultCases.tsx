import React, { useState, useEffect, useCallback } from "react";
import {
  Table, Tag, Input, Space, Button, Typography, message, Segmented,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, ClockCircleOutlined,
  CheckCircleOutlined, SyncOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import type { SurgicalCase } from "../../../types/surgical";

const { Text } = Typography;

const CONSULT_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

const CONSULT_STATUS_QUERY: Record<string, string> = {
  active: "pending,processing",
  completed: "completed",
};

const CONSULT_TAG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending:    { color: "warning",    icon: <ClockCircleOutlined /> },
  processing: { color: "processing", icon: <SyncOutlined /> },
  completed:  { color: "success",    icon: <CheckCircleOutlined /> },
};

interface Props {
  pathologistId?: number;
  onSelectCase?: (id: number) => void;
  onCountChange?: (count: number) => void;
}

const MyConsultCases: React.FC<Props> = ({ pathologistId, onSelectCase, onCountChange }) => {
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [consultStatus, setConsultStatus] = useState("active");
  const PAGE_SIZE = 20;

  const fetchCases = useCallback(async () => {
    if (!pathologistId) return;
    setLoading(true);
    try {
      const res = await SurgicalCaseService.getCases({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        pathologist_id: pathologistId,
        is_out_lab_consult: true,
        consult_status: CONSULT_STATUS_QUERY[consultStatus] ?? consultStatus,
      });
      setCases(res.items || []);
      const t = res.total || 0;
      setTotal(t);
      onCountChange?.(t);
    } catch {
      message.error("Failed to load consult cases");
    } finally {
      setLoading(false);
    }
  }, [pathologistId, page, search, consultStatus]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    setPage(1);
  }, [consultStatus, search]);

  const columns: ColumnsType<SurgicalCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (v) => <Text strong style={{ color: "#1677ff" }}>{v || "—"}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      width: 100,
    },
    {
      title: "Patient",
      key: "patient",
      render: (_, r: any) =>
        [r.patient?.title?.title, r.patient?.name, r.patient?.ln]
          .filter(Boolean)
          .join(" ") || "—",
    },
    {
      title: "Case Status",
      dataIndex: "status",
      width: 140,
      render: (v) => <Tag>{v || "—"}</Tag>,
    },
    {
      title: "Consult Status",
      dataIndex: "consult_status",
      width: 150,
      render: (v: string) => {
        const cfg = CONSULT_TAG[v] ?? { color: "default", icon: null };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {v || "—"}
          </Tag>
        );
      },
    },
    {
      title: "Registered",
      dataIndex: "registered_at",
      width: 140,
      render: (v) => v ? dayjs(v).format("DD MMM YYYY") : "—",
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Segmented
            options={CONSULT_STATUS_OPTIONS}
            value={consultStatus}
            onChange={(v) => setConsultStatus(v as string)}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession, HN, patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading}>
            Refresh
          </Button>
        </Space>
        <Tag color="blue" style={{ padding: "4px 10px" }}>
          {total} case{total !== 1 ? "s" : ""}
        </Tag>
      </div>

      <Table
        columns={columns}
        dataSource={cases}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => onSelectCase?.(record.id),
          style: onSelectCase ? { cursor: "pointer" } : undefined,
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: setPage,
          showTotal: (t) => `${t} cases`,
        }}
        size="middle"
        locale={{ emptyText: "No consult cases found" }}
      />
    </>
  );
};

export default MyConsultCases;
