import React, { useState, useCallback, useEffect } from "react";
import {
  Table,
  Tag,
  Select,
  Space,
  Input,
  Button,
  message,
  Badge,
  Tooltip,
  Typography,
  Modal,
  Descriptions,
  Radio,
} from "antd";
import {
  ExperimentOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import PageContainer from "../../components/Layout/PageContainer";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import { NongyneCytologyCase } from "../../types/nongyne";
import logger from "../../utils/logger";

const { Text } = Typography;

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string; badgeStatus: "default" | "processing" | "success" | "error" | "warning" }
> = {
  pending:    { color: "orange", label: "Pending",    badgeStatus: "warning" },
  processing: { color: "blue",   label: "Processing", badgeStatus: "processing" },
  ready:      { color: "green",  label: "Ready",      badgeStatus: "success" },
  failed:     { color: "red",    label: "Failed",     badgeStatus: "error" },
};

const STATUS_OPTIONS = [
  { value: "",           label: "All Statuses" },
  { value: "pending",    label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "ready",      label: "Ready" },
  { value: "failed",     label: "Failed" },
];

interface FinishModal {
  open: boolean;
  record: NongyneCytologyCase | null;
  outcome: "ready" | "failed";
}

interface CellBlockTrackingPageProps {
  onOpenCase?: (id: number) => void;
}

