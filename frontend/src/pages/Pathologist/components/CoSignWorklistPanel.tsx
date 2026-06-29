import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Space, Table, Tag, Typography } from "antd";
import { EditOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalReportService from "../../../services/surgicalReportService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NongyneReportService from "../../../services/nongyneReportService";

const { Text } = Typography;

interface CoSignItem {
  id: number;
  case_id?: number;
  accession_no?: string;
  version_no?: number;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  status?: string;
  created_at?: string;
}

const TYPE_CONFIG = {
  surgical: { label: "Surgical", color: "blue" },
  gyne: { label: "Gyne", color: "green" },
  nongyne: { label: "Non-Gyne", color: "orange" },
} as const;

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  pending: "gold",
  published: "green",
};

interface CoSignWorklistPanelProps {
  type: "surgical" | "gyne" | "nongyne";
  onSelectCase: (id: number) => void;
  onCountChange?: (count: number) => void;
}

const CoSignWorklistPanel: React.FC<CoSignWorklistPanelProps> = ({
  type,
  onSelectCase,
  onCountChange,
}) => {
  const [items, setItems] = useState<CoSignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let res: { items: CoSignItem[]; total: number };
      if (type === "surgical") {
        res = await SurgicalReportService.getPendingCosignWorklist(page, pageSize, search || undefined) as unknown as { items: CoSignItem[]; total: number };
      } else if (type === "gyne") {
        res = await GyneCytologyCaseService.getPendingCosignWorklist(page, pageSize, search || undefined) as unknown as { items: CoSignItem[]; total: number };
      } else {
        res = await NongyneReportService.getPendingCosignWorklist(page, pageSize, search || undefined) as unknown as { items: CoSignItem[]; total: number };
      }
      setItems(res.items);
      setTotal(res.total);
      onCountChange?.(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [type, page, search, onCountChange]);

  useEffect(() => {
    const t = setTimeout(fetch, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetch, search]);

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 160,
      render: (v: string, rec: CoSignItem) => (
        <Space size={4}>
          <Text strong style={{ color: "#1890ff" }}>{v}</Text>
          {rec.version_no && <Tag color="processing">v.{rec.version_no}</Tag>}
        </Space>
      ),
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, rec: CoSignItem) => (
        <div>
          <Text strong>{[rec.patient_name, rec.patient_ln].filter(Boolean).join(" ")}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>HN: {rec.patient_hn}</Text>
        </div>
      ),
    },
    {
      title: "Type",
      key: "type",
      width: 100,
      render: () => (
        <Tag color={TYPE_CONFIG[type].color}>{TYPE_CONFIG[type].label}</Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (s: string) => (
        <Badge status={s === "published" ? "success" : s === "pending" ? "warning" : "default"} text={s} />
      ),
    },
    {
      title: "Submitted",
      dataIndex: "created_at",
      width: 130,
      render: (v: string) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      title: "",
      key: "action",
      width: 80,
      render: (_: unknown, rec: CoSignItem) => {
        const caseId = rec.case_id ?? rec.id;
        return (
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => onSelectCase(caseId)}
          >
            Open
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
          placeholder="Search accession / patient..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 320 }}
          allowClear
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
          showTotal: (t) => `${t} cases pending co-sign`,
        }}
        locale={{ emptyText: "No pending co-sign cases" }}
      />
    </div>
  );
};

export default CoSignWorklistPanel;
