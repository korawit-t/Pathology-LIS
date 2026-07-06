import React, { useEffect, useState, useCallback } from "react";
import { Table, Tag, Button, Space, Typography, message, Input, Divider } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import NongyneDiagnosisService from "../../../services/nongyneDiagnosisService";
import legacyReportService from "../../../services/legacyReportService";
import { ArchiveItem } from "../../../services/archiveService";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import dayjs from "dayjs";
import AccessionTag from "../../../components/AccessionTag";

const { Text, Title } = Typography;

const PAGE_SIZE = 20;

interface Props {
  hospital_id?: number;
}

const NonGyneReportHistory: React.FC<Props> = ({ hospital_id }) => {
  const [rows, setRows] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState<string | undefined>(undefined);

  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const fetchData = useCallback(async (p: number, search?: string) => {
    setLoading(true);
    try {
      const data = await NongyneDiagnosisService.getArchive(p, PAGE_SIZE, search, hospital_id);
      setRows(data.items);
      setTotal(data.total);
    } catch {
      message.error("ไม่สามารถดึงข้อมูลรายงานได้");
    } finally {
      setLoading(false);
    }
  }, [hospital_id]);

  useEffect(() => { fetchData(1, undefined); }, [fetchData]);

  const onSearch = (value: string) => {
    const s = value.trim() || undefined;
    setSearchText(s);
    setPage(1);
    fetchData(1, s);
  };

  const handleViewPDF = async (row: ArchiveItem) => {
    const key = `${row.source}-${row.id}`;
    try {
      setPreviewLoadingId(key);
      const blob =
        row.source === "current"
          ? await NongyneDiagnosisService.getPublishedReportPdf(row.id)
          : await legacyReportService.getPdf("nongyne", row.id);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setIsModalOpen(true);
      if (row.source === "legacy") legacyReportService.markRead("nongyne", row.id).catch(() => {});
    } catch {
      message.error("ไม่สามารถโหลดรายงานได้");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      render: (text: string) => <AccessionTag value={text} copyable />,
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, r: ArchiveItem) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            {[r.patient_title, r.patient_name, r.patient_ln].filter(Boolean).join(" ") || "-"}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            HN: {r.patient_hn || "-"}
            {r.patient_gender ? ` | ${r.patient_gender}` : ""}
            {r.patient_age ? ` (${r.patient_age}y)` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Department",
      dataIndex: "department_name",
      key: "department_name",
      render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: "Specimen",
      dataIndex: "specimen",
      key: "specimen",
      width: 180,
      render: (v: string) => v
        ? <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{v}</span>
        : <Text type="secondary">-</Text>,
    },
    {
      title: "Clinician",
      dataIndex: "clinician_name",
      key: "clinician_name",
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Pathologist",
      dataIndex: "pathologist_name",
      key: "pathologist_name",
      render: (text: string) => <Tag color="geekblue">{text || "-"}</Tag>,
    },
    {
      title: "Malignancy",
      dataIndex: "has_malignancy",
      key: "has_malignancy",
      width: 100,
      render: (val: boolean | undefined) =>
        val === undefined || val === null ? (
          <Tag>-</Tag>
        ) : val ? (
          <Tag color="orange">Positive</Tag>
        ) : (
          <Tag color="green">Negative</Tag>
        ),
    },
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      width: 120,
      render: (d: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: string) => (
        <Tag color={s?.toLowerCase() === "published" ? "green" : "orange"}>{s?.toUpperCase() || "-"}</Tag>
      ),
    },
    {
      title: "PDF",
      key: "pdf",
      width: 110,
      fixed: "right" as const,
      render: (_: unknown, r: ArchiveItem) => {
        const canView = r.source === "legacy" || r.status?.toLowerCase() === "published";
        if (!canView) return <Text type="secondary" style={{ fontSize: 12 }}>In Progress</Text>;
        return (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<FileSearchOutlined />}
            loading={previewLoadingId === `${r.source}-${r.id}`}
            onClick={() => handleViewPDF(r)}
          >
            View PDF
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Total {total} records (current + legacy)
        </Text>
        <Input.Search
          placeholder="Search HN, Name, Accession No..."
          onSearch={onSearch}
          style={{ width: 300 }}
          allowClear
          enterButton
        />
      </div>
      <Table
        dataSource={rows}
        columns={columns}
        rowKey={(r) => `${r.source}-${r.id}`}
        loading={loading}
        scroll={{ x: 1390, y: "calc(100vh - 360px)" }}
        sticky
        size="middle"
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            fetchData(p, searchText);
          },
          showTotal: (t) => `Total ${t} records`,
        }}
        expandable={{
          rowExpandable: (r) => r.source === "current",
          expandedRowRender: (r) => (
            <div style={{ background: "#fafafa", padding: 24, borderRadius: 8, border: "1px solid #f0f0f0" }}>
              <Title level={5}>
                <FileSearchOutlined /> Report Details (ID: {r.id})
              </Title>
              <Divider style={{ margin: "12px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <Space direction="vertical">
                  <div><Text type="secondary"><b>Clinician:</b></Text><p>{r.clinician_name || "-"}</p></div>
                </Space>
              </div>
            </div>
          ),
        }}
      />
      <ReportPreviewModal open={isModalOpen} pdfUrl={pdfUrl} onCancel={() => setIsModalOpen(false)} />
    </>
  );
};

export default NonGyneReportHistory;
