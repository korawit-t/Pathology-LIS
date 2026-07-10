import React, { useEffect, useState, FC, useCallback } from "react";
import { Table, Tag, Button, Typography, Tabs, Badge, Tooltip, Input } from "antd";
import {
  ExperimentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import SurgicalBlockService from "../../../services/surgicalBlockService";
import DecalFormModal from "../../Gross/components/DecalFormModal";
import { SurgicalBlock } from "../../../types/surgical";
import { User } from "../../../types/user";
import logger from "../../../utils/logger";

const { Text } = Typography;

interface DecalQueueManagerProps {
  users: User[];
  onRefreshCount?: () => void;
}

function useBlockQueue(filter: { is_decal?: boolean; is_fixing?: boolean; decal_history?: boolean; fix_history?: boolean }, onRefreshCount?: () => void) {
  const [blocks, setBlocks] = useState<SurgicalBlock[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({ skip: 0, limit: 1000, ...filter });
      setBlocks(res.items || []);
      onRefreshCount?.();
    } catch (err) {
      logger.error("Fetch queue error:", err);
    } finally {
      setLoading(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(); }, [fetch]);

  return { blocks, loading, refetch: fetch };
}

const DecalQueueManager: FC<DecalQueueManagerProps> = ({ users, onRefreshCount }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<SurgicalBlock | null>(null);
  const [searchText, setSearchText] = useState("");

  const decal = useBlockQueue({ is_decal: true }, onRefreshCount);
  const fixing = useBlockQueue({ is_fixing: true }, onRefreshCount);
  const decalHistory = useBlockQueue({ decal_history: true });
  const fixHistory = useBlockQueue({ fix_history: true });

  const openModal = (block: SurgicalBlock) => {
    setSelectedBlock(block);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    decal.refetch();
    fixing.refetch();
    decalHistory.refetch();
    fixHistory.refetch();
  };

  const filtered = (list: SurgicalBlock[]) => {
    const s = searchText.toLowerCase();
    if (!s) return list;
    return list.filter((b) => {
      const acc = b.accession_no?.toLowerCase() || "";
      const code = `${b.specimen_label}${b.block_no}`.toLowerCase();
      return acc.includes(s) || code.includes(s);
    });
  };

  const findUserName = (id?: number | null) => {
    if (!id) return "-";
    const u = users.find((u) => u.id === id);
    return u ? (u.report_name || u.full_name || u.username) : `ID: ${id}`;
  };

  const durationText = (startAt?: string, endAt?: string) => {
    if (!startAt) return "-";
    const start = dayjs(startAt);
    const end = endAt ? dayjs(endAt) : dayjs();
    const days = end.diff(start, "day");
    const hours = end.diff(start, "hour") % 24;
    const mins = end.diff(start, "minute") % 60;
    if (endAt) {
      return `${days > 0 ? `${days}d ` : ""}${hours > 0 ? `${hours}h ` : ""}${mins}m`;
    }
    return `${days > 0 ? `${days}d ` : ""}${hours}h`;
  };

  const decalColumns: ColumnsType<SurgicalBlock> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (text) => <b style={{ color: "#1890ff" }}>{text}</b>,
    },
    {
      title: "Block",
      key: "block_code",
      render: (_, r) => <Tag color="blue">{r.specimen_label}{r.block_no}</Tag>,
    },
    {
      title: "Status",
      key: "status",
      render: (_, r) => {
        if (r.decal_end_at) return <Tag color="success" icon={<CheckCircleOutlined />}>Complete</Tag>;
        if (r.decal_start_at) return <Tag color="processing" icon={<ClockCircleOutlined />}>In Progress</Tag>;
        return <Tag color="default">Waiting</Tag>;
      },
    },
    {
      title: "Start At",
      dataIndex: "decal_start_at",
      render: (val: string) => val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Duration",
      key: "duration",
      render: (_, r) => (
        <Text type={r.decal_end_at ? "secondary" : "danger"}>
          {durationText(r.decal_start_at, r.decal_end_at)}
        </Text>
      ),
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      render: (_, r) => (
        <Button type="primary" ghost size="small" icon={<ExperimentOutlined />} onClick={() => openModal(r)}>
          Manage
        </Button>
      ),
    },
  ];

  const fixingColumns: ColumnsType<SurgicalBlock> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (text) => <b style={{ color: "#1890ff" }}>{text}</b>,
    },
    {
      title: "Block",
      key: "block_code",
      render: (_, r) => <Tag color="orange">{r.specimen_label}{r.block_no}</Tag>,
    },
    {
      title: "Status",
      key: "status",
      render: (_, r) => {
        if (r.fix_end_at) return <Tag color="success" icon={<CheckCircleOutlined />}>Complete</Tag>;
        if (r.fix_start_at) return <Tag color="warning" icon={<ClockCircleOutlined />}>In Progress</Tag>;
        return <Tag color="default" icon={<FireOutlined />}>Waiting</Tag>;
      },
    },
    {
      title: "Start At",
      dataIndex: "fix_start_at",
      render: (val: string) => val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Duration",
      key: "duration",
      render: (_, r) => (
        <Text type={r.fix_end_at ? "secondary" : "danger"}>
          {durationText(r.fix_start_at, r.fix_end_at)}
        </Text>
      ),
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      render: (_, r) => (
        <Button type="primary" ghost size="small" icon={<FireOutlined />} onClick={() => openModal(r)}>
          Manage
        </Button>
      ),
    },
  ];

  const historyColumns = (
    startField: "decal_start_at" | "fix_start_at",
    endField: "decal_end_at" | "fix_end_at",
    startByField: "decal_start_by_id" | "fix_start_by_id",
    endByField: "decal_end_by_id" | "fix_end_by_id",
    tagColor: string,
  ): ColumnsType<SurgicalBlock> => [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (text) => <b style={{ color: "#1890ff" }}>{text}</b>,
    },
    {
      title: "Block",
      key: "block_code",
      render: (_, r) => <Tag color={tagColor}>{r.specimen_label}{r.block_no}</Tag>,
    },
    {
      title: "Started",
      key: "started",
      render: (_, r) => (
        <div>
          <div>{r[startField] ? dayjs(r[startField] as string).format("DD/MM/YY HH:mm") : "-"}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{findUserName(r[startByField] as number | null)}</Text>
        </div>
      ),
    },
    {
      title: "Completed",
      key: "completed",
      render: (_, r) => (
        <div>
          <div>{r[endField] ? dayjs(r[endField] as string).format("DD/MM/YY HH:mm") : "-"}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{findUserName(r[endByField] as number | null)}</Text>
        </div>
      ),
    },
    {
      title: "Duration",
      key: "duration",
      render: (_, r) => {
        if (!r[startField] || !r[endField]) return "-";
        return <Text type="secondary">{durationText(r[startField] as string, r[endField] as string)}</Text>;
      },
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      render: (_, r) => (
        <Tooltip title="Re-open to edit">
          <Button size="small" icon={<ExperimentOutlined />} onClick={() => openModal(r)}>Edit</Button>
        </Tooltip>
      ),
    },
  ];

  const tabItems = [
    {
      key: "decal",
      label: (
        <span>
          🦴 Decal{" "}
          <Badge count={filtered(decal.blocks).length} color="#1890ff" />
        </span>
      ),
      children: (
        <div style={{ padding: "16px 24px" }}>
          <Table
            dataSource={filtered(decal.blocks)}
            columns={decalColumns}
            rowKey="id"
            loading={decal.loading}
            pagination={{ pageSize: 10 }}
            bordered
            size="middle"
          />
        </div>
      ),
    },
    {
      key: "fixing",
      label: (
        <span>
          🔥 Extended Fix{" "}
          <Badge count={filtered(fixing.blocks).length} color="#fa8c16" />
        </span>
      ),
      children: (
        <div style={{ padding: "16px 24px" }}>
          <Table
            dataSource={filtered(fixing.blocks)}
            columns={fixingColumns}
            rowKey="id"
            loading={fixing.loading}
            pagination={{ pageSize: 10 }}
            bordered
            size="middle"
          />
        </div>
      ),
    },
    {
      key: "decal_history",
      label: (
        <span>
          <HistoryOutlined style={{ marginRight: 4 }} />
          Decal History{" "}
          <Badge count={filtered(decalHistory.blocks).length} color="#8c8c8c" showZero={false} />
        </span>
      ),
      children: (
        <div style={{ padding: "16px 24px" }}>
          <Table
            dataSource={filtered(decalHistory.blocks)}
            columns={historyColumns("decal_start_at", "decal_end_at", "decal_start_by_id", "decal_end_by_id", "blue")}
            rowKey="id"
            loading={decalHistory.loading}
            pagination={{ pageSize: 20 }}
            bordered
            size="middle"
          />
        </div>
      ),
    },
    {
      key: "fix_history",
      label: (
        <span>
          <HistoryOutlined style={{ marginRight: 4 }} />
          Fix History{" "}
          <Badge count={filtered(fixHistory.blocks).length} color="#8c8c8c" showZero={false} />
        </span>
      ),
      children: (
        <div style={{ padding: "16px 24px" }}>
          <Table
            dataSource={filtered(fixHistory.blocks)}
            columns={historyColumns("fix_start_at", "fix_end_at", "fix_start_by_id", "fix_end_by_id", "orange")}
            rowKey="id"
            loading={fixHistory.loading}
            pagination={{ pageSize: 20 }}
            bordered
            size="middle"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <Tabs
        items={tabItems}
        tabBarStyle={{ padding: "0 24px", marginBottom: 0 }}
        tabBarExtraContent={
          <Input.Search
            placeholder="Search by Block / Accession No."
            style={{ width: 300 }}
            allowClear
            enterButton
            onSearch={(value) => setSearchText(value)}
          />
        }
      />

      {isModalOpen && (
        <DecalFormModal
          open={isModalOpen}
          block={selectedBlock}
          users={users}
          onClose={() => { setIsModalOpen(false); setSelectedBlock(null); }}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
};

export default DecalQueueManager;
