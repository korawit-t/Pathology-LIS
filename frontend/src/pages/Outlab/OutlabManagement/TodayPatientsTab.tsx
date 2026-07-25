import React, { useEffect, useState } from "react";
import { Table, Tag, Button, Badge, Alert, Typography, message } from "antd";
import { CheckCircleOutlined, ReloadOutlined, BellOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import HisService from "../../../services/hisService";
import type { TodayPatientRow, TodayPatientItem } from "./types";

const { Text } = Typography;

interface TodayPatientsTabProps {
  refreshTrigger?: number;
}

export const TodayPatientsTab: React.FC<TodayPatientsTabProps> = ({ refreshTrigger }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TodayPatientRow[]>([]);
  // Controlled expand state: defaultExpandAllRows only applies against the
  // Table's *initial* dataSource, which is empty here since rows load async —
  // so real rows always rendered collapsed. Re-seeding this from every fresh
  // fetch keeps rows expanded by default while still letting the user
  // manually collapse one via the row's own expand toggle if they want.
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Not-yet-HosXP-keyed outlab items, already grouped by HN in one
      // backend query — replaces the old "fetch all runs, then N+1
      // /surgical-cases?search= per accession number" pattern, which was
      // the slow part of this tab (each search was a leading-wildcard ILIKE
      // full-table-scan, once per pending accession number).
      const byHn = await SurgicalBlockStainService.getPendingOutlabByHn();

      if (Object.keys(byHn).length === 0) { setRows([]); return; }

      // 2. Which of these HNs actually visited (checked in) today — one
      // batched HOSxP query (vn_stat), not a per-HN appointment lookup:
      // an appointment can be scheduled and never show up, so this checks
      // actual arrival instead.
      const { hns: visitingHns } = await HisService.getVisitsToday().catch(() => ({ hns: [] as string[] }));
      const visitingSet = new Set(visitingHns);

      // 3. Keep only patients who actually visited TODAY
      const result: TodayPatientRow[] = Object.entries(byHn)
        .filter(([hn]) => visitingSet.has(hn))
        .map(([hn, entry]) => ({ key: hn, hn, ...entry }));

      result.sort((a, b) => a.patient_name.localeCompare(b.patient_name));
      setRows(result);
      setExpandedKeys(result.map((r) => r.key));
    } catch {
      message.error("Failed to load today's patients");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyItem = async (detailId: number) => {
    try {
      await SurgicalBlockStainService.toggleHosxpKeyed(detailId, true);
      // Remove the item from local state immediately
      setRows((prev) =>
        prev
          .map((r) => ({ ...r, items: r.items.filter((d) => d.id !== detailId) }))
          .filter((r) => r.items.length > 0)
      );
      message.success("Marked as keyed");
    } catch {
      message.error("Failed to update");
    }
  };

  const handleKeyAll = async (row: TodayPatientRow) => {
    try {
      await Promise.all(row.items.map((d) => SurgicalBlockStainService.toggleHosxpKeyed(d.id, true)));
      setRows((prev) => prev.filter((r) => r.hn !== row.hn));
      message.success(`All ${row.items.length} items keyed for ${row.patient_name}`);
    } catch {
      message.error("Failed to update some items");
    }
  };

  useEffect(() => { fetchData(); }, [refreshTrigger]);

  const columns: ColumnsType<TodayPatientRow> = [
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 110,
      render: (t) => <Text code>{t}</Text>,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
      key: "patient_name",
    },
    {
      title: "Pending Stains",
      key: "pending",
      width: 120,
      render: (_, record) => (
        <Badge count={record.items.length} color="#722ed1" />
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      render: (_, record) => (
        <Button
          size="small"
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => handleKeyAll(record)}
        >
          Key All
        </Button>
      ),
    },
  ];

  return (
    <>
      {rows.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          icon={<BellOutlined />}
          style={{ marginBottom: 16 }}
          message={`${rows.length} patient(s) here today still have pending outlab stains — key in results now!`}
        />
      ) : !loading ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="No patients here today with pending outlab stains — all clear!"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary">
          Showing patients who visited on <Text strong>{dayjs().format("DD/MM/YYYY")}</Text> who have unkeyed outlab stains
        </Text>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refresh</Button>
      </div>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="key"
        loading={loading}
        pagination={false}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
          expandedRowRender: (record) => (
            <Table
              size="small"
              pagination={false}
              dataSource={record.items}
              rowKey="id"
              columns={[
                {
                  title: "Accession No.",
                  dataIndex: "accession_no",
                  width: 140,
                  render: (t) => <Text strong style={{ color: "#1890ff" }}>{t}</Text>,
                },
                {
                  title: "Block",
                  dataIndex: "block_code",
                  width: 80,
                  render: (t) => <Tag color="cyan">{t || "-"}</Tag>,
                },
                {
                  title: "Stain",
                  dataIndex: "stain_name",
                  render: (t) => <Tag color="purple">{t || "Unknown"}</Tag>,
                },
                {
                  title: "Destination Lab",
                  dataIndex: "destination_lab",
                  render: (t) => <Text type="secondary">{t || "-"}</Text>,
                },
                {
                  title: "",
                  key: "key_action",
                  width: 90,
                  render: (_: unknown, d: TodayPatientItem) => (
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleKeyItem(d.id)}
                    >
                      Key
                    </Button>
                  ),
                },
              ]}
            />
          ),
          rowExpandable: () => true,
        }}
        locale={{ emptyText: loading ? " " : "No patients here today with pending outlab stains" }}
      />
    </>
  );
};