const CellBlockTrackingPage: React.FC<CellBlockTrackingPageProps> = ({ onOpenCase }) => {
  const [cases, setCases] = useState<NongyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [finishModal, setFinishModal] = useState<FinishModal>({
    open: false,
    record: null,
    outcome: "ready",
  });
  const [finishing, setFinishing] = useState(false);

  const PAGE_SIZE = 20;

  const fetchData = useCallback(async (p: number, q: string, st: string) => {
    setLoading(true);
    try {
      const res = await NongyneCytologyCaseService.getAll({
        skip: (p - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: q || undefined,
        is_cell_block: true,
        cell_block_status: st || undefined,
      });
      setCases(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error("Cell block fetch error:", err);
      message.error("Failed to load cell block cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (page !== 1) setPage(1);
      else fetchData(1, search, statusFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  useEffect(() => {
    fetchData(page, search, statusFilter);
  }, [page]);

  const updateStatus = async (caseId: number, newStatus: string) => {
    await NongyneCytologyCaseService.update(caseId, { cell_block_status: newStatus });
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, cell_block_status: newStatus as NongyneCytologyCase["cell_block_status"] }
          : c,
      ),
    );
  };

  const handleFinishConfirm = async () => {
    if (!finishModal.record) return;
    setFinishing(true);
    try {
      await updateStatus(finishModal.record.id, finishModal.outcome);
      message.success(
        finishModal.outcome === "ready"
          ? "Cell block marked as Ready."
          : "Cell block marked as Failed.",
      );
      setFinishModal({ open: false, record: null, outcome: "ready" });
    } catch {
      message.error("Failed to update cell block.");
    } finally {
      setFinishing(false);
    }
  };

  const openFinishModal = (record: NongyneCytologyCase) => {
    setFinishModal({ open: true, record, outcome: "ready" });
  };

  const columns: ColumnsType<NongyneCytologyCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (val: string, record) =>
        onOpenCase ? (
          <Button type="link" style={{ padding: 0 }} onClick={() => onOpenCase(record.id)}>
            {val}
          </Button>
        ) : (
          <Text strong>{val}</Text>
        ),
    },
    {
      title: "Patient",
      key: "patient",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 13 }}>
            {r.patient
              ? [r.patient.title?.title, r.patient.name, r.patient.ln].filter(Boolean).join(" ")
              : "—"}
          </Text>
          {r.hn && <Text type="secondary" style={{ fontSize: 11 }}>HN {r.hn}</Text>}
        </Space>
      ),
    },
    {
      title: "Specimen",
      key: "specimen",
      width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag color="purple" style={{ marginBottom: 2 }}>{r.specimen_type || "—"}</Tag>
          {r.collection_site && (
            <Text type="secondary" style={{ fontSize: 11 }}>{r.collection_site}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Prepared",
      key: "prepared",
      width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {r.cell_block_prepared_at ? (
            <Text style={{ fontSize: 12 }}>
              {dayjs(r.cell_block_prepared_at).format("DD MMM YYYY HH:mm")}
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )}
          {r.cell_block_prepared_by?.full_name && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.cell_block_prepared_by.full_name}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Processing Status",
      dataIndex: "cell_block_status",
      width: 200,
      render: (status: string | null | undefined, record) => {
        const cfg = status ? STATUS_CONFIG[status] : null;
        const canFinish = status === "pending" || status === "processing";
        return (
          <Space size={8}>
            {cfg ? (
              <Tag color={cfg.color} style={{ marginRight: 0 }}>
                <Badge status={cfg.badgeStatus} /> {cfg.label}
              </Tag>
            ) : (
              <Tag>—</Tag>
            )}
            {canFinish && (
              <Tooltip title="Finish preparation">
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => openFinishModal(record)}
                  style={{ background: "#52c41a", borderColor: "#52c41a" }}
                >
                  Finish
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "Case Status",
      dataIndex: "status",
      width: 130,
      render: (s: string) => <Tag>{s}</Tag>,
    },
    {
      title: "Registered",
      dataIndex: "registered_at",
      width: 130,
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>{dayjs(v).format("DD MMM YYYY")}</Text>
      ),
    },
  ];

  const pendingCount   = cases.filter((c) => c.cell_block_status === "pending").length;
  const processingCount = cases.filter((c) => c.cell_block_status === "processing").length;
  const { record: modalRecord } = finishModal;

  return (
    <>
      <PageContainer
        title={
          <Space>
            <ExperimentOutlined style={{ marginRight: 4, color: "#531dab" }} />
            Cell Block Tracking
          </Space>
        }
        extra={[
          <Tooltip key="pending" title="Pending on this page">
            <Tag color="orange">Pending: {pendingCount}</Tag>
          </Tooltip>,
          <Tooltip key="processing" title="Processing on this page">
            <Tag color="blue">Processing: {processingCount}</Tag>
          </Tooltip>,
          <Button
            key="reload"
            icon={<ReloadOutlined />}
            onClick={() => fetchData(page, search, statusFilter)}
          >
            Refresh
          </Button>,
        ]}
        withCard
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession, HN, patient name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ width: 180 }}
            options={STATUS_OPTIONS}
          />
        </Space>

        <Table
          rowKey="id"
          dataSource={cases}
          columns={columns}
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: (t) => `${t} cases`,
            onChange: (p) => setPage(p),
          }}
          size="middle"
          rowClassName={(r) => (r.cell_block_status === "ready" ? "row-ready" : "")}
        />
      </PageContainer>

      {/* ── Finish Preparation Modal ── */}
      <Modal
        open={finishModal.open}
        title={
          <Space>
            <ExperimentOutlined style={{ color: "#531dab" }} />
            Finish Cell Block Preparation
          </Space>
        }
        onCancel={() => setFinishModal({ open: false, record: null, outcome: "ready" })}
        onOk={handleFinishConfirm}
        okText={
          finishModal.outcome === "ready" ? (
            <Space size={4}><CheckCircleOutlined /> Mark as Ready</Space>
          ) : (
            <Space size={4}><CloseCircleOutlined /> Mark as Failed</Space>
          )
        }
        okButtonProps={{
          style: {
            background: finishModal.outcome === "ready" ? "#52c41a" : "#ff4d4f",
            borderColor: finishModal.outcome === "ready" ? "#52c41a" : "#ff4d4f",
          },
        }}
        confirmLoading={finishing}
        width={480}
        destroyOnClose
      >
        {modalRecord && (
          <div style={{ marginTop: 8 }}>
            <Descriptions
              column={1}
              size="small"
              bordered
              labelStyle={{ width: 140, fontWeight: 600, background: "#fafafa" }}
              style={{ marginBottom: 20 }}
            >
              <Descriptions.Item label="Accession No.">
                <Text strong>{modalRecord.accession_no}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Patient">
                {modalRecord.patient
                  ? [modalRecord.patient.title?.title, modalRecord.patient.name, modalRecord.patient.ln]
                      .filter(Boolean)
                      .join(" ")
                  : "—"}
                {modalRecord.hn && (
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                    HN {modalRecord.hn}
                  </Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Specimen">
                <Space size={4}>
                  <Tag color="purple" style={{ marginRight: 0 }}>
                    {modalRecord.specimen_type}
                  </Tag>
                  {modalRecord.collection_site && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {modalRecord.collection_site}
                    </Text>
                  )}
                </Space>
              </Descriptions.Item>
              {modalRecord.cell_block_prepared_at && (
                <Descriptions.Item label="Prepared At">
                  {dayjs(modalRecord.cell_block_prepared_at).format("DD MMM YYYY HH:mm")}
                  {modalRecord.cell_block_prepared_by?.full_name && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      by {modalRecord.cell_block_prepared_by.full_name}
                    </Text>
                  )}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Text strong style={{ display: "block", marginBottom: 10 }}>
              Preparation result:
            </Text>
            <Radio.Group
              value={finishModal.outcome}
              onChange={(e) =>
                setFinishModal((prev) => ({ ...prev, outcome: e.target.value }))
              }
              style={{ width: "100%" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Radio value="ready">
                  <Space size={6}>
                    <CheckCircleOutlined style={{ color: "#52c41a" }} />
                    <span>
                      <Text strong>Ready</Text>
                      <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                        — cell block successfully prepared, proceed to sectioning
                      </Text>
                    </span>
                  </Space>
                </Radio>
                <Radio value="failed">
                  <Space size={6}>
                    <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
                    <span>
                      <Text strong>Failed</Text>
                      <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                        — insufficient material or processing error
                      </Text>
                    </span>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        )}
      </Modal>
    </>
  );
};

export default CellBlockTrackingPage;
