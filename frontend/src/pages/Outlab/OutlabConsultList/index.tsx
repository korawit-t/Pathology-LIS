import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table, Tag, Input, Space, Button, Typography, message, Modal, Select,
  Popconfirm, Tabs, Badge, Segmented, Tooltip, Upload, DatePicker,
} from "antd";
import {
  SendOutlined, UnorderedListOutlined, CheckCircleOutlined, DeleteOutlined,
  ReloadOutlined, ClockCircleOutlined, InboxOutlined, SearchOutlined,
  GlobalOutlined, EditOutlined, UploadOutlined, FilePdfOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import PageContainer from "../../../components/Layout/PageContainer";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import OutlabConsultRunService, {
  OutlabConsultRunResponse,
  OutlabConsultRunDetailResponse,
} from "../../../services/outlabConsultRunService";
import api from "../../../services/httpClient";
import { useAuth } from "../../../hooks/useAuth";
import logger from "../../../utils/logger";
import { usePdfPageSelector } from "../../../components/PdfPageSelector/usePdfPageSelector";
import PdfPageThumbnailStrip from "../../../components/PdfPageSelector/PdfPageThumbnailStrip";
import PdfPagePreviewPane from "../../../components/PdfPageSelector/PdfPagePreviewPane";

const { Text, Title } = Typography;

interface ConsultCase {
  id: number;
  _key: string;
  case_type: "surgical" | "gyne" | "nongyne";
  accession_no?: string;
  hn?: string;
  patient_name: string;
  status?: string;
  consult_status?: string;
}

interface ExternalLab { id: number; name: string }

const TYPE_COLOR: Record<string, string> = {
  surgical: "blue",
  gyne: "green",
  nongyne: "orange",
};

// ─── Tab 1: Send to Consult ───────────────────────────────────────────────────

const SendTab: React.FC<{ onSent: () => void }> = ({ onSent }) => {
  const { user } = useAuth();
  const [caseType, setCaseType] = useState<"surgical" | "gyne" | "nongyne">("surgical");
  const [consultStatus, setConsultStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<ConsultCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [externalLabs, setExternalLabs] = useState<ExternalLab[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [destinationLab, setDestinationLab] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalBlocks, setModalBlocks] = useState<Record<number, string[]>>({});
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  const PAGE_SIZE = 20;

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        is_out_lab_consult: true,
        consult_status: consultStatus || undefined,
      };
      let res: { items: ConsultCase[]; total: number } | null = null;
      if (caseType === "surgical") {
        const r = await SurgicalCaseService.getCases(params as Parameters<typeof SurgicalCaseService.getCases>[0]);
        res = {
          items: (r.items || []).map((c: any) => ({
            id: c.id,
            _key: `s-${c.id}`,
            case_type: "surgical" as const,
            accession_no: c.accession_no,
            hn: c.hn,
            patient_name: [c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "—",
            status: c.status,
            consult_status: c.consult_status,
          })),
          total: r.total || 0,
        };
      } else if (caseType === "gyne") {
        const r = await GyneCytologyCaseService.getAll(params as any);
        res = {
          items: (r.items || []).map((c: any) => ({
            id: c.id,
            _key: `g-${c.id}`,
            case_type: "gyne" as const,
            accession_no: c.accession_no,
            hn: c.hn,
            patient_name: [c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "—",
            status: c.status,
            consult_status: c.consult_status,
          })),
          total: r.total || 0,
        };
      } else {
        const r = await NongyneCytologyCaseService.getAll(params as any);
        res = {
          items: (r.items || []).map((c: any) => ({
            id: c.id,
            _key: `n-${c.id}`,
            case_type: "nongyne" as const,
            accession_no: c.accession_no,
            hn: c.hn,
            patient_name: [c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "—",
            status: c.status,
            consult_status: c.consult_status,
          })),
          total: r.total || 0,
        };
      }
      setCases(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error("Fetch consult cases error:", err);
      message.error("Failed to load cases");
    } finally {
      setLoading(false);
    }
  }, [caseType, consultStatus, search, page]);

  useEffect(() => {
    setSelectedKeys([]);
    setPage(1);
  }, [caseType, consultStatus]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    api.get("/external-labs", { params: { active_only: true } })
      .then((r) => setExternalLabs(r.data))
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!destinationLab) { message.warning("Please select a destination lab"); return; }
    if (selectedKeys.length === 0) { message.warning("No cases selected"); return; }
    setSubmitting(true);
    try {
      const selectedCases = cases
        .filter((c) => selectedKeys.includes(c.id))
        .map((c) => ({
          case_type: c.case_type,
          case_id: c.id,
          accession_no: c.accession_no,
          patient_name: c.patient_name,
        }));
      await OutlabConsultRunService.createRun({ destination_lab: destinationLab, cases: selectedCases });
      message.success("Consult run created successfully");
      setModalOpen(false);
      setDestinationLab(null);
      setSelectedKeys([]);
      setModalBlocks({});
      fetchCases();
      onSent();
    } catch (err) {
      logger.error("Create consult run error:", err);
      message.error("Failed to create consult run");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCases = cases.filter((c) => selectedKeys.includes(c.id));

  const handleOpenModal = async () => {
    setLoadingBlocks(true);
    const blocks: Record<number, string[]> = {};
    await Promise.all(
      selectedCases
        .filter((c) => c.case_type === "surgical")
        .map(async (c) => {
          try {
            const caseData = await SurgicalCaseService.getCaseById(c.id);
            blocks[c.id] = (caseData.specimens || []).flatMap(
              (s) => (s.blocks || []).map((b) => b.block_code || `${s.specimen_label}${b.block_no}`)
            );
          } catch {
            blocks[c.id] = [];
          }
        })
    );
    setModalBlocks(blocks);
    setLoadingBlocks(false);
    setModalOpen(true);
  };

  const columns: ColumnsType<ConsultCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (v) => <Text strong>{v || "—"}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      width: 100,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
    },
    {
      title: "Case Status",
      dataIndex: "status",
      width: 130,
      render: (v) => <Tag>{v || "—"}</Tag>,
    },
    {
      title: "Consult",
      dataIndex: "consult_status",
      width: 120,
      render: (v) => (
        <Tag color={v === "pending" ? "orange" : v === "processing" ? "blue" : "green"}>
          {v || "—"}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Segmented
            options={[
              { label: "Surgical", value: "surgical" },
              { label: "Gyne Cyto", value: "gyne" },
              { label: "Non-Gyne Cyto", value: "nongyne" },
            ]}
            value={caseType}
            onChange={(v) => setCaseType(v as typeof caseType)}
          />
          <Segmented
            options={[
              { label: "Pending", value: "pending" },
              { label: "Processing", value: "processing" },
              { label: "Received", value: "received" },
            ]}
            value={consultStatus}
            onChange={(v) => { setConsultStatus(v as string); setPage(1); }}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession, HN, patient..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 260 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading}>Refresh</Button>
        </Space>
        <Button
          type="primary"
          icon={<SendOutlined />}
          disabled={selectedKeys.length === 0 || consultStatus !== "pending"}
          loading={loadingBlocks}
          onClick={handleOpenModal}
        >
          Send Consult ({selectedKeys.length})
        </Button>
      </div>

      <Table
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys as number[]),
          getCheckboxProps: () => ({ disabled: consultStatus !== "pending" }),
        }}
        rowKey="id"
        columns={columns}
        dataSource={cases}
        loading={loading}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: setPage, showTotal: (t) => `${t} cases` }}
        size="middle"
      />

      <Modal
        title="Confirm Consult Dispatch"
        open={modalOpen}
        onOk={handleSend}
        confirmLoading={submitting}
        onCancel={() => { setModalOpen(false); setDestinationLab(null); setModalBlocks({}); }}
        okText="Confirm Send"
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
            options={externalLabs.map((l) => ({ value: l.name, label: l.name }))}
          />
        </div>
        <Text strong style={{ display: "block", marginBottom: 8 }}>
          Cases ({selectedCases.length}):
        </Text>
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "8px 12px", background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0" }}>
          {selectedCases.map((c) => (
            <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px dashed #e8e8e8" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag color={TYPE_COLOR[c.case_type]} style={{ margin: 0, minWidth: 72, textAlign: "center" }}>
                  {c.case_type === "surgical" ? "Surgical" : c.case_type === "gyne" ? "Gyne" : "Non-Gyne"}
                </Tag>
                <Text style={{ flex: 1 }}>{c.accession_no} — {c.patient_name}</Text>
              </div>
              {c.case_type === "surgical" && modalBlocks[c.id]?.length > 0 && (
                <div style={{ marginTop: 4, marginLeft: 80, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {modalBlocks[c.id].map((code) => (
                    <Tag key={code} color="cyan" style={{ margin: 0, fontSize: 11 }}>{code}</Tag>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

// ─── Tab 2: Report Tracking ───────────────────────────────────────────────────

const ReportTrackingTab: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState<OutlabConsultRunResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await OutlabConsultRunService.getRuns({ limit: 200 });
      setRuns(data);
    } catch (err) {
      logger.error("Fetch consult runs error:", err);
      message.error("Failed to load consult runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshTrigger]);

  const handleReceive = async (runId: number) => {
    try {
      const updated = await OutlabConsultRunService.receiveRun(runId);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      message.success("Consult report received — run marked as completed");
    } catch {
      message.error("Failed to mark run as received");
    }
  };

  const handleDelete = async (runId: number) => {
    try {
      await OutlabConsultRunService.deleteRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      message.success("Consult run cancelled — cases reverted to pending");
    } catch {
      message.error("Failed to cancel run");
    }
  };

  const sentCount = runs.filter((r) => r.status === "sent").length;
  const receivedCount = runs.filter((r) => r.status === "received").length;

  // A run bundles multiple cases — this is a hint, not an auto-flip: every
  // case's own result being in doesn't itself mark the physical shipment
  // received, but it's worth surfacing so staff know to go confirm it.
  const allResultsIn = (r: OutlabConsultRunResponse) =>
    r.details.length > 0 && r.details.every((d) => d.case_consult_status === "received");

  const columns: ColumnsType<OutlabConsultRunResponse> = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      width: 140,
      render: (v) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      width: 150,
      render: (v) => dayjs(v).format("DD MMM YYYY HH:mm"),
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      render: (v) => <Text strong>{v || "—"}</Text>,
    },
    {
      title: "Cases",
      key: "case_count",
      width: 80,
      render: (_, r) => <Tag color="purple">{r.details.length}</Tag>,
    },
    {
      title: "Run Status",
      dataIndex: "status",
      width: 200,
      render: (v, r) => {
        if (v === "received") {
          return (
            <Space direction="vertical" size={0}>
              <Tag color="success" icon={<CheckCircleOutlined />}>Run Received</Tag>
              {r.received_at && (
                <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.received_at).format("DD MMM YYYY HH:mm")}</Text>
              )}
            </Space>
          );
        }
        return (
          <Space direction="vertical" size={2}>
            <Tag color="processing" icon={<ClockCircleOutlined />}>Awaiting Return</Tag>
            {allResultsIn(r) && (
              <Tag color="gold">All results in — ready to confirm</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "Actions",
      key: "action",
      width: 190,
      render: (_, r) => (
        <Space>
          {r.status === "sent" && (
            <Popconfirm
              title="Confirm run received?"
              description="Marks this shipment run as received back from the lab — does not upload any report PDF."
              onConfirm={() => handleReceive(r.id)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Badge dot={allResultsIn(r)} offset={[-6, 4]}>
                <Button type="primary" size="small" icon={<CheckCircleOutlined />}>
                  Mark Run Received
                </Button>
              </Badge>
            </Popconfirm>
          )}
          {r.status === "sent" && (
            <Popconfirm
              title="Cancel this run?"
              description="Cases will revert to pending."
              onConfirm={() => handleDelete(r.id)}
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
          <ClockCircleOutlined /> Awaiting return: {sentCount} run(s)
        </Tag>
        <Tag color="success" style={{ padding: "4px 12px", fontSize: 13 }}>
          <CheckCircleOutlined /> Run received: {receivedCount} run(s)
        </Tag>
        <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading} style={{ marginLeft: "auto" }}>
          Refresh
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={runs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
        rowClassName={(r) => (r.status === "received" ? "consult-row-received" : "")}
        expandable={{
          expandedRowRender: (r) => (
            <Table
              dataSource={r.details}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "Type",
                  dataIndex: "case_type",
                  width: 100,
                  render: (v) => <Tag color={TYPE_COLOR[v]}>{v.toUpperCase()}</Tag>,
                },
                { title: "Accession No.", dataIndex: "accession_no", width: 140 },
                { title: "Patient", dataIndex: "patient_name" },
                {
                  title: "Block Code",
                  dataIndex: "block_code",
                  width: 110,
                  render: (v) => v ? <Tag color="cyan">{v}</Tag> : <Text type="secondary">—</Text>,
                },
                {
                  title: "Report Out",
                  dataIndex: "report_out_at",
                  width: 150,
                  render: (v) => v ? (
                    <Text style={{ fontSize: 12 }}>{dayjs(v).format("DD MMM YYYY HH:mm")}</Text>
                  ) : <Text type="secondary">—</Text>,
                },
              ]}
            />
          ),
          rowExpandable: (r) => r.details.length > 0,
        }}
        locale={{ emptyText: "No consult runs yet" }}
      />
    </>
  );
};

// ─── Tab 3: Block Tracking ────────────────────────────────────────────────────

const BlockTrackingTab: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState<OutlabConsultRunResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterReturned, setFilterReturned] = useState<"all" | "out" | "returned">("out");
  const [search, setSearch] = useState("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await OutlabConsultRunService.getRuns({ limit: 500 });
      setRuns(data);
    } catch (err) {
      logger.error("Block tracking fetch error:", err);
      message.error("Failed to load block data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshTrigger]);

  const handleReturnBlock = async (detailId: number) => {
    try {
      const updated = await OutlabConsultRunService.returnBlock(detailId);
      setRuns((prev) =>
        prev.map((r) => ({
          ...r,
          details: r.details.map((d) => (d.id === updated.id ? updated : d)),
        }))
      );
      message.success("Block marked as returned");
    } catch {
      message.error("Failed to update block return");
    }
  };

  const allDetails: (OutlabConsultRunDetailResponse & { run_no: string; destination_lab?: string; sent_at: string })[] =
    runs.flatMap((r) =>
      r.details.map((d) => ({ ...d, run_no: r.run_no, destination_lab: r.destination_lab, sent_at: r.sent_at }))
    );

  const q = search.trim().toLowerCase();
  const filtered = allDetails
    .filter((d) => {
      if (filterReturned === "out") return !d.block_returned;
      if (filterReturned === "returned") return d.block_returned;
      return true;
    })
    .filter((d) =>
      !q ||
      (d.accession_no || "").toLowerCase().includes(q) ||
      (d.patient_name || "").toLowerCase().includes(q)
    );

  const outCount = allDetails.filter((d) => !d.block_returned).length;
  const returnedCount = allDetails.filter((d) => d.block_returned).length;

  const columns: ColumnsType<typeof filtered[number]> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      render: (v) => <Text strong style={{ color: "#1677ff" }}>{v || "—"}</Text>,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
    },
    {
      title: "Type",
      dataIndex: "case_type",
      width: 100,
      render: (v) => <Tag color={TYPE_COLOR[v]}>{v.toUpperCase()}</Tag>,
    },
    {
      title: "Run No.",
      dataIndex: "run_no",
      width: 120,
      render: (v) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      width: 150,
      render: (v) => <Text type="secondary">{v || "—"}</Text>,
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      width: 140,
      render: (v) => dayjs(v).format("DD MMM YYYY"),
    },
    {
      title: "Block Status",
      key: "block_status",
      width: 200,
      render: (_, d) => {
        if (d.block_returned) {
          return (
            <Space direction="vertical" size={0}>
              <Tag color="success" icon={<CheckCircleOutlined />}>Returned</Tag>
              {d.block_returned_at && (
                <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(d.block_returned_at).format("DD MMM YYYY HH:mm")}</Text>
              )}
            </Space>
          );
        }
        return (
          <Space>
            <Tag color="warning" icon={<GlobalOutlined />}>Block Out</Tag>
            <Popconfirm
              title="Confirm block returned?"
              description="This marks the physical block as returned to lab."
              onConfirm={() => handleReturnBlock(d.id)}
              okText="Confirm Return"
              cancelText="Cancel"
            >
              <Button size="small" type="primary" icon={<InboxOutlined />}>
                Mark Returned
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space>
          <Button.Group>
            <Button type={filterReturned === "all" ? "primary" : "default"} onClick={() => setFilterReturned("all")}>
              All ({allDetails.length})
            </Button>
            <Button
              type={filterReturned === "out" ? "primary" : "default"}
              danger={filterReturned === "out"}
              onClick={() => setFilterReturned("out")}
            >
              Block Out ({outCount})
            </Button>
            <Button
              type={filterReturned === "returned" ? "primary" : "default"}
              onClick={() => setFilterReturned("returned")}
              style={filterReturned === "returned" ? { background: "#52c41a", borderColor: "#389e0d", color: "#fff" } : {}}
            >
              Returned ({returnedCount})
            </Button>
          </Button.Group>
        </Space>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession or patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>Refresh</Button>
        </Space>
      </div>

      {allDetails.length === 0 && !loading ? (
        <div style={{ padding: "32px", textAlign: "center" }}>
          <Text type="secondary">No cases dispatched to external lab yet.</Text>
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          rowClassName={(d) => (d.block_returned ? "consult-row-received" : "")}
          locale={{ emptyText: "No matching blocks" }}
        />
      )}
    </>
  );
};

// ─── Tab: Case Tracking ───────────────────────────────────────────────────────

const CaseTrackingTab: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
  const [runs, setRuns] = useState<OutlabConsultRunResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [receivingRunIds, setReceivingRunIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "awaiting" | "received">("all");
  const [editingRunId, setEditingRunId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingRunId, setSavingRunId] = useState<number | null>(null);
  const [uploadTarget, setUploadTarget] = useState<FlatCase | null>(null);
  const [sourcePdfFile, setSourcePdfFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const pdfPage = usePdfPageSelector(sourcePdfFile, setUploadFile);
  const showPagePicker = !!sourcePdfFile && !!pdfPage.pageCount && pdfPage.pageCount > 1;
  const showPagePreview = showPagePicker && pdfPage.mode === "select";
  const [uploadReceivedAt, setUploadReceivedAt] = useState<Dayjs>(dayjs());
  const [uploading, setUploading] = useState(false);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | undefined>();
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await OutlabConsultRunService.getRuns({ limit: 500 });
      setRuns(data);
    } catch {
      message.error("Failed to load consult cases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshTrigger]);

  const handleReceive = async (runId: number) => {
    setReceivingRunIds((prev) => new Set([...prev, runId]));
    try {
      const updated = await OutlabConsultRunService.receiveRun(runId);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      message.success("Consult report received — run marked as completed");
    } catch {
      message.error("Failed to mark run as received");
    } finally {
      setReceivingRunIds((prev) => { const s = new Set(prev); s.delete(runId); return s; });
    }
  };

  const handleSaveTracking = async (runId: number) => {
    setSavingRunId(runId);
    try {
      const updated = await OutlabConsultRunService.updateTracking(runId, editingValue.trim() || null);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingRunId(null);
    } catch {
      message.error("Failed to save tracking number");
    } finally {
      setSavingRunId(null);
    }
  };

  const handleUploadConsultPdf = async () => {
    if (!uploadFile || !uploadTarget) return;
    setUploading(true);
    try {
      if (uploadTarget.case_type === "nongyne") {
        await NongyneCytologyCaseService.uploadConsultPdf(uploadTarget.case_id, uploadFile, uploadReceivedAt.toISOString());
      } else if (uploadTarget.case_type === "gyne") {
        await GyneCytologyCaseService.uploadConsultPdf(uploadTarget.case_id, uploadFile, uploadReceivedAt.toISOString());
      } else {
        await SurgicalCaseService.uploadConsultPdf(uploadTarget.case_id, uploadFile, uploadReceivedAt.toISOString());
      }
      // consult_status only advances to "received" when the pathologist signs
      // off — this upload alone never does that, so Result Status will still
      // show "Awaiting Result" right after this succeeds. That's expected.
      message.success("Consult PDF uploaded — awaiting pathologist sign-off");
      setUploadTarget(null);
      setSourcePdfFile(null);
      setUploadFile(null);
      fetchRuns();
    } catch {
      message.error("Failed to upload Consult PDF");
    } finally {
      setUploading(false);
    }
  };

  const handleViewPdf = async (d: FlatCase) => {
    setViewLoadingId(d.id);
    try {
      let blob: Blob;
      if (d.case_type === "nongyne") {
        blob = await NongyneCytologyCaseService.getConsultPdfBlob(d.case_id);
      } else if (d.case_type === "gyne") {
        blob = await GyneCytologyCaseService.getConsultPdfBlob(d.case_id);
      } else {
        blob = await SurgicalCaseService.getConsultPdfBlob(d.case_id);
      }
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      setPreviewFilename(`${d.accession_no ?? d.case_id}_consult.pdf`);
      setPreviewOpen(true);
    } catch {
      message.error("Failed to load Consult PDF");
    } finally {
      setViewLoadingId(null);
    }
  };

  type FlatCase = OutlabConsultRunDetailResponse & {
    run_no: string;
    destination_lab?: string;
    sent_at: string;
    run_status: string;
    run_id: number;
    tracking_number?: string;
  };

  const allCases: FlatCase[] = runs.flatMap((r) =>
    r.details.map((d) => ({
      ...d,
      run_no: r.run_no,
      destination_lab: r.destination_lab,
      sent_at: r.sent_at,
      run_status: r.status,
      run_id: r.id,
      tracking_number: r.tracking_number,
    }))
  );

  const q = search.trim().toLowerCase();
  const filtered = allCases
    .filter((d) => {
      if (filterStatus === "awaiting") return d.run_status === "sent";
      if (filterStatus === "received") return d.run_status === "received";
      return true;
    })
    .filter((d) =>
      !q ||
      (d.accession_no || "").toLowerCase().includes(q) ||
      (d.patient_name || "").toLowerCase().includes(q)
    );

  const awaitingCount = allCases.filter((d) => d.run_status === "sent").length;
  const receivedCount = allCases.filter((d) => d.run_status === "received").length;

  const columns: ColumnsType<FlatCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      render: (v) => <Text strong style={{ color: "#1677ff" }}>{v || "—"}</Text>,
    },
    {
      title: "Patient",
      dataIndex: "patient_name",
      render: (v) => v || "—",
    },
    {
      title: "Type",
      dataIndex: "case_type",
      width: 100,
      render: (v) => <Tag color={TYPE_COLOR[v]}>{v?.toUpperCase()}</Tag>,
    },
    {
      title: "Run No.",
      dataIndex: "run_no",
      width: 120,
      render: (v) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      width: 150,
      render: (v) => <Text type="secondary">{v || "—"}</Text>,
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      width: 130,
      render: (v) => dayjs(v).format("DD MMM YYYY"),
    },
    {
      title: "Tracking No.",
      key: "tracking_number",
      width: 180,
      render: (_, d) => {
        const isEditing = editingRunId === d.run_id;
        if (isEditing) {
          return (
            <Space.Compact size="small">
              <Input
                autoFocus
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onPressEnter={() => handleSaveTracking(d.run_id)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingRunId(null); }}
                placeholder="Enter tracking no."
                style={{ width: 120 }}
              />
              <Button
                type="primary"
                size="small"
                loading={savingRunId === d.run_id}
                onClick={() => handleSaveTracking(d.run_id)}
              >
                Save
              </Button>
            </Space.Compact>
          );
        }
        return (
          <Space size={4}>
            {d.tracking_number
              ? <Tag color="gold">{d.tracking_number}</Tag>
              : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
            }
            <Tooltip title="Edit tracking number">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => { setEditingRunId(d.run_id); setEditingValue(d.tracking_number ?? ""); }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "Run Status",
      key: "report_status",
      width: 180,
      render: (_, d) =>
        d.run_status === "received" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Tag color="success" icon={<CheckCircleOutlined />}>Run Received</Tag>
            {d.report_out_at && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(d.report_out_at).format("DD MMM YYYY HH:mm")}
              </Text>
            )}
          </div>
        ) : (
          <Tag color="processing" icon={<ClockCircleOutlined />}>Awaiting Return</Tag>
        ),
    },
    {
      title: "Result Status",
      key: "case_consult_status",
      width: 160,
      render: (_, d) => {
        // Live status of this specific case — a run can bundle several cases,
        // so one case's result being in doesn't mean the whole shipment (Run
        // Status, above) has physically come back yet.
        if (d.case_consult_status === "received") {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Result Received</Tag>;
        }
        if (d.case_consult_status === "processing") {
          return <Tag color="blue" icon={<ClockCircleOutlined />}>Awaiting Result</Tag>;
        }
        if (!d.case_consult_status) {
          return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        }
        return <Tag icon={<ClockCircleOutlined />}>{d.case_consult_status}</Tag>;
      },
    },
    {
      title: "",
      key: "action",
      width: 220,
      render: (_, d) => (
        <Space direction="vertical" size={4}>
          {d.consult_pdf_uploaded && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<FilePdfOutlined />}
              loading={viewLoadingId === d.id}
              onClick={() => handleViewPdf(d)}
            >
              View PDF
            </Button>
          )}
          {(d.case_type === "surgical" || d.case_type === "nongyne" || d.case_type === "gyne") && (
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => {
                setUploadTarget(d);
                setSourcePdfFile(null);
                setUploadFile(null);
                setUploadReceivedAt(dayjs());
              }}
            >
              {d.consult_pdf_uploaded ? "Re-upload" : "Upload PDF"}
            </Button>
          )}
          {d.run_status === "sent" && (
            <Popconfirm
              title="Confirm run received?"
              description="Marks this shipment run as received back from the lab — does not upload any report PDF."
              onConfirm={() => handleReceive(d.run_id)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={receivingRunIds.has(d.run_id)}
              >
                Mark Run Received
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Segmented
            options={[
              { label: `All (${allCases.length})`, value: "all" },
              { label: `Awaiting (${awaitingCount})`, value: "awaiting" },
              { label: `Received (${receivedCount})`, value: "received" },
            ]}
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as typeof filterStatus)}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession or patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>Refresh</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        rowClassName={(d) => (d.run_status === "received" ? "consult-row-received" : "")}
        locale={{ emptyText: "No consult cases found" }}
      />

      <Modal
        title={`Upload Consult PDF — ${uploadTarget?.accession_no ?? ""}`}
        open={!!uploadTarget}
        onCancel={() => setUploadTarget(null)}
        footer={null}
        width={showPagePreview ? 860 : 480}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: showPagePreview ? "0 0 380px" : "1 1 auto", minWidth: 0 }}>
            <Typography.Text style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#8c8c8c" }}>
              Report Received Date / Time:
            </Typography.Text>
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              value={uploadReceivedAt}
              onChange={(d) => d && setUploadReceivedAt(d)}
              style={{ width: "100%", marginBottom: 12 }}
            />
            <Upload.Dragger
              accept="application/pdf"
              maxCount={1}
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.error("File must be under 10 MB");
                  return Upload.LIST_IGNORE;
                }
                setSourcePdfFile(file);
                return false;
              }}
              onRemove={() => { setSourcePdfFile(null); setUploadFile(null); }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Click or drag PDF to upload</p>
              <p className="ant-upload-hint" style={{ fontSize: 11 }}>Max 10 MB · PDF only</p>
            </Upload.Dragger>
            {showPagePicker && (
              <div style={{ marginTop: 12 }}>
                <Segmented
                  block
                  value={pdfPage.mode}
                  onChange={(v) => pdfPage.setMode(v as "all" | "select")}
                  options={[
                    { label: `Upload All Pages (${pdfPage.pageCount})`, value: "all" },
                    { label: "Select Pages", value: "select" },
                  ]}
                />
                {pdfPage.mode === "select" && pdfPage.pageCount && (
                  <div style={{ marginTop: 12 }}>
                    <PdfPageThumbnailStrip
                      pageCount={pdfPage.pageCount}
                      selectedPages={pdfPage.selectedPages}
                      thumbnails={pdfPage.thumbnails}
                      loadingThumbnails={pdfPage.loadingThumbnails}
                      previewPageNo={pdfPage.previewPageNo}
                      onHoverPage={pdfPage.ensurePreview}
                      onTogglePage={pdfPage.togglePage}
                      onSelectAll={pdfPage.selectAll}
                      onClearAll={pdfPage.clearAll}
                      maxHeight={340}
                    />
                  </div>
                )}
              </div>
            )}
            {uploadFile && (
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleUploadConsultPdf}
                loading={uploading}
                block
                style={{ marginTop: 12 }}
              >
                Upload Report PDF
              </Button>
            )}
          </div>
          {showPagePreview && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <PdfPagePreviewPane
                previewPageNo={pdfPage.previewPageNo}
                previewSrc={pdfPage.previewSrc}
                previewLoading={pdfPage.previewLoading}
                minHeight={420}
              />
            </div>
          )}
        </div>
      </Modal>

      <ReportPreviewModal
        open={previewOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setPreviewOpen(false)}
        filename={previewFilename}
      />
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const OutLabConsultListPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("send");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSent = () => {
    setRefreshTrigger((n) => n + 1);
    setActiveTab("cases");
  };

  const tabItems = [
    {
      key: "send",
      label: <span><SendOutlined /> Send to Consult</span>,
      children: <SendTab onSent={handleSent} />,
    },
    {
      key: "cases",
      label: <span><UnorderedListOutlined /> Case Tracking</span>,
      children: <CaseTrackingTab refreshTrigger={refreshTrigger} />,
    },
    {
      key: "tracking",
      label: <span><UnorderedListOutlined /> Run Tracking</span>,
      children: <ReportTrackingTab refreshTrigger={refreshTrigger} />,
    },
    {
      key: "blocks",
      label: <span><InboxOutlined /> Block Tracking</span>,
      children: <BlockTrackingTab refreshTrigger={refreshTrigger} />,
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <GlobalOutlined style={{ marginRight: 12, color: "#595959" }} />
          Out-Lab Consult
        </Title>
      }
      subTitle="Send cases for external consultation and track report & block return"
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        tabBarStyle={{ marginBottom: 16, borderBottom: "1px solid #f0f0f0" }}
      />

      <style>{`
        .consult-row-received td { background-color: #f6ffed !important; }
      `}</style>
    </PageContainer>
  );
};

export default OutLabConsultListPage;
