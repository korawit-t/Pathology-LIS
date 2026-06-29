import React, { useCallback, useEffect, useState } from "react";
import { Table, Tag, Button, Typography, message } from "antd";
import { CommentOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { InternalConsult } from "../../types/internalConsult";
import InternalConsultService from "../../services/internalConsultService";
import ConsultRespondModal from "./ConsultRespondModal";
import logger from "../../utils/logger";

const { Text } = Typography;

const CASE_TYPE_CONFIG = {
  surgical: { label: "Surgical", color: "blue" },
  gyne: { label: "Gyne", color: "green" },
  nongyne: { label: "Non-Gyne", color: "orange" },
} as const;

interface Props {
  onCountChange?: (count: number) => void;
}

const InternalConsultWorklistPanel: React.FC<Props> = ({ onCountChange }) => {
  const [items, setItems] = useState<InternalConsult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [respondTarget, setRespondTarget] = useState<InternalConsult | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await InternalConsultService.getMyPending({ skip: (p - 1) * pageSize, limit: pageSize });
      setItems(data.items);
      setTotal(data.total);
      onCountChange?.(data.total);
    } catch (err) {
      logger.error(err);
      message.error("Failed to load consult worklist.");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(page); }, [page, load]);

  const columns = [
    {
      title: "Case Type",
      dataIndex: "case_type",
      width: 100,
      render: (type: keyof typeof CASE_TYPE_CONFIG) => {
        const cfg = CASE_TYPE_CONFIG[type] ?? { label: type, color: "default" };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "Accession No.",
      dataIndex: "accession_no_snapshot",
      width: 150,
      render: (text: string) => <Text strong>{text || "—"}</Text>,
    },
    {
      title: "From",
      key: "requester",
      render: (_: unknown, record: InternalConsult) => (
        <Text>{record.requester?.full_name || "—"}</Text>
      ),
    },
    {
      title: "Question",
      dataIndex: "reason",
      render: (text: string) => (
        <Text style={{ fontSize: 13 }}>
          {text.length > 80 ? `${text.slice(0, 80)}…` : text}
        </Text>
      ),
    },
    {
      title: "Received",
      dataIndex: "created_at",
      width: 110,
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(date).format("DD/MM/YY HH:mm")}
        </Text>
      ),
    },
    {
      title: "Action",
      width: 100,
      render: (_: unknown, record: InternalConsult) => (
        <Button
          size="small"
          type="primary"
          ghost
          icon={<CommentOutlined />}
          onClick={() => setRespondTarget(record)}
        >
          Respond
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        bordered
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: "No pending consults" }}
      />

      <ConsultRespondModal
        open={respondTarget !== null}
        consult={respondTarget}
        onClose={() => setRespondTarget(null)}
        onSuccess={() => { setRespondTarget(null); load(page); }}
      />
    </>
  );
};

export default InternalConsultWorklistPanel;
