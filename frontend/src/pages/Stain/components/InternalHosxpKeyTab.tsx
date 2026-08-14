import React, { useEffect, useMemo, useState } from "react";
import { Table, Button, Space, Typography, Tag, Tooltip, Input, message } from "antd";
import { CheckCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import { useCaseInfoByAccession } from "../../../hooks/useCaseInfoByAccession";
import { formatPatientName } from "../../../utils/patientName";
import { CAT_COLOR, catLabel, isKeyableStain } from "../stainFilters";

const { Text } = Typography;

const STATUS_TAG_COLOR: Record<string, string> = {
  pending: "warning",
  stained: "success",
  sent: "orange",
  completed: "processing",
};

interface StainRow {
  key: number;
  accession_no: string;
  hn: string;
  patient_name: string;
  block_code: string;
  stain_name: string;
  category?: string | null;
  status: string;
  is_hosxp_keyed: boolean;
}

interface BlockLike {
  accession_no?: string | null;
  specimen_label?: string | null;
  block_no?: number | string | null;
  stains?: Array<{
    id: number;
    status?: string | null;
    is_recut?: boolean | null;
    is_hosxp_keyed?: boolean | null;
    test?: { name?: string | null; category?: string | null; is_external?: boolean | null } | null;
  }> | null;
}

interface InternalHosxpKeyTabProps {
  blocks: BlockLike[];
  loading?: boolean;
  onRefresh: () => void;
}

/**
 * HosXP billing-key worklist for in-house stains (AFB, GMS, …).
 *
 * The outlab twin (Outlab/OutlabManagement/HosxpKeyTab.tsx) keys
 * surgical_outlab_run_details rows, which only exist once slides are
 * dispatched. Internal stains never get one, so this keys the stain itself.
 *
 * Recuts are excluded — a recut is a re-section of an existing block, not a
 * separately billable test.
 */
const InternalHosxpKeyTab: React.FC<InternalHosxpKeyTabProps> = ({
  blocks,
  loading,
  onRefresh,
}) => {
  const { resolveCaseInfo } = useCaseInfoByAccession();
  const [caseMap, setCaseMap] = useState<Record<string, { hn: string; patient_name: string }>>({});
  const [keyedOverrides, setKeyedOverrides] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterKeyed, setFilterKeyed] = useState<"all" | "pending" | "keyed">("all");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Blocks come from the parent's existing fetch; only HN/patient need resolving.
  const accessionNos = useMemo(
    () => [...new Set(blocks.map((b) => b.accession_no).filter(Boolean))] as string[],
    [blocks],
  );

  useEffect(() => {
    if (accessionNos.length === 0) { setCaseMap({}); return; }
    let cancelled = false;
    resolveCaseInfo(accessionNos)
      .then((byAcc) => {
        if (cancelled) return;
        const map: Record<string, { hn: string; patient_name: string }> = {};
        Object.entries(byAcc).forEach(([acc, c]) => {
          map[acc] = { hn: c.hn || "-", patient_name: formatPatientName(c.patient) };
        });
        setCaseMap(map);
      })
      .catch(() => { if (!cancelled) setCaseMap({}); });
    return () => { cancelled = true; };
  }, [accessionNos, resolveCaseInfo]);

  // Reset local toggles whenever the parent refetches, so server state wins.
  useEffect(() => { setKeyedOverrides({}); }, [blocks]);

  const allItems: StainRow[] = useMemo(
    () =>
      blocks.flatMap((b) =>
        (b.stains || []).filter(isKeyableStain).map((s) => {
          const info = caseMap[b.accession_no || ""];
          return {
            key: s.id,
            accession_no: b.accession_no || "-",
            hn: info?.hn || "-",
            patient_name: info?.patient_name || "-",
            block_code: `${b.specimen_label ?? ""}${b.block_no ?? ""}` || "-",
            stain_name: s.test?.name || "Unknown",
            category: s.test?.category,
            status: s.status || "pending",
            is_hosxp_keyed: keyedOverrides[s.id] ?? !!s.is_hosxp_keyed,
          };
        }),
      ),
    [blocks, caseMap, keyedOverrides],
  );

  const handleToggle = async (record: StainRow) => {
    const next = !record.is_hosxp_keyed;
    setKeyedOverrides((prev) => ({ ...prev, [record.key]: next }));
    try {
      await SurgicalBlockStainService.toggleStainHosxpKeyed(record.key, next);
    } catch {
      setKeyedOverrides((prev) => ({ ...prev, [record.key]: !next }));
      message.error("Failed to update HosXP flag");
    }
  };

  const handleBulkKey = async () => {
    if (selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    const ids = selectedRowKeys.map(Number);
    try {
      await Promise.all(ids.map((id) => SurgicalBlockStainService.toggleStainHosxpKeyed(id, true)));
      setKeyedOverrides((prev) => ({
        ...prev,
        ...Object.fromEntries(ids.map((id) => [id, true])),
      }));
      message.success(`Keyed ${ids.length} item(s)`);
      setSelectedRowKeys([]);
    } catch {
      message.error("Failed to key some items");
    } finally {
      setBulkLoading(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = allItems
    .filter((item) => {
      if (filterKeyed === "pending") return !item.is_hosxp_keyed;
      if (filterKeyed === "keyed") return item.is_hosxp_keyed;
      return true;
    })
    .filter(
      (item) =>
        !q ||
        item.accession_no.toLowerCase().includes(q) ||
        item.hn.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q) ||
        item.stain_name.toLowerCase().includes(q),
    );

  const pendingCount = allItems.filter((i) => !i.is_hosxp_keyed).length;

  const columns: ColumnsType<StainRow> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      sorter: (a, b) => (a.accession_no || "").localeCompare(b.accession_no || ""),
      defaultSortOrder: "ascend",
      render: (text) => <Text strong style={{ color: "#1890ff" }}>{text}</Text>,
    },
    { title: "HN", dataIndex: "hn", width: 100 },
    { title: "Patient", dataIndex: "patient_name", width: 180 },
    {
      title: "Block",
      dataIndex: "block_code",
      width: 80,
      render: (text) => <Tag color="blue" style={{ margin: 0 }}>{text}</Tag>,
    },
    {
      title: "Stain",
      dataIndex: "stain_name",
      width: 180,
      render: (text, record) => (
        <Space size={4}>
          <Text style={{ fontSize: 13 }}>{text}</Text>
          <Tag color={CAT_COLOR[record.category ?? ""] || "default"} style={{ margin: 0, fontSize: 11 }}>
            {catLabel(record.category)}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 100,
      render: (v) => (
        <Tag color={STATUS_TAG_COLOR[v] || "default"} style={{ margin: 0, fontSize: 12 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: "HosXP",
      key: "hosxp_keyed",
      width: 110,
      fixed: "right",
      align: "center",
      render: (_, record) => (
        <Tooltip title={record.is_hosxp_keyed ? "Click to unmark" : "Mark as keyed in HosXP"}>
          <Button
            size="small"
            type={record.is_hosxp_keyed ? "primary" : "default"}
            icon={<CheckCircleOutlined />}
            onClick={() => handleToggle(record)}
            style={
              record.is_hosxp_keyed
                ? { background: "#52c41a", borderColor: "#389e0d", color: "#fff" }
                : { color: "#bfbfbf" }
            }
          >
            {record.is_hosxp_keyed ? "Keyed" : "Key"}
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Button.Group>
          <Button
            type={filterKeyed === "all" ? "primary" : "default"}
            onClick={() => setFilterKeyed("all")}
          >
            All ({allItems.length})
          </Button>
          <Button
            type={filterKeyed === "pending" ? "primary" : "default"}
            danger={filterKeyed === "pending"}
            onClick={() => setFilterKeyed("pending")}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            type={filterKeyed === "keyed" ? "primary" : "default"}
            onClick={() => setFilterKeyed("keyed")}
            style={filterKeyed === "keyed" ? { background: "#52c41a", borderColor: "#389e0d", color: "#fff" } : {}}
          >
            Keyed ({allItems.length - pendingCount})
          </Button>
        </Button.Group>
        <Space>
          <Input.Search
            placeholder="Search by Accession No., HN, Patient, or Stain"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 320 }}
          />
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#e6f4ff", borderRadius: 8, border: "1px solid #91caff" }}>
          <CheckCircleOutlined style={{ color: "#1677ff" }} />
          <span><strong>{selectedRowKeys.length}</strong> selected</span>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={bulkLoading}
            onClick={handleBulkKey}
            style={{ background: "#52c41a", borderColor: "#389e0d" }}
          >
            Key Selected ({selectedRowKeys.length})
          </Button>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear Selection</Button>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="key"
        loading={loading}
        size="middle"
        bordered
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (record) => ({ disabled: record.is_hosxp_keyed }),
        }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No internal stains to key" }}
        rowClassName={(r) => (r.is_hosxp_keyed ? "hosxp-row-keyed" : "")}
      />
      <style>{`.hosxp-row-keyed td { background-color: #f6ffed !important; }`}</style>
    </>
  );
};

export default InternalHosxpKeyTab;
