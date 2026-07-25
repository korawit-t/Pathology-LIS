import React, { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Input,
  Tooltip,
  Spin,
} from "antd";
import { CheckCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import SurgicalBlockStainService, { OutlabRun } from "../../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import HisService from "../../../services/hisService";
import { formatPatientName } from "../../../utils/patientName";
import type { CaseInfo, OutlabAppointment } from "./types";

const { Text } = Typography;

interface HosxpKeyItem {
  key: number;
  accession_no: string;
  hn: string;
  patient_name: string;
  block_code: string;
  stain_name: string;
  is_hosxp_keyed: boolean;
  hosxp_keyed_at?: string | null;
}

interface HosxpKeyTabProps {
  refreshTrigger?: number;
}

export const HosxpKeyTab: React.FC<HosxpKeyTabProps> = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState<OutlabRun[]>([]);
  const [caseMap, setCaseMap] = useState<Record<string, CaseInfo>>({});
  const [appointmentMap, setAppointmentMap] = useState<Record<string, OutlabAppointment[]>>({});
  const [loadingAppt, setLoadingAppt] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterKeyed, setFilterKeyed] = useState<"all" | "pending" | "keyed">("all");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchAppointments = async (hn: string) => {
    if (!hn || hn === "-" || appointmentMap[hn] !== undefined) return;
    setLoadingAppt((prev) => ({ ...prev, [hn]: true }));
    try {
      const data = await HisService.getAppointments(hn);
      setAppointmentMap((prev) => ({ ...prev, [hn]: data as unknown as OutlabAppointment[] }));
    } catch {
      setAppointmentMap((prev) => ({ ...prev, [hn]: [] }));
    } finally {
      setLoadingAppt((prev) => ({ ...prev, [hn]: false }));
    }
  };

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getOutlabRuns({ limit: 500 });
      setRuns(data);

      const accNos = [...new Set(
        data.flatMap((run) => (run.details || []).map((d) => d.accession_no).filter(Boolean))
      )] as string[];
      if (accNos.length > 0) {
        const results = await Promise.all(
          accNos.map((acc) =>
            SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [], total: 0 }))
          )
        );
        const map: Record<string, CaseInfo> = {};
        accNos.forEach((acc, i) => {
          const c = results[i]?.items?.[0];
          if (c) {
            map[acc] = { hn: c.hn || "-", patient_name: formatPatientName(c.patient) };
          }
        });
        setCaseMap(map);
      }
    } catch {
      message.error("Failed to load outlab data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, [refreshTrigger]);

  const allItems: HosxpKeyItem[] = runs.flatMap((run) =>
    (run.details || []).map((d) => {
      const caseInfo = caseMap[d.accession_no || ""] || ({} as Partial<CaseInfo>);
      return {
        key: d.id,
        accession_no: d.accession_no || "-",
        hn: caseInfo.hn || "-",
        patient_name: caseInfo.patient_name || "-",
        block_code: d.block_code || "-",
        stain_name: d.stain_order?.test?.name || "Unknown",
        is_hosxp_keyed: !!d.is_hosxp_keyed,
        hosxp_keyed_at: d.hosxp_keyed_at,
      };
    })
  );

  const handleToggleHosxp = async (record: HosxpKeyItem) => {
    const next = !record.is_hosxp_keyed;
    try {
      await SurgicalBlockStainService.toggleHosxpKeyed(record.key, next);
      setRuns((prev) =>
        prev.map((run) => ({
          ...run,
          details: (run.details || []).map((d) =>
            d.id === record.key ? { ...d, is_hosxp_keyed: next } : d
          ),
        }))
      );
    } catch {
      message.error("Failed to update HosXP flag");
    }
  };

  const handleBulkKey = async () => {
    if (selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedRowKeys.map((id) => SurgicalBlockStainService.toggleHosxpKeyed(Number(id), true))
      );
      setRuns((prev) =>
        prev.map((run) => ({
          ...run,
          details: (run.details || []).map((d) =>
            selectedRowKeys.includes(d.id) ? { ...d, is_hosxp_keyed: true } : d
          ),
        }))
      );
      message.success(`Keyed ${selectedRowKeys.length} item(s)`);
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
    .filter((item) =>
      !q ||
      item.accession_no.toLowerCase().includes(q) ||
      item.hn.toLowerCase().includes(q) ||
      item.patient_name.toLowerCase().includes(q)
    );

  const pendingCount = allItems.filter((i) => !i.is_hosxp_keyed).length;

  const columns: ColumnsType<HosxpKeyItem> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      sorter: (a, b) => (a.accession_no || "").localeCompare(b.accession_no || ""),
      defaultSortOrder: "ascend",
      render: (text) => <Text strong style={{ color: "#1890ff" }}>{text}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 100,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
      key: "patient_name",
      width: 180,
    },
    {
      title: "Block",
      dataIndex: "block_code",
      key: "block_code",
      width: 80,
      render: (text) => <Tag color="cyan">{text}</Tag>,
    },
    {
      title: "Stain",
      dataIndex: "stain_name",
      key: "stain_name",
      width: 160,
      render: (text) => <Tag color="purple">{text}</Tag>,
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
            onClick={() => handleToggleHosxp(record)}
            style={record.is_hosxp_keyed
              ? { background: "#52c41a", borderColor: "#389e0d", color: "#fff" }
              : { color: "#bfbfbf" }}
          >
            {record.is_hosxp_keyed ? "Keyed" : "Key"}
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
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
        </Space>
        <Space>
          <Input.Search
            placeholder="Search by Accession No., HN, or Patient name"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>Refresh</Button>
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
        scroll={{ x: "max-content", y: "calc(100vh - 340px)" }}
        sticky
        locale={{ emptyText: "No items found" }}
        rowClassName={(r) => r.is_hosxp_keyed ? "hosxp-row-keyed" : ""}
        expandable={{
          onExpand: (expanded, record) => {
            if (expanded) fetchAppointments(record.hn);
          },
          expandedRowRender: (record) => {
            const appts = appointmentMap[record.hn];
            if (loadingAppt[record.hn]) return <Spin size="small" style={{ padding: 12 }} />;
            if (!appts || appts.length === 0)
              return <Text type="secondary" style={{ padding: "8px 12px", display: "block" }}>No appointments found in HosXP</Text>;
            return (
              <Table
                dataSource={appts}
                rowKey="oapp_id"
                size="small"
                pagination={false}
                style={{ margin: "4px 0" }}
                columns={[
                  {
                    title: "Appointment Date",
                    dataIndex: "nextdate",
                    width: 150,
                    render: (v) => v ? <Text strong>{dayjs(v).format("DD/MM/YYYY")}</Text> : "-",
                  },
                  {
                    title: "Time",
                    dataIndex: "nexttime",
                    width: 80,
                    render: (v) => v ? String(v).substring(0, 5) : "-",
                  },
                  {
                    title: "Clinic",
                    dataIndex: "department",
                    width: 200,
                    render: (v, row) => v || row.contact_point || "-",
                  },
                  {
                    title: "Cause",
                    dataIndex: "app_cause",
                    render: (v) => <Text type="secondary">{v || "-"}</Text>,
                  },
                  {
                    title: "Note",
                    dataIndex: "note",
                    render: (v) => <Text type="secondary">{v || "-"}</Text>,
                  },
                ]}
              />
            );
          },
        }}
      />
    </>
  );
};
