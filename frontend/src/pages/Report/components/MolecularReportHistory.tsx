import React, { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Table, Tag, Button, Space, Typography, message, Divider } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import { sanitizeHtml } from "../../../utils/sanitize";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import { MolecularCaseService, MolecularCaseResponse } from "../../../services/molecularCaseService";
import type { ReportHistoryHandle } from "./SurgicalReportHistory";
import logger from "../../../utils/logger";

const { Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "gold",
  reported: "green",
};

const MolecularReportHistory = forwardRef<ReportHistoryHandle>((_, ref) => {
  const [rows, setRows] = useState<MolecularCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState<string | undefined>(undefined);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

  const fetchData = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const data = await MolecularCaseService.getAll({ search, limit: 200 });
      setRows(data);
    } catch (error) {
      logger.error("Fetch Molecular Archive Error:", error);
      message.error("ไม่สามารถดึงข้อมูลผล Molecular Pathology ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(undefined); }, [fetchData]);

  const onSearch = useCallback((value: string) => {
    const s = value.trim() || undefined;
    setSearchText(s);
    fetchData(s);
  }, [fetchData]);

  useImperativeHandle(ref, () => ({ search: onSearch }), [onSearch]);

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const handleViewPdf = async (row: MolecularCaseResponse) => {
    setPreviewLoadingId(row.id);
    try {
      const blob = row.outlab_pdf_path
        ? await MolecularCaseService.getOutlabPdfBlob(row.id)
        : await MolecularCaseService.getResultPdfBlob(row.id);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setIsModalOpen(true);
    } catch (error) {
      logger.error("View Molecular PDF Error:", error);
      message.error("ไม่สามารถโหลด PDF ได้");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      render: (t: string) => <Text strong>{t}</Text>,
    },
    {
      title: "Parent Case",
      dataIndex: "parent_case_accession_no",
      key: "parent_case_accession_no",
      width: 130,
      render: (t: string | null) => t || <Tag>Standalone</Tag>,
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, r: MolecularCaseResponse) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.patient_name || "-"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>HN: {r.hn || "-"}</Text>
        </Space>
      ),
    },
    { title: "Test", dataIndex: "test_name", key: "test_name" },
    {
      title: "Out-lab",
      dataIndex: "is_outlab",
      key: "is_outlab",
      width: 90,
      render: (v: boolean) => (v ? <Tag color="purple">Out-lab</Tag> : <Tag>In-house</Tag>),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLOR[s] || "default"}>{s?.toUpperCase() || "-"}</Tag>,
    },
    {
      title: "Registered",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 160,
      render: (v: string) => (v ? new Date(v).toLocaleDateString() : "-"),
    },
    {
      title: "PDF",
      key: "pdf",
      width: 110,
      fixed: "right" as const,
      render: (_: unknown, r: MolecularCaseResponse) =>
        r.outlab_pdf_path || r.status === "reported" ? (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<FileSearchOutlined />}
            loading={previewLoadingId === r.id}
            onClick={() => handleViewPdf(r)}
          >
            View PDF
          </Button>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
        ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Total {rows.length} records
        </Text>
      </div>
      <Table
        dataSource={rows}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100, y: "calc(100vh - 360px)" }}
        sticky
        size="middle"
        pagination={{ pageSize: 20, showTotal: (t) => `Total ${t} records` }}
        expandable={{
          expandedRowRender: (r) => (
            <div style={{ background: "#fafafa", padding: 20, borderRadius: 8, border: "1px solid #f0f0f0" }}>
              <Divider plain style={{ margin: "0 0 12px" }}>Result</Divider>
              {r.result_text ? (
                <div
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.result_text) /* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */ }}
                />
              ) : (
                <Text type="secondary">No result recorded.</Text>
              )}
            </div>
          ),
        }}
        locale={{ emptyText: searchText ? "No matching Molecular results" : "No Molecular Pathology records yet" }}
      />
      <ReportPreviewModal open={isModalOpen} pdfUrl={pdfUrl} onCancel={() => setIsModalOpen(false)} />
    </>
  );
});

MolecularReportHistory.displayName = "MolecularReportHistory";

export default MolecularReportHistory;
