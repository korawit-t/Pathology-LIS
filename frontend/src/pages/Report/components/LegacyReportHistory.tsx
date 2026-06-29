import React, { useCallback, useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Input,
  Tabs,
} from "antd";
import type { TablePaginationConfig } from "antd";
import { FilePdfOutlined, HistoryOutlined } from "@ant-design/icons";
import legacyReportService, {
  LegacyReport,
  LegacyReportType,
} from "../../../services/legacyReportService";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import dayjs from "dayjs";
import AccessionTag from "../../../components/AccessionTag";

const { Text } = Typography;

interface Props {
  hospital_id?: number;
  singleType?: LegacyReportType;
}

const PAGE_SIZE = 20;

const LegacyTab: React.FC<{ type: LegacyReportType; hospital_id?: number }> = ({
  type,
  hospital_id,
}) => {
  const [items, setItems] = useState<LegacyReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetch = useCallback(
    async (p = 1, s = search) => {
      setLoading(true);
      try {
        const res = await legacyReportService.getList(type, {
          skip: (p - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
          search: s || undefined,
          hospital_id,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
      } catch {
        message.error("ไม่สามารถดึงข้อมูลได้");
      } finally {
        setLoading(false);
      }
    },
    [type, hospital_id, search],
  );

  useEffect(() => {
    fetch(1, "");
  }, [type, hospital_id]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleViewPDF = async (id: number) => {
    try {
      setPdfLoadingId(id);
      const blob = await legacyReportService.getPdf(type, id);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setModalOpen(true);
      legacyReportService.markRead(type, id).catch(() => {});
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: true, read_at: new Date().toISOString() } : r)));
    } catch {
      message.error("ไม่สามารถโหลด PDF ได้");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const summaryCell = (r: LegacyReport) => {
    if (type === "surgical") return r.specimen_summary || r.diagnosis_summary || "-";
    if (type === "gyne") return [r.adequacy_text, r.category_1_text, r.category_2_text].filter(Boolean).join(" / ") || "-";
    return r.specimen_type ? `${r.specimen_type}${r.collection_site ? ` – ${r.collection_site}` : ""}` : "-";
  };

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      render: (v: string) => <AccessionTag value={v} copyable />,
    },
    {
      title: "HN",
      dataIndex: "patient_hn",
      width: 90,
    },
    {
      title: "Patient",
      key: "patient",
      width: 200,
      render: (r: LegacyReport) =>
        [r.patient_title, r.patient_name, r.patient_ln].filter(Boolean).join(" ") || "-",
    },
    {
      title: "Hospital",
      dataIndex: "hospital_name",
      width: 160,
      render: (v: string) => <Text type="secondary">{v || "-"}</Text>,
    },
    {
      title: "Summary",
      key: "summary",
      width: 220,
      render: (r: LegacyReport) => <Text type="secondary">{summaryCell(r)}</Text>,
    },
    {
      title: "Pathologist",
      dataIndex: "pathologist_name",
      width: 160,
      render: (v: string) => <Tag color="geekblue">{v || "-"}</Tag>,
    },
    {
      title: "Reported",
      key: "reported",
      width: 120,
      render: (r: LegacyReport) => {
        const d = r.published_at || r.reported_at;
        return d ? dayjs(d).format("DD/MM/YYYY") : "-";
      },
    },
    {
      title: "PDF",
      align: "center" as const,
      width: 110,
      render: (r: LegacyReport) => (
        <Button
          type={r.is_read === false ? "primary" : "default"}
          size="small"
          icon={<FilePdfOutlined />}
          loading={pdfLoadingId === r.id}
          onClick={() => handleViewPDF(r.id)}
          style={r.is_read === false ? { borderColor: "#f5222d", background: "#fff1f0", color: "#f5222d" } : {}}
        >
          {r.is_read === false ? "Unread" : "Open"}
        </Button>
      ),
    },
  ];

  const handleTableChange = (pagination: TablePaginationConfig) => {
    fetch(pagination.current ?? 1, search);
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Input.Search
          placeholder="Search HN, name, accession no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => { setSearch(v); fetch(1, v); }}
          allowClear
          onClear={() => { setSearch(""); fetch(1, ""); }}
          enterButton
          style={{ width: 300 }}
        />
      </div>
      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1100, y: "calc(100vh - 360px)" }}
        sticky
        onRow={(r) => ({
          style: r.is_read === false ? { background: "#fff2f0" } : {},
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `Total ${t} records`,
          showSizeChanger: false,
        }}
        onChange={handleTableChange}
        locale={{ emptyText: "ไม่มีข้อมูล Legacy" }}
      />
      <ReportPreviewModal
        open={modalOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
};

const LegacyReportHistory: React.FC<Props> = ({ hospital_id, singleType }) => {
  const [tab, setTab] = useState("surgical");

  if (singleType) {
    return <LegacyTab type={singleType} hospital_id={hospital_id} />;
  }

  const tabs = [
    { key: "surgical", label: "Surgical Pathology", children: <LegacyTab type="surgical" hospital_id={hospital_id} /> },
    { key: "gyne", label: "Gyne Cytology", children: <LegacyTab type="gyne" hospital_id={hospital_id} /> },
    { key: "nongyne", label: "Non-Gyne Cytology", children: <LegacyTab type="nongyne" hospital_id={hospital_id} /> },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, color: "#8c8c8c", fontSize: 13 }}>
        <HistoryOutlined />
        <span>ข้อมูลที่นำเข้าจากระบบเก่า (MSSQL Migration) — read-only</span>
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={tabs} />
    </>
  );
};

export default LegacyReportHistory;
