import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table, Tag, Input, Space, Button, Typography, message, Popconfirm,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined, FilePdfOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import logger from "../../../utils/logger";

const { Text } = Typography;

interface Props {
  pathologistId?: number;
  onSelectCase?: (id: number) => void;
  onCountChange?: (count: number) => void;
}

/** Out-lab test result PDFs awaiting this pathologist's sign-off before a
 * clinician can see them — mirrors MyConsultCases.tsx's shape. */
const MyOutlabApprovals: React.FC<Props> = ({ pathologistId, onSelectCase, onCountChange }) => {
  const [cases, setCases] = useState<GyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | undefined>();
  const pdfUrlRef = useRef<string | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const fetchCases = useCallback(async () => {
    if (!pathologistId) return;
    setLoading(true);
    try {
      const res = await GyneCytologyCaseService.getAll({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        assigned_user_id: pathologistId,
        is_out_lab: true,
        has_out_lab_result: true,
        outlab_result_approved: false,
      });
      setCases(res.items || []);
      const t = res.total || 0;
      setTotal(t);
      onCountChange?.(t);
    } catch {
      message.error("Failed to load outlab approval worklist");
    } finally {
      setLoading(false);
    }
  }, [pathologistId, page, search]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleViewPdf = async (c: GyneCytologyCase) => {
    setViewLoadingId(c.id);
    try {
      const blob = await GyneCytologyCaseService.downloadOutlabTestResult(c.id);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      setPreviewFilename(`${c.accession_no}_outlab_test.pdf`);
      setPreviewOpen(true);
    } catch (err) {
      logger.error("Failed to load outlab test result PDF", err);
      message.error("Failed to load PDF");
    } finally {
      setViewLoadingId(null);
    }
  };

  const handleApprove = async (c: GyneCytologyCase) => {
    setApprovingId(c.id);
    try {
      await GyneCytologyCaseService.approveOutlabTestResult(c.id);
      message.success("Result approved — now visible to the clinician");
      fetchCases();
    } catch {
      message.error("Failed to approve result");
    } finally {
      setApprovingId(null);
    }
  };

  const columns: ColumnsType<GyneCytologyCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 150,
      render: (v) => <Text strong style={{ color: "#1677ff" }}>{v || "—"}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      width: 100,
    },
    {
      title: "Patient",
      key: "patient",
      render: (_, r) =>
        [r.patient?.title?.title, r.patient?.name, r.patient?.ln].filter(Boolean).join(" ") || "—",
    },
    {
      title: "Registered",
      dataIndex: "registered_at",
      width: 140,
      render: (v: string) => v ? dayjs(v).format("DD MMM YYYY") : "—",
    },
    {
      title: "Action",
      key: "action",
      width: 220,
      // Row click navigates to the case (onRow below) — stop clicks here
      // from bubbling into that, or "View PDF"/"Approve" would immediately
      // navigate away instead of doing their own thing.
      onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
      render: (_, c) => (
        <Space>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<FilePdfOutlined />}
            loading={viewLoadingId === c.id}
            onClick={() => handleViewPdf(c)}
          >
            View PDF
          </Button>
          <Popconfirm
            title="Approve this outlab result?"
            description="The result becomes visible to the clinician once approved."
            onConfirm={() => handleApprove(c)}
            okText="Approve"
            cancelText="Cancel"
          >
            <Button type="primary" size="small" icon={<CheckCircleOutlined />} loading={approvingId === c.id}>
              Approve
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession, HN, patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading}>
            Refresh
          </Button>
        </Space>
        <Tag color="orange" style={{ padding: "4px 10px" }}>
          {total} awaiting sign-off
        </Tag>
      </div>

      <Table
        columns={columns}
        dataSource={cases}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => onSelectCase?.(record.id),
          style: onSelectCase ? { cursor: "pointer" } : undefined,
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: setPage,
          showTotal: (t) => `${t} cases`,
        }}
        size="middle"
        locale={{ emptyText: "No outlab results awaiting sign-off" }}
      />

      <ReportPreviewModal
        open={previewOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setPreviewOpen(false)}
        filename={previewFilename}
      />
    </>
  );
};

export default MyOutlabApprovals;
