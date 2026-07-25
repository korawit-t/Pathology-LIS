import React, { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Input,
  Segmented,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import SurgicalBlockStainService, { OutlabRun } from "../../../services/surgicalBlockStainService";
import { useCaseInfoByAccession } from "../../../hooks/useCaseInfoByAccession";
import { useReceiveOutlabSlides } from "../../../hooks/useReceiveOutlabSlides";
import BlockHistoryDrawer from "../../SurgicalBlock/components/BlockHistoryDrawer";
import { formatPatientName } from "../../../utils/patientName";
import { AccessionNoText, BlockTag } from "./components/OutlabCellRenderers";
import type { CaseInfo } from "./types";

const { Text } = Typography;

interface CaseViewItem {
  key: number;
  run_id: number;
  accession_no: string;
  hn: string;
  patient_name: string;
  block_code: string;
  block_id?: number | null;
  stain_name: string;
  stain_category: string;
  destination_lab?: string;
  run_no?: string;
  sent_at?: string;
  run_status: string;
  received_at?: string | null;
  tracking_number?: string;
  received_by_name?: string;
}

interface CaseViewTabProps {
  refreshTrigger?: number;
  onReceived?: () => void;
}

export const CaseViewTab: React.FC<CaseViewTabProps> = ({ refreshTrigger, onReceived }) => {
  const { resolveCaseInfo } = useCaseInfoByAccession();
  const { receiveSelected, receiving } = useReceiveOutlabSlides();
  const [runs, setRuns] = useState<OutlabRun[]>([]);
  const [caseMap, setCaseMap] = useState<Record<string, CaseInfo>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [historyBlock, setHistoryBlock] = useState<{ id: number; block_code?: string; accession_no?: string } | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterReceived, setFilterReceived] = useState<"all" | "unreceived" | "received">("unreceived");

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getOutlabRuns({ limit: 500 });
      setRuns(data);

      // Fetch patient/HN via SurgicalCaseService (same pattern as UnifiedAccession)
      const accNos = data.flatMap((run) => (run.details || []).map((d) => d.accession_no));
      const caseByAcc = await resolveCaseInfo(accNos);
      const map: Record<string, CaseInfo> = {};
      Object.entries(caseByAcc).forEach(([acc, c]) => {
        map[acc] = { hn: c.hn || "-", patient_name: formatPatientName(c.patient) };
      });
      setCaseMap(map);
    } catch {
      message.error("Failed to load outlab data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, [refreshTrigger]);

  const allItems: CaseViewItem[] = runs.flatMap((run) =>
    (run.details || []).map((d) => {
      const caseInfo = caseMap[d.accession_no || ""] || ({} as Partial<CaseInfo>);
      return {
      key: d.id,
      run_id: run.id,
      accession_no: d.accession_no || "-",
      hn: caseInfo.hn || d.hn || "-",
      patient_name: caseInfo.patient_name || d.patient_name || "-",
      block_code: d.block_code || "-",
      block_id: d.block_id ?? d.stain_order?.block_id,
      stain_name: d.stain_order?.test?.name || "Unknown",
      stain_category: d.stain_order?.test?.category || "",
      destination_lab: run.destination_lab,
      run_no: run.run_no,
      sent_at: run.sent_at,
      run_status: run.status,
      received_at: d.received_at,
      tracking_number: run.tracking_number,
      received_by_name: run.received_by_name,
    }; })
  );

  const handleReceiveSelected = async () => {
    if (selectedRowKeys.length === 0) return;
    const byRun: Record<string, number[]> = {};
    allItems.forEach((item) => {
      if (selectedRowKeys.includes(item.key) && !item.received_at) {
        (byRun[item.run_id] ??= []).push(item.key);
      }
    });
    await receiveSelected(byRun);
    setSelectedRowKeys([]);
    onReceived ? onReceived() : fetchRuns();
  };

  const unreceivedCount = allItems.filter((item) => !item.received_at).length;
  const receivedCount = allItems.length - unreceivedCount;

  const byReceived = allItems.filter((item) => {
    if (filterReceived === "unreceived") return !item.received_at;
    if (filterReceived === "received") return !!item.received_at;
    return true;
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? byReceived.filter((item) =>
        item.accession_no.toLowerCase().includes(q) ||
        item.hn.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q)
      )
    : byReceived;

  const sorted = [...filtered].sort(
    (a, b) =>
      a.accession_no.localeCompare(b.accession_no) ||
      a.block_code.localeCompare(b.block_code)
  );

  const columns: ColumnsType<CaseViewItem> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      fixed: "left",
      render: (text) => <AccessionNoText text={text} />,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 100,
      render: (text) => <Text>{text}</Text>,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
      key: "patient_name",
      width: 180,
      render: (text) => <Text>{text}</Text>,
    },
    {
      title: "Block",
      dataIndex: "block_code",
      key: "block_code",
      width: 80,
      render: (text) => <BlockTag text={text} />,
    },
    {
      title: "Stain",
      key: "stain",
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          <Tag color="purple">{record.stain_name}</Tag>
          {record.stain_category && (
            <Text type="secondary" style={{ fontSize: 11 }}>{record.stain_category}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      key: "destination_lab",
      width: 150,
      render: (text) => <Text>{text || "-"}</Text>,
    },
    {
      title: "Run No.",
      dataIndex: "run_no",
      key: "run_no",
      width: 100,
      render: (text) => <Tag color="geekblue">{text}</Tag>,
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      key: "sent_at",
      width: 150,
      render: (text) => text ? dayjs(text).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Tracking No.",
      dataIndex: "tracking_number",
      key: "tracking_number",
      width: 140,
      render: (text) => text ? <Text code>{text}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Received By",
      dataIndex: "received_by_name",
      key: "received_by_name",
      width: 140,
      render: (text) => text || <Text type="secondary">—</Text>,
    },
    {
      title: "Status",
      key: "run_status",
      width: 160,
      fixed: "right",
      render: (_, record) => {
        if (record.received_at) {
          return (
            <div>
              <Tag color="success" icon={<CheckCircleOutlined />}>Returned</Tag>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {dayjs(record.received_at).format("DD/MM/YYYY HH:mm")}
                </Text>
              </div>
            </div>
          );
        }
        return <Tag color="processing" icon={<ClockCircleOutlined />}>Awaiting return</Tag>;
      },
    },
    {
      title: "",
      key: "history",
      width: 40,
      render: (_, record) =>
        record.block_id ? (
          <Button
            type="text"
            icon={<HistoryOutlined style={{ color: "#8c8c8c" }} />}
            size="small"
            title="Block Timeline"
            onClick={() =>
              setHistoryBlock({
                id: record.block_id as number,
                block_code: record.block_code,
                accession_no: record.accession_no,
              })
            }
          />
        ) : null,
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Segmented
            value={filterReceived}
            onChange={(v) => setFilterReceived(v as "all" | "unreceived" | "received")}
            options={[
              { label: `All (${allItems.length})`, value: "all" },
              { label: `Unreceived (${unreceivedCount})`, value: "unreceived" },
              { label: `Received (${receivedCount})`, value: "received" },
            ]}
          />
          <Text type="secondary">{sorted.length} stain item(s)</Text>
        </Space>
        <Space>
          <Button
            type="primary"
            disabled={selectedRowKeys.length === 0}
            loading={receiving}
            onClick={handleReceiveSelected}
          >
            Receive selected ({selectedRowKeys.length})
          </Button>
          <Input.Search
            placeholder="Search by Accession No., HN, or Patient name"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => setSearch(v)}
            style={{ width: 280 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={sorted}
        rowKey="key"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (record) => ({ disabled: !!record.received_at }),
        }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        rowClassName={(record) => record.received_at ? "outlab-row-received" : ""}
        locale={{ emptyText: "No outlab stain items found" }}
        scroll={{ x: "max-content", y: "calc(100vh - 340px)" }}
        sticky
      />

      <BlockHistoryDrawer
        open={!!historyBlock}
        onClose={() => setHistoryBlock(null)}
        blockId={historyBlock?.id ?? null}
        blockCode={historyBlock?.block_code}
        accessionNo={historyBlock?.accession_no}
      />
    </>
  );
};
