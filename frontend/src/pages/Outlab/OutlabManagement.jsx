import React, { useEffect, useState, useRef } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Modal,
  Select,
  Tabs,
  Popconfirm,
  Badge,
  Divider,
  Alert,
  Descriptions,
  Input,
  Tooltip,
  Spin,
  Checkbox,
} from "antd";
import {
  ExperimentOutlined,
  SendOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PrinterOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  HistoryOutlined,
  ArrowRightOutlined,
  HourglassOutlined,
  FileSearchOutlined,
  BellOutlined,
  WarningOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useReactToPrint } from "react-to-print";
import api from "../../services/httpClient";
import SurgicalBlockService from "../../services/surgicalBlockService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import HisService from "../../services/hisService";
import SystemSettingService from "../../services/systemSettingService";
import { useAuth } from "../../hooks/useAuth";
import { OutlabRunPrint } from "./OutlabStainRun/OutlabRunPrint";
import PageContainer from "../../components/Layout/PageContainer";
import BlockHistoryDrawer from "../SurgicalBlock/components/BlockHistoryDrawer";
import dayjs from "dayjs";

const { Text, Title } = Typography;

// ─── Tab 1: Pending Queue (Send) ──────────────────────────────────────────────

export const PendingQueueTab = ({ onSent }) => {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [destinationLab, setDestinationLab] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [externalLabs, setExternalLabs] = useState([]);
  const [historyBlock, setHistoryBlock] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [caseMap, setCaseMap] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({ limit: 200 });
      const data = res.items || (Array.isArray(res) ? res : []);
      const outlabBlocks = data.filter((block) => {
        if (!block.stains || !Array.isArray(block.stains)) return false;
        return block.stains.some(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
      });
      setBlocks(outlabBlocks);

      const accNos = [...new Set(outlabBlocks.map((b) => b.accession_no).filter(Boolean))];
      if (accNos.length > 0) {
        const results = await Promise.all(
          accNos.map((acc) =>
            SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [] }))
          )
        );
        const map = {};
        accNos.forEach((acc, i) => {
          const c = results[i]?.items?.[0];
          if (c) {
            const today = dayjs();
            const age = c.patient?.birth_date
              ? today.diff(dayjs(c.patient.birth_date), "year")
              : null;
            map[acc] = {
              hn: c.hn || "-",
              patient_name: [c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "-",
              age,
              scheme: c.medical_scheme?.name || "-",
              hospital: c.hospital?.name || "-",
            };
          }
        });
        setCaseMap(map);
      }
    } catch {
      message.error("Failed to load block data");
    } finally {
      setLoading(false);
    }
  };

  const fetchExternalLabs = async () => {
    try {
      const res = await api.get("/external-labs", { params: { active_only: true } });
      setExternalLabs(res.data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchData();
    fetchExternalLabs();
  }, []);

  const selectedBlocks = blocks.filter((b) => selectedRowKeys.includes(b.id));
  const selectedStainItems = selectedBlocks.flatMap((b) =>
    (b.stains || [])
      .filter((s) => s.test?.is_external === true && s.status === "pending")
      .map((s) => ({
        blockLabel: `${b.specimen_label || ""}${b.block_no || ""}`,
        accessionNo: b.accession_no,
        stainName: s.test?.name || "Unknown",
        stainId: s.id,
      }))
  );

  const handleCreateRun = async () => {
    if (!destinationLab) {
      message.warning("Please select a destination lab");
      return;
    }
    if (selectedStainItems.length === 0) {
      message.warning("No stain items selected");
      return;
    }
    setSubmitting(true);
    try {
      await SurgicalBlockStainService.createOutlabRun({
        destination_lab: destinationLab,
        stain_ids: selectedStainItems.map((i) => i.stainId),
        tracking_number: trackingNumber || undefined,
      });
      message.success("Outlab run created successfully");
      setIsModalVisible(false);
      setDestinationLab(null);
      setTrackingNumber("");
      setSelectedRowKeys([]);
      fetchData();
      onSent?.();
    } catch {
      message.error("Failed to create outlab run");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: "Case / Block",
      key: "block_info",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 15 }}>
            {record.accession_no || record.specimen?.accession_no}
          </Text>
          <Tag color="cyan">
            {record.specimen_label}
            {record.block_no}
          </Tag>
          {record.is_decal && <Tag color="volcano" size="small">Decal</Tag>}
        </Space>
      ),
    },
    {
      title: "ผู้ป่วย",
      key: "patient_info",
      width: 180,
      render: (_, record) => {
        const info = caseMap[record.accession_no] || {};
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{info.patient_name || "-"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>HN: {info.hn || "-"}</Text>
            {info.age != null && <Text type="secondary" style={{ fontSize: 12 }}>อายุ {info.age} ปี</Text>}
          </Space>
        );
      },
    },
    {
      title: "สิทธิ / รพ.",
      key: "scheme_hospital",
      width: 150,
      render: (_, record) => {
        const info = caseMap[record.accession_no] || {};
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{info.scheme || "-"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{info.hospital || "-"}</Text>
          </Space>
        );
      },
    },
    {
      title: "Order Date",
      key: "order_date",
      width: 120,
      render: (_, record) => {
        const stains = (record.stains || []).filter(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
        const dates = stains.map((s) => s.created_at).filter(Boolean).sort();
        const date = dates[0];
        return date ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {dayjs(date).format("DD/MM/YYYY")}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: "Specimen",
      key: "specimen_name",
      render: (_, record) => (
        <Text type="secondary">{record.specimen_name || "-"}</Text>
      ),
    },
    {
      title: "Outlab Stains (pending)",
      key: "outlab_items",
      render: (_, record) => {
        const stains = (record.stains || []).filter(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
        return (
          <Space wrap size={4}>
            {stains.map((s) => (
              <Tag key={s.id} color="purple">
                {s.test?.name || "Unknown"}
                {s.test?.category ? ` (${s.test.category})` : ""}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "",
      key: "history",
      width: 48,
      render: (_, record) => (
        <Button
          type="text"
          icon={<HistoryOutlined style={{ color: "#8c8c8c" }} />}
          size="small"
          title="Block Timeline"
          onClick={(e) => {
            e.stopPropagation();
            setHistoryBlock({
              id: record.id,
              block_code: record.block_code || `${record.specimen_label || ""}${record.block_no || ""}`,
              accession_no: record.accession_no,
            });
          }}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refresh
          </Button>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary">{selectedRowKeys.length} block(s) selected / {selectedStainItems.length} stain(s)</Text>
          )}
        </Space>
        <Button
          type="primary"
          icon={<SendOutlined />}
          disabled={selectedRowKeys.length === 0}
          onClick={() => setIsModalVisible(true)}
        >
          Send Outlab ({selectedRowKeys.length})
        </Button>
      </div>

      <Table
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        columns={columns}
        dataSource={blocks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
        locale={{ emptyText: "No items pending outlab dispatch" }}
      />

      <BlockHistoryDrawer
        open={!!historyBlock}
        onClose={() => setHistoryBlock(null)}
        blockId={historyBlock?.id ?? null}
        blockCode={historyBlock?.block_code}
        accessionNo={historyBlock?.accession_no}
      />

      <Modal
        title="Confirm Outlab Dispatch"
        open={isModalVisible}
        onOk={handleCreateRun}
        confirmLoading={submitting}
        onCancel={() => { setIsModalVisible(false); setDestinationLab(null); setTrackingNumber(""); }}
        okText="Confirm Send"
        cancelText="Cancel"
        width={560}
      >
        <Space direction="vertical" style={{ width: "100%", marginBottom: 16, padding: 12, background: "#e6f7ff", borderRadius: 8, border: "1px solid #91d5ff" }}>
          <Text><strong>Operator:</strong> {user?.full_name}</Text>
          <Text><strong>Date / Time:</strong> {dayjs().format("DD/MM/YYYY HH:mm")}</Text>
        </Space>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Destination Lab:</Text>
          <Select
            placeholder="Select destination lab"
            value={destinationLab}
            onChange={setDestinationLab}
            style={{ width: "100%", marginTop: 8 }}
            showSearch
            options={externalLabs.map((lab) => ({ value: lab.name, label: lab.name }))}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong>เลขพัสดุขนส่ง (Tracking No.):</Text>
          <Input
            placeholder="กรอกเลขพัสดุ / Courier tracking number (ถ้ามี)"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            style={{ marginTop: 8 }}
            prefix={<ClockCircleOutlined style={{ color: "#8c8c8c" }} />}
          />
        </div>

        <Divider style={{ margin: "12px 0" }} />
        <Text strong>Stains to dispatch ({selectedStainItems.length} item(s)):</Text>
        <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, padding: "8px 12px", background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0" }}>
          {selectedStainItems.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: idx < selectedStainItems.length - 1 ? "1px dashed #e8e8e8" : "none" }}>
              <Text>{item.accessionNo} — <Text type="secondary">{item.blockLabel}</Text></Text>
              <Tag color="purple" style={{ margin: 0 }}>{item.stainName}</Tag>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

// ─── Tab 2: Tracking / Return ──────────────────────────────────────────────────

export const TrackingTab = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [printRunData, setPrintRunData] = useState(null);
  const [historyBlock, setHistoryBlock] = useState(null);
  const [editingTrackingId, setEditingTrackingId] = useState(null);
  const [editingTrackingValue, setEditingTrackingValue] = useState("");
  const [searchAccession, setSearchAccession] = useState("");
  const [selectedDetailIds, setSelectedDetailIds] = useState({});
  const printRef = useRef(null);

  useEffect(() => {
    SystemSettingService.getPublicSettings()
      .then((res) => setHospitalName(res.lab_name_en))
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

  const handleReceiveSelected = async (runId) => {
    const ids = Array.from(selectedDetailIds[runId] || []);
    if (ids.length === 0) return;
    try {
      await SurgicalBlockStainService.receiveOutlabRunDetails(runId, ids);
      message.success(`Recorded return of ${ids.length} slide(s)`);
      setSelectedDetailIds((prev) => ({ ...prev, [runId]: new Set() }));
      fetchRuns();
    } catch {
      message.error("Failed to record selected slide returns");
    }
  };

  const handleDelete = async (runId) => {
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

  const onPrintClick = (record) => {
    setPrintRunData(record);
    setTimeout(() => handlePrint(), 150);
  };

  const saveTracking = async (runId) => {
    try {
      await SurgicalBlockStainService.updateOutlabRun(runId, { tracking_number: editingTrackingValue });
      message.success("บันทึกเลขพัสดุสำเร็จ");
      setEditingTrackingId(null);
      fetchRuns();
    } catch {
      message.error("บันทึกไม่สำเร็จ");
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

  const columns = [
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
      title: "เลขพัสดุ",
      key: "tracking_number",
      onCell: () => ({ onClick: (e) => e.stopPropagation() }),
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
              <Button size="small" type="primary" onClick={() => saveTracking(record.id)}>บันทึก</Button>
              <Button size="small" onClick={() => setEditingTrackingId(null)}>ยกเลิก</Button>
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
      onCell: () => ({ onClick: (e) => e.stopPropagation() }),
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
            const grouped = {};
            (record.details || []).forEach((d) => {
              const acc = d.accession_no || "N/A";
              if (!grouped[acc]) grouped[acc] = [];
              grouped[acc].push(d);
            });
            const runSelected = selectedDetailIds[record.id] || new Set();
            const toggleDetail = (detailId, checked) => {
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
                    const toggleGroup = (checked) => {
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
                        <Text strong style={{ color: "#1890ff" }}>
                          {acc}
                        </Text>
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
                                  id: d.block_id || d.stain_order?.block_id,
                                  block_code: d.block_code,
                                  accession_no: d.accession_no,
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

// ─── Tab 3: By Case ───────────────────────────────────────────────────────────

export const CaseViewTab = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState([]);
  const [caseMap, setCaseMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [historyBlock, setHistoryBlock] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [receiving, setReceiving] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getOutlabRuns({ limit: 500 });
      setRuns(data);

      // Fetch patient/HN via SurgicalCaseService (same pattern as UnifiedAccession)
      const accNos = [...new Set(
        data.flatMap((run) => (run.details || []).map((d) => d.accession_no).filter(Boolean))
      )];
      if (accNos.length > 0) {
        const results = await Promise.all(
          accNos.map((acc) =>
            SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [] }))
          )
        );
        const map = {};
        accNos.forEach((acc, i) => {
          const c = results[i]?.items?.[0];
          if (c) {
            const nameParts = [c.patient?.name, c.patient?.ln].filter(Boolean);
            map[acc] = { hn: c.hn || "-", patient_name: nameParts.join(" ") || "-" };
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

  const handleReceiveSelected = async () => {
    if (selectedRowKeys.length === 0) return;
    const byRun = {};
    allItems.forEach((item) => {
      if (selectedRowKeys.includes(item.key) && !item.received_at) {
        (byRun[item.run_id] ??= []).push(item.key);
      }
    });
    const runIds = Object.keys(byRun);
    if (runIds.length === 0) return;

    setReceiving(true);
    try {
      const results = await Promise.allSettled(
        runIds.map((runId) =>
          SurgicalBlockStainService.receiveOutlabRunDetails(Number(runId), byRun[runId])
        )
      );
      const failedRuns = runIds.filter((_, i) => results[i].status === "rejected");
      if (failedRuns.length === 0) {
        message.success(`Recorded return of ${selectedRowKeys.length} slide(s)`);
      } else if (failedRuns.length < runIds.length) {
        message.warning(`Some slides recorded, but failed for run(s): ${failedRuns.join(", ")}`);
      } else {
        message.error("Failed to record selected slide returns");
      }
      setSelectedRowKeys([]);
      fetchRuns();
    } finally {
      setReceiving(false);
    }
  };

  const allItems = runs.flatMap((run) =>
    (run.details || []).map((d) => {
      const caseInfo = caseMap[d.accession_no] || {};
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

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allItems.filter((item) =>
        item.accession_no.toLowerCase().includes(q) ||
        item.hn.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q)
      )
    : allItems;

  const sorted = [...filtered].sort(
    (a, b) =>
      a.accession_no.localeCompare(b.accession_no) ||
      a.block_code.localeCompare(b.block_code)
  );

  // rowSpan grouping by accession_no
  const rowSpanMap = {};
  sorted.forEach((item, idx) => {
    if (idx === 0 || item.accession_no !== sorted[idx - 1].accession_no) {
      let count = 1;
      while (idx + count < sorted.length && sorted[idx + count].accession_no === item.accession_no) {
        count++;
      }
      rowSpanMap[idx] = count;
    } else {
      rowSpanMap[idx] = 0;
    }
  });

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      fixed: "left",
      onCell: (_, idx) => ({ rowSpan: rowSpanMap[idx] ?? 1 }),
      render: (text) => <Text strong style={{ color: "#1890ff" }}>{text}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 100,
      onCell: (_, idx) => ({ rowSpan: rowSpanMap[idx] ?? 1 }),
      render: (text) => <Text>{text}</Text>,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
      key: "patient_name",
      width: 180,
      onCell: (_, idx) => ({ rowSpan: rowSpanMap[idx] ?? 1 }),
      render: (text) => <Text>{text}</Text>,
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
                id: record.block_id,
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
        <Text type="secondary">{sorted.length} stain item(s) total</Text>
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
        pagination={{ pageSize: 20, showSizeChanger: true }}
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

// ─── Main Page ──────────────────────────────────────────────────────────────────

// ─── Tab 4: HosXP Key ─────────────────────────────────────────────────────────

export const HosxpKeyTab = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState([]);
  const [caseMap, setCaseMap] = useState({});
  const [appointmentMap, setAppointmentMap] = useState({}); // hn -> appointments[]
  const [loadingAppt, setLoadingAppt] = useState({});       // hn -> bool
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterKeyed, setFilterKeyed] = useState("all"); // "all" | "pending" | "keyed"
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchAppointments = async (hn) => {
    if (!hn || hn === "-" || appointmentMap[hn] !== undefined) return;
    setLoadingAppt((prev) => ({ ...prev, [hn]: true }));
    try {
      const data = await HisService.getAppointments(hn);
      setAppointmentMap((prev) => ({ ...prev, [hn]: data }));
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
      )];
      if (accNos.length > 0) {
        const results = await Promise.all(
          accNos.map((acc) =>
            SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [] }))
          )
        );
        const map = {};
        accNos.forEach((acc, i) => {
          const c = results[i]?.items?.[0];
          if (c) {
            const nameParts = [c.patient?.name, c.patient?.ln].filter(Boolean);
            map[acc] = { hn: c.hn || "-", patient_name: nameParts.join(" ") || "-" };
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

  const allItems = runs.flatMap((run) =>
    (run.details || []).map((d) => {
      const caseInfo = caseMap[d.accession_no] || {};
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

  const handleToggleHosxp = async (record) => {
    const next = !record.is_hosxp_keyed;
    try {
      await SurgicalBlockStainService.toggleHosxpKeyed(record.key, next);
      setRuns((prev) =>
        prev.map((run) => ({
          ...run,
          details: run.details.map((d) =>
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
        selectedRowKeys.map((id) => SurgicalBlockStainService.toggleHosxpKeyed(id, true))
      );
      setRuns((prev) =>
        prev.map((run) => ({
          ...run,
          details: run.details.map((d) =>
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

  const columns = [
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
          <span>เลือก <strong>{selectedRowKeys.length}</strong> รายการ</span>
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
          <Button size="small" onClick={() => setSelectedRowKeys([])}>ยกเลิกการเลือก</Button>
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
                    render: (v) => v ? v.substring(0, 5) : "-",
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

// ─── Tab 5: Today's Patients ──────────────────────────────────────────────────

export const TodayPatientsTab = ({ refreshTrigger }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  // Controlled expand state: defaultExpandAllRows only applies against the
  // Table's *initial* dataSource, which is empty here since rows load async —
  // so real rows always rendered collapsed. Re-seeding this from every fresh
  // fetch keeps rows expanded by default while still letting the user
  // manually collapse one via the row's own expand toggle if they want.
  const [expandedKeys, setExpandedKeys] = useState([]);
  const today = dayjs().format("YYYY-MM-DD");

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. All outlab runs → unkeyed detail items
      const runs = await SurgicalBlockStainService.getOutlabRuns({ limit: 500 });
      const unkeyedDetails = runs.flatMap((run) =>
        (run.details || [])
          .filter((d) => !d.is_hosxp_keyed)
          .map((d) => ({ ...d, run_no: run.run_no, destination_lab: run.destination_lab }))
      );

      if (unkeyedDetails.length === 0) { setRows([]); return; }

      // 2. Resolve HN for each accession number
      const accNos = [...new Set(unkeyedDetails.map((d) => d.accession_no).filter(Boolean))];
      const caseResults = await Promise.all(
        accNos.map((acc) =>
          SurgicalCaseService.getCases({ search: acc, limit: 1 }).catch(() => ({ items: [] }))
        )
      );
      const accToCase = {};
      accNos.forEach((acc, i) => {
        const c = caseResults[i]?.items?.[0];
        if (c) {
          accToCase[acc] = {
            hn: c.hn || "-",
            patient_name: [c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "-",
          };
        }
      });

      // 3. Group unkeyed items by HN
      const byHn = {};
      unkeyedDetails.forEach((d) => {
        const info = accToCase[d.accession_no];
        if (!info || info.hn === "-") return;
        if (!byHn[info.hn]) byHn[info.hn] = { hn: info.hn, patient_name: info.patient_name, items: [] };
        byHn[info.hn].items.push(d);
      });

      // 4. Fetch today's appointments for each HN (in parallel)
      const hns = Object.keys(byHn);
      const apptResults = await Promise.all(
        hns.map((hn) => HisService.getAppointments(hn).catch(() => []))
      );

      // 5. Keep only patients with an appointment TODAY
      const result = [];
      hns.forEach((hn, i) => {
        const todayAppts = (apptResults[i] || []).filter(
          (a) => a.nextdate && dayjs(a.nextdate).format("YYYY-MM-DD") === today
        );
        if (todayAppts.length === 0) return;
        const earliest = [...todayAppts].sort((a, b) =>
          (a.nexttime || "").localeCompare(b.nexttime || "")
        )[0];
        result.push({
          key: hn,
          hn,
          patient_name: byHn[hn].patient_name,
          appointments: todayAppts,
          earliest_time: earliest?.nexttime?.substring(0, 5) || "-",
          clinic: earliest?.department || earliest?.contact_point || "-",
          items: byHn[hn].items,
        });
      });

      result.sort((a, b) => a.earliest_time.localeCompare(b.earliest_time));
      setRows(result);
      setExpandedKeys(result.map((r) => r.key));
    } catch {
      message.error("Failed to load today's patients");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyItem = async (detailId) => {
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

  const handleKeyAll = async (row) => {
    try {
      await Promise.all(row.items.map((d) => SurgicalBlockStainService.toggleHosxpKeyed(d.id, true)));
      setRows((prev) => prev.filter((r) => r.hn !== row.hn));
      message.success(`All ${row.items.length} items keyed for ${row.patient_name}`);
    } catch {
      message.error("Failed to update some items");
    }
  };

  useEffect(() => { fetchData(); }, [refreshTrigger]);

  const urgentCount = rows.filter((r) => {
    if (r.earliest_time === "-") return false;
    const [h, m] = r.earliest_time.split(":").map(Number);
    const apptMinutes = h * 60 + m;
    const nowMinutes = dayjs().hour() * 60 + dayjs().minute();
    return apptMinutes - nowMinutes <= 120 && apptMinutes >= nowMinutes;
  }).length;

  const columns = [
    {
      title: "Appt. Time",
      dataIndex: "earliest_time",
      key: "time",
      width: 100,
      render: (t, record) => {
        const [h, m] = (t || "").split(":").map(Number);
        const apptMinutes = h * 60 + m;
        const nowMinutes = dayjs().hour() * 60 + dayjs().minute();
        const isUrgent = apptMinutes - nowMinutes <= 120 && apptMinutes >= nowMinutes;
        const isPast = apptMinutes < nowMinutes;
        return (
          <Text strong style={{ color: isPast ? "#8c8c8c" : isUrgent ? "#ff4d4f" : "#1890ff", fontSize: 15 }}>
            {isPast ? <s>{t}</s> : t}
            {isUrgent && <WarningOutlined style={{ marginLeft: 4, color: "#ff4d4f" }} />}
          </Text>
        );
      },
    },
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
      title: "Clinic",
      dataIndex: "clinic",
      key: "clinic",
      render: (t) => <Text type="secondary">{t}</Text>,
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
          type={urgentCount > 0 ? "error" : "warning"}
          showIcon
          icon={<BellOutlined />}
          style={{ marginBottom: 16 }}
          message={
            urgentCount > 0
              ? `⚠ ${urgentCount} patient(s) arriving within 2 hours — key in results now!`
              : `${rows.length} patient(s) have appointments today with pending outlab stains`
          }
        />
      ) : !loading ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="No patients coming today with pending outlab stains — all clear!"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary">
          Showing patients with appointments on <Text strong>{dayjs().format("DD/MM/YYYY")}</Text> who have unkeyed outlab stains
        </Text>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refresh</Button>
      </div>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="key"
        loading={loading}
        pagination={false}
        rowClassName={(r) => {
          const [h, m] = (r.earliest_time || "").split(":").map(Number);
          const apptMinutes = h * 60 + m;
          const nowMinutes = dayjs().hour() * 60 + dayjs().minute();
          return apptMinutes - nowMinutes <= 120 && apptMinutes >= nowMinutes
            ? "today-patient-urgent"
            : "";
        }}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys),
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
                  render: (_, d) => (
                    <Tag color="purple">{d.stain_order?.test?.name || "Unknown"}</Tag>
                  ),
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
                  render: (_, d) => (
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
        locale={{ emptyText: loading ? " " : "No patients with today's appointments found" }}
      />

      <style>{`
        .today-patient-urgent td {
          background-color: #fff1f0 !important;
        }
      `}</style>
    </>
  );
};

const OutlabManagement = () => {
  const [activeTab, setActiveTab] = useState("queue");
  const [sentTrigger, setSentTrigger] = useState(0);

  const handleSent = () => {
    setSentTrigger((n) => n + 1);
    setActiveTab("tracking");
  };

  const items = [
    {
      key: "queue",
      label: (
        <span>
          <SendOutlined /> Send to Outlab
        </span>
      ),
      children: <PendingQueueTab onSent={handleSent} />,
    },
    {
      key: "tracking",
      label: (
        <span>
          <UnorderedListOutlined /> Tracking / Receive
        </span>
      ),
      children: <TrackingTab refreshTrigger={sentTrigger} />,
    },
    {
      key: "by-case",
      label: (
        <span>
          <FileSearchOutlined /> By Case
        </span>
      ),
      children: <CaseViewTab refreshTrigger={sentTrigger} />,
    },
    {
      key: "hosxp-key",
      label: (
        <span>
          <CheckCircleOutlined /> HosXP Key
        </span>
      ),
      children: <HosxpKeyTab refreshTrigger={sentTrigger} />,
    },
    {
      key: "today",
      label: (
        <span>
          <BellOutlined /> Today's Patients
        </span>
      ),
      children: <TodayPatientsTab refreshTrigger={sentTrigger} />,
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          Outlab Management
        </Title>
      }
      subTitle="Manage external slide dispatch and track slide returns"
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        size="large"
        tabBarStyle={{ marginBottom: 16, borderBottom: "1px solid #f0f0f0" }}
      />

      <style>{`
        .outlab-row-received td {
          background-color: #f6ffed !important;
        }
        .outlab-row-partial td {
          background-color: #fffbe6 !important;
        }
        .hosxp-row-keyed td {
          background-color: #f6ffed !important;
          opacity: 0.7;
        }
      `}</style>
    </PageContainer>
  );
};

export default OutlabManagement;
