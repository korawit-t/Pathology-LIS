import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table, Tag, Input, Space, Button, Typography, message,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined, FilePdfOutlined, StepForwardOutlined,
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

/** The rows the Pathologist worklist's "Approve Outlab" badge counts. Exported
 *  so the badge can be counted without mounting this panel — antd renders a tab
 *  pane lazily, so a badge fed only by `onCountChange` reads 0 until the tab is
 *  opened. Keep the panel's own query built from this so the two can't drift. */
export const buildOutlabApprovalBadgeParams = (pathologistId: number) => ({
  assigned_user_id: pathologistId,
  is_out_lab: true,
  has_out_lab_result: true,
  outlab_result_approved: false,
});

/** Out-lab test result PDFs awaiting this pathologist's sign-off before a
 * clinician can see them — mirrors MyConsultCases.tsx's shape. */
const MyOutlabApprovals: React.FC<Props> = ({ pathologistId, onSelectCase, onCountChange }) => {
  const [cases, setCases] = useState<GyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // Which footer button is in flight, so only that one spins.
  const [approving, setApproving] = useState<"approve" | "next" | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  // The case whose PDF is open for review — approving happens from inside
  // the preview, so the pathologist reads the result before signing it off.
  // Kept after close (only `previewOpen` flips) so the footer doesn't vanish
  // mid-fade-out.
  const [reviewCase, setReviewCase] = useState<GyneCytologyCase | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  /** Returns the page's rows (null on failure) so "Approve & Next" can pick
   *  its next case from the refreshed list. */
  const fetchCases = useCallback(async (): Promise<GyneCytologyCase[] | null> => {
    if (!pathologistId) return null;
    setLoading(true);
    try {
      const res = await GyneCytologyCaseService.getAll({
        ...buildOutlabApprovalBadgeParams(pathologistId),
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      const items = res.items || [];
      setCases(items);
      const t = res.total || 0;
      setTotal(t);
      // A searched total is not what the badge means — see MyConsultCases.tsx.
      if (!search) onCountChange?.(t);
      // Approving the only row on a later page leaves this page past the end.
      // antd's pager quietly shows the last page number anyway, over an empty
      // table — step back to the last page that still has rows.
      const lastPage = Math.max(1, Math.ceil(t / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
      return items;
    } catch {
      message.error("Failed to load outlab approval worklist");
      return null;
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

  /** Puts the case's result PDF in the preview; false (already reported to
   *  the user) if it couldn't be downloaded. */
  const loadReview = async (c: GyneCytologyCase): Promise<boolean> => {
    try {
      const blob = await GyneCytologyCaseService.downloadOutlabTestResult(c.id);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      setReviewCase(c);
      return true;
    } catch (err) {
      logger.error("Failed to load outlab test result PDF", err);
      message.error("Failed to load PDF");
      return false;
    }
  };

  const handleReview = async (c: GyneCytologyCase) => {
    setViewLoadingId(c.id);
    if (await loadReview(c)) setPreviewOpen(true);
    setViewLoadingId(null);
  };

  const reviewIndex = reviewCase ? cases.findIndex((c) => c.id === reviewCase.id) : -1;
  // A next case exists if one follows on this page, or the next page has rows
  // that will slide up once this one drops out of the list.
  const hasNext = reviewIndex >= 0 && (reviewIndex < cases.length - 1 || page * PAGE_SIZE < total);

  const handleApprove = async (andNext: boolean) => {
    if (!reviewCase) return;
    setApproving(andNext ? "next" : "approve");
    try {
      try {
        await GyneCytologyCaseService.approveOutlabTestResult(reviewCase.id);
      } catch {
        // Stay open so they can retry without re-finding the case.
        message.error("Failed to approve result");
        return;
      }
      message.success("Result approved — now visible to the clinician");
      const fresh = await fetchCases();
      // The approved case is gone from the refreshed list, so whatever now
      // sits at its old index is the one that followed it — including the
      // first row of the next page when it was the last row on this one.
      const next = andNext && reviewIndex >= 0 ? fresh?.[reviewIndex] : undefined;
      // Close rather than leave the just-approved PDF up behind a live
      // Approve button when there's no next case or its PDF won't load.
      if (!next || !(await loadReview(next))) setPreviewOpen(false);
    } finally {
      setApproving(null);
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
      title: "Uploaded",
      dataIndex: "out_lab_result_uploaded_at",
      width: 140,
      render: (v: string | null) => v ? dayjs(v).format("DD MMM YYYY") : "—",
    },
    {
      title: "Action",
      key: "action",
      width: 170,
      // Row click navigates to the case (onRow below) — stop clicks here
      // from bubbling into that, or "Review & Approve" would immediately
      // navigate away instead of opening the PDF.
      onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
      render: (_, c) => (
        <Button
          type="primary"
          size="small"
          icon={<FilePdfOutlined />}
          loading={viewLoadingId === c.id}
          onClick={() => handleReview(c)}
        >
          Review & Approve
        </Button>
      ),
    },
  ];

  const reviewFooter = reviewCase && (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <Text type="secondary" style={{ textAlign: "left" }}>
        <Text strong>{reviewCase.accession_no}</Text>
        {" · "}
        {[reviewCase.patient?.title?.title, reviewCase.patient?.name, reviewCase.patient?.ln].filter(Boolean).join(" ") || "—"}
        {" — "}
        the result becomes visible to the clinician once approved.
      </Text>
      <Space>
        <Button onClick={() => setPreviewOpen(false)} disabled={!!approving}>
          Cancel
        </Button>
        <Button
          icon={<CheckCircleOutlined />}
          loading={approving === "approve"}
          disabled={approving === "next"}
          onClick={() => handleApprove(false)}
        >
          Approve
        </Button>
        {/* Disabled rather than hidden on the last case, so the buttons don't
            shift under a cursor that's been clicking this one. */}
        <Button
          type="primary"
          icon={<StepForwardOutlined />}
          loading={approving === "next"}
          disabled={!hasNext || approving === "approve"}
          title={hasNext ? undefined : "No more results after this one"}
          onClick={() => handleApprove(true)}
        >
          Approve & Next
        </Button>
      </Space>
    </div>
  );

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
        onCancel={() => { if (!approving) setPreviewOpen(false); }}
        filename={reviewCase ? `${reviewCase.accession_no}_outlab_test.pdf` : undefined}
        footer={reviewFooter}
      />
    </>
  );
};

export default MyOutlabApprovals;
