import React, { useEffect, useRef, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Input,
  Tooltip,
  Popconfirm,
  Checkbox,
} from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PrinterOutlined,
  ReloadOutlined,
  HistoryOutlined,
  EditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useReactToPrint } from "react-to-print";
import dayjs from "dayjs";
import SurgicalBlockStainService, { OutlabRun } from "../../../services/surgicalBlockStainService";
import SystemSettingService from "../../../services/systemSettingService";
import { OutlabRunPrint } from "../OutlabStainRun/OutlabRunPrint";
import BlockHistoryDrawer from "../../SurgicalBlock/components/BlockHistoryDrawer";
import { AccessionNoText } from "./components/OutlabCellRenderers";
import { useReceiveOutlabSlides } from "../../../hooks/useReceiveOutlabSlides";

const { Text } = Typography;

interface TrackingTabProps {
  refreshTrigger?: number;
  onReceived?: () => void;
}

export const TrackingTab: React.FC<TrackingTabProps> = ({ refreshTrigger, onReceived }) => {
  const { receiveSelected } = useReceiveOutlabSlides();
  const [runs, setRuns] = useState<OutlabRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [printRunData, setPrintRunData] = useState<OutlabRun | null>(null);
  const [historyBlock, setHistoryBlock] = useState<{ id: number | null; block_code?: string; accession_no?: string } | null>(null);
  const [editingTrackingId, setEditingTrackingId] = useState<number | null>(null);
  const [editingTrackingValue, setEditingTrackingValue] = useState("");
  const [searchAccession, setSearchAccession] = useState("");
  const [selectedDetailIds, setSelectedDetailIds] = useState<Record<number, Set<number>>>({});
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    SystemSettingService.getPublicSettings()
      .then((res) => setHospitalName(res.lab_name_en))
      // Intentionally silent — hospitalName is only used to label the printed
      // dispatch sheet; a blank label isn't worth an error toast here.
      .catch(() => {});
  }, []);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getOutlabRuns({ limit: 200 });
      setRuns(data);
    } catch {
      message.error("Failed to load outlab history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, [refreshTrigger]);

  const handleReceiveSelected = async (runId: number) => {
    const ids = Array.from(selectedDetailIds[runId] || []);
    if (ids.length === 0) return;
    await receiveSelected({ [runId]: ids });
    setSelectedDetailIds((prev) => ({ ...prev, [runId]: new Set() }));
    onReceived ? onReceived() : fetchRuns();
  };

  const handleDelete = async (runId: number) => {
    try {
      await SurgicalBlockStainService.deleteOutlabRun(runId);
      message.success("Outlab run cancelled — slides reverted to Pending");
      fetchRuns();
    } catch {
      message.error("Failed to cancel outlab run");
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Outlab_Dispatch_${dayjs().format("YYYYMMDD")}`,
  });

  const onPrintClick = (record: OutlabRun) => {
    setPrintRunData(record);
    setTimeout(() => handlePrint(), 150);
  };

  const saveTracking = async (runId: number) => {
    try {
      await SurgicalBlockStainService.updateOutlabRun(runId, { tracking_number: editingTrackingValue });
      message.success("Tracking number saved");
      setEditingTrackingId(null);
      fetchRuns();
    } catch {
      message.error("Failed to save tracking number");
    }
  };

  const filteredRuns = searchAccession.trim()
    ? runs.filter((r) => {
        const q = searchAccession.trim().toLowerCase();
        return (
          (r.run_no || "").toLowerCase().includes(q) ||
          (r.details || []).some((d) =>
            (d.accession_no || "").toLowerCase().includes(q)
          )
        );
      })
    : runs;

  const sentCount = runs.filter((r) => r.status === "sent").length;
  const partialCount = runs.filter((r) => r.status === "partial").length;
  const receivedCount = runs.filter((r) => r.status === "received").length;

  const columns: ColumnsType<OutlabRun> = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      key: "run_no",
      render: (text) => <Tag color="geekblue">{text}</Tag>,
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      key: "sent_at",
      render: (text) => text ? dayjs(text).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      key: "destination_lab",
      render: (text) => <Text strong>{text || "-"}</Text>,
    },
    {
      title: "Tracking No.",
      key: "tracking_number",
      onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
      render: (_, record) => {
        if (editingTrackingId === record.id) {
          return (
            <Space size={4}>
              <Input
                size="small"
                value={editingTrackingValue}
                onChange={(e) => setEditingTrackingValue(e.target.value)}
                onPressEnter={() => saveTracking(record.id)}
                style={{ width: 160 }}
                autoFocus
              />
              <Button size="small" type="primary" onClick={() => saveTracking(record.id)}>Save</Button>
              <Button size="small" onClick={() => setEditingTrackingId(null)}>Cancel</Button>
            </Space>
          );
        }
        return (
          <span
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => {
              setEditingTrackingId(record.id);
              setEditingTrackingValue(record.tracking_number || "");
            }}
          >
            <span style={{ color: record.tracking_number ? "#1677ff" : "#bfbfbf" }}>
              {record.tracking_number || "—"}
            </span>
            <EditOutlined style={{ fontSize: 11, color: "#8c8c8c" }} />
          </span>
        );
      },
    },
    {
      title: "Slide Count",
      key: "stain_count",
      render: (_, record) => (
        <Tag color="purple">{record.details?.length || 0} slides</Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (text, record) => {
        if (text === "received") {
          return (
            <Space direction="vertical" size={0}>
              <Tag color="success" icon={<CheckCircleOutlined />}>Returned</Tag>
              {record.received_at && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {dayjs(record.received_at).format("DD/MM/YYYY HH:mm")}
                </Text>
              )}
            </Space>
          );
        }
        if (text === "partial") {
          const receivedN = (record.details || []).filter((d) => d.received_at).length;
          const totalN = record.details?.length || 0;
          return (
            <Space direction="vertical" size={0}>
              <Tag color="gold" icon={<ClockCircleOutlined />}>Partially returned</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>{receivedN}/{totalN} slides</Text>
            </Space>
          );
        }
        return <Tag color="processing" icon={<ClockCircleOutlined />}>Awaiting return</Tag>;
      },
    },
    {
      title: "Actions",
      key: "action",
      width: 220,
      onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<PrinterOutlined style={{ color: "#722ed1" }} />}
            onClick={() => onPrintClick(record)}
          >
            Print
          </Button>
          {record.status === "sent" && (
            <Popconfirm
              title="Confirm cancellation?"
              description="Slides will revert to Pending status"
              onConfirm={() => handleDelete(record.id)}
              okText="Cancel Run"
              cancelText="Close"
              okButtonProps={{ danger: true }}
            >
              <Button danger type="text" size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <Tag color="processing" style={{ padding: "4px 12px", fontSize: 13 }}>
          <ClockCircleOutlined /> Pending at lab: {sentCount} run(s)
        </Tag>
        <Tag color="gold" style={{ padding: "4px 12px", fontSize: 13 }}>
          <ClockCircleOutlined /> Partially returned: {partialCount} run(s)
        </Tag>
        <Tag color="success" style={{ padding: "4px 12px", fontSize: 13 }}>
          <CheckCircleOutlined /> Received: {receivedCount} run(s)
        </Tag>
        <Input.Search
          placeholder="Search by Accession No."
          allowClear
          value={searchAccession}
          onChange={(e) => setSearchAccession(e.target.value)}
          onSearch={(v) => setSearchAccession(v)}
          style={{ width: 280, marginLeft: "auto" }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>
          Refresh
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={filteredRuns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
        rowClassName={(record) =>
          record.status === "received"
            ? "outlab-row-received"
            : record.status === "partial"
            ? "outlab-row-partial"
            : ""
        }
        onRow={(record) => ({
          style: (record.details?.length || 0) > 0 ? { cursor: "pointer" } : undefined,
        })}
        expandable={{
          expandRowByClick: true,
          expandIcon: () => null,
          expandedRowRender: (record) => {
            const grouped: Record<string, NonNullable<OutlabRun["details"]>> = {};
            (record.details || []).forEach((d) => {
              const acc = d.accession_no || "N/A";
              if (!grouped[acc]) grouped[acc] = [];
              grouped[acc].push(d);
            });
            const runSelected = selectedDetailIds[record.id] || new Set<number>();
            const toggleDetail = (detailId: number, checked: boolean) => {
              setSelectedDetailIds((prev) => {
                const next = new Set(prev[record.id] || []);
                if (checked) next.add(detailId); else next.delete(detailId);
                return { ...prev, [record.id]: next };
              });
            };
            const unreceivedIds = (record.details || []).filter((d) => !d.received_at).map((d) => d.id);
            const unreceivedCount = unreceivedIds.length;
            const allSelected = unreceivedCount > 0 && unreceivedIds.every((id) => runSelected.has(id));
            const toggleSelectAll = () => {
              setSelectedDetailIds((prev) => ({
                ...prev,
                [record.id]: allSelected ? new Set() : new Set(unreceivedIds),
              }));
            };
            return (
              <div style={{ padding: "8px 16px" }}>
                <Space style={{ marginBottom: 10, width: "100%", justifyContent: "space-between" }}>
                  <Text strong>Slides in this run:</Text>
                  {unreceivedCount > 0 && (
                    <Space size="small">
                      <Button size="small" onClick={toggleSelectAll}>
                        {allSelected ? "Deselect all" : "Select all"}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        disabled={runSelected.size === 0}
                        onClick={() => handleReceiveSelected(record.id)}
                      >
                        Receive selected ({runSelected.size})
                      </Button>
                    </Space>
                  )}
                </Space>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {Object.entries(grouped).map(([acc, details]) => {
                    const groupUnreceivedIds = details.filter((d) => !d.received_at).map((d) => d.id);
                    const groupAllSelected = groupUnreceivedIds.length > 0 && groupUnreceivedIds.every((id) => runSelected.has(id));
                    const groupSomeSelected = groupUnreceivedIds.some((id) => runSelected.has(id));
                    const toggleGroup = (checked: boolean) => {
                      setSelectedDetailIds((prev) => {
                        const next = new Set(prev[record.id] || []);
                        groupUnreceivedIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
                        return { ...prev, [record.id]: next };
                      });
                    };
                    return (
                    <div key={acc} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Space size={6} style={{ minWidth: 120, paddingTop: 2 }}>
                        {groupUnreceivedIds.length > 0 && (
                          <Checkbox
                            checked={groupAllSelected}
                            indeterminate={groupSomeSelected && !groupAllSelected}
                            onChange={(e) => toggleGroup(e.target.checked)}
                          />
                        )}
                        <AccessionNoText text={acc} />
                      </Space>
                      <Space wrap size={[8, 4]}>
                        {details.map((d) => (
                          <Space
                            key={d.id}
                            size={4}
                            style={{ border: "1px solid #f0f0f0", borderRadius: 4, padding: "2px 6px" }}
                          >
                            {!d.received_at ? (
                              <Checkbox
                                checked={runSelected.has(d.id)}
                                onChange={(e) => toggleDetail(d.id, e.target.checked)}
                              />
                            ) : (
                              <Tooltip title={`Received ${dayjs(d.received_at).format("DD/MM/YYYY HH:mm")}`}>
                                <CheckCircleOutlined style={{ color: "#52c41a" }} />
                              </Tooltip>
                            )}
                            <Tag
                              color="geekblue"
                              style={{ cursor: "pointer", margin: 0 }}
                              icon={<HistoryOutlined />}
                              onClick={() =>
                                setHistoryBlock({
                                  id: d.block_id || d.stain_order?.block_id || null,
                                  block_code: d.block_code || undefined,
                                  accession_no: d.accession_no || undefined,
                                })
                              }
                            >
                              {d.block_code || "-"} — {d.stain_order?.test?.name || "Unknown"}
                            </Tag>
                          </Space>
                        ))}
                      </Space>
                    </div>
                    );
                  })}
                </Space>
              </div>
            );
          },
          rowExpandable: (record) => (record.details?.length || 0) > 0,
        }}
        locale={{ emptyText: "No outlab runs yet" }}
      />

      <OutlabRunPrint ref={printRef} runData={printRunData} hospitalName={hospitalName} />

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
