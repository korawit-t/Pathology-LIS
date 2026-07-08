import React, { useState } from "react";
import {
  Layout,
  Typography,
  Input,
  Card,
  Table,
  Tag,
  Button,
  message,
  Flex,
  Badge,
  Space,
} from "antd";
import {
  SearchOutlined,
  LogoutOutlined,
  FilePdfOutlined,
  UserOutlined,
  IdcardOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../hooks/useAuth";
import SurgicalReportService from "../../services/surgicalReportService";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import legacyReportService from "../../services/legacyReportService";
import { ArchiveItem } from "../../services/archiveService";
import dayjs from "dayjs";
import { useTheme } from "../../contexts/ThemeContext";
import logger from "../../utils/logger";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type CaseType = "surgical" | "gyne" | "nongyne";

interface SearchRow extends ArchiveItem {
  _type: CaseType;
  _rowKey: string;
}


const PAGE_SIZE = 20;

const ResultPage: React.FC = () => {
  const { logout } = useAuth();
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [pdfLoadingKey, setPdfLoadingKey] = useState<string | null>(null);

  const doSearch = async (patientQ?: string, clinicianQ?: string) => {
    if (!patientQ && !clinicianQ) return;
    setLoading(true);
    setPage(1);
    setHasSearched(true);
    try {
      const [surg, gyne, nongyne] = await Promise.all([
        SurgicalReportService.getArchive(
          1,
          100,
          patientQ,
          undefined,
          clinicianQ,
        ),
        GyneDiagnosisService.getArchive(
          1,
          100,
          patientQ,
          undefined,
          clinicianQ,
        ),
        NongyneDiagnosisService.getArchive(
          1,
          100,
          patientQ,
          undefined,
          clinicianQ,
        ),
      ]);

      const normalize = (items: ArchiveItem[], type: CaseType): SearchRow[] =>
        items.map((r) => ({
          ...r,
          _type: type,
          _rowKey: `${type}-${r.source}-${r.id}`,
        }));

      const merged = [
        ...normalize(surg.items, "surgical"),
        ...normalize(gyne.items, "gyne"),
        ...normalize(nongyne.items, "nongyne"),
      ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      setRows(merged);
    } catch (err) {
      logger.error("Search error:", err);
      message.error("ค้นหาไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const onSearchPatient = (value: string) => {
    if (!value || value.trim().length < 3)
      return message.warning("กรุณากรอกอย่างน้อย 3 ตัวอักษร");
    doSearch(value.trim(), undefined);
  };

  const onSearchผู้ส่งตรวจ = (value: string) => {
    if (!value || value.trim().length < 3)
      return message.warning("กรุณากรอกอย่างน้อย 3 ตัวอักษร");
    doSearch(undefined, value.trim());
  };

  const buildPdfFilename = (row: SearchRow): string => {
    const parts = [row.patient_title, row.patient_name, row.patient_ln]
      .filter(Boolean)
      .join("");
    const hn = row.patient_hn || "unknown";
    return `${parts}_HN${hn}.pdf`.replace(/[/\\:*?"<>|]/g, "_");
  };

  const isOutlabOnly = (row: SearchRow) =>
    row.source !== "legacy" &&
    row._type === "gyne" &&
    row.status?.toLowerCase() !== "published" &&
    !!row.has_outlab_result;

  const fetchBlob = async (row: SearchRow): Promise<Blob> => {
    if (row.source === "legacy") {
      const blob = await legacyReportService.getPdf(row._type, row.id);
      legacyReportService.markRead(row._type, row.id).catch(() => {});
      return blob;
    } else if (row._type === "gyne" && isOutlabOnly(row)) {
      return GyneCytologyCaseService.downloadOutlabTestResult(row.case_id!);
    } else if (row._type === "gyne") {
      const blob = await GyneDiagnosisService.getReportPdf(row.id);
      GyneDiagnosisService.markRead(row.id).catch(() => {});
      return blob;
    } else if (row._type === "nongyne") {
      return NongyneDiagnosisService.getPublishedReportPdf(row.id);
    } else {
      const blob = await SurgicalReportService.getReportPdf(row.id);
      SurgicalReportService.markRead(row.id).catch(() => {});
      return blob;
    }
  };

  const handleViewPDF = async (row: SearchRow) => {
    const key = `${row._rowKey}-view`;
    try {
      setPdfLoadingKey(key);
      message.loading({ content: "กำลังโหลดรายงาน...", key: "pdf" });
      const blob = await fetchBlob(row);
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      message.destroy("pdf");
    } catch {
      message.error({ content: "ไม่สามารถโหลดรายงานได้", key: "pdf" });
    } finally {
      setPdfLoadingKey(null);
    }
  };

  const handleDownloadPDF = async (row: SearchRow) => {
    const key = `${row._rowKey}-dl`;
    try {
      setPdfLoadingKey(key);
      message.loading({ content: "กำลังดาวน์โหลด...", key: "pdf" });
      const blob = await fetchBlob(row);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildPdfFilename(row);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.destroy("pdf");
    } catch {
      message.error({ content: "ไม่สามารถดาวน์โหลดได้", key: "pdf" });
    } finally {
      setPdfLoadingKey(null);
    }
  };

  const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      title: "วันลงทะเบียน",
      dataIndex: "registered_date",
      width: 110,
      render: (d: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "วันที่ออกผล",
      dataIndex: "date",
      width: 110,
      render: (d: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Accession No",
      dataIndex: "accession_no",
      width: 130,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "HN",
      dataIndex: "patient_hn",
      width: 100,
    },
    {
      title: "Patient",
      key: "patient",
      width: 240,
      render: (_: unknown, r: SearchRow) =>
        [r.patient_title, r.patient_name, r.patient_ln]
          .filter(Boolean)
          .join(" ") || "-",
    },
    {
      title: "Specimen",
      key: "specimen",
      width: 180,
      render: (_: unknown, r: SearchRow) => (
        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {r.specimen || <Text type="secondary">-</Text>}
          {r._type === "nongyne" && r.collection_site && (
            <div style={{ fontSize: 11, color: "#8c8c8c", marginTop: 2 }}>
              {r.collection_site}
            </div>
          )}
        </span>
      ),
    },
    {
      title: "ผู้ส่งตรวจ",
      dataIndex: "clinician_name",
      width: 160,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Pathologist",
      dataIndex: "pathologist_name",
      width: 160,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Status",
      key: "status",
      width: 140,
      render: (_: unknown, r: SearchRow) => {
        const s = r.status?.toLowerCase();
        if (isOutlabOnly(r)) {
          return <Tag color="cyan">ผล Out-lab</Tag>;
        }
        const color =
          s === "published" ? "green"
          : s === "in_progress" ? "default"
          : "orange";
        const label =
          s === "published" ? "รายงานแล้ว"
          : s === "in_progress" ? "กำลังดำเนินการ"
          : s === "draft" ? "Draft"
          : s === "pending" ? "รอ Approve"
          : r.status?.toUpperCase() || "-";
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "Report (PDF)",
      align: "center" as const,
      width: 150,
      fixed: "right" as const,
      render: (_: unknown, r: SearchRow) => {
        const canView = r.source === "legacy" || r.status?.toLowerCase() === "published" || isOutlabOnly(r);
        if (!canView)
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              In Progress
            </Text>
          );
        return (
          <Space size={4}>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<FilePdfOutlined />}
              loading={pdfLoadingKey === `${r._rowKey}-view`}
              onClick={() => handleViewPDF(r)}
            >
              ดูผล
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={pdfLoadingKey === `${r._rowKey}-dl`}
              onClick={() => handleDownloadPDF(r)}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Header
        style={{
          background: isDarkMode
            ? "rgba(0,21,41,0.8)"
            : "rgba(255,255,255,0.8)",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Title level={4} style={{ margin: 0, color: "#1890ff" }}>
          Pathology Results
        </Title>
        <Button type="text" icon={<LogoutOutlined />} onClick={logout}>
          Sign out
        </Button>
      </Header>

      <Content style={{ padding: "32px 20px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Search card */}
          <Card
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}
          >
            <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
              ค้นหาด้วย HN / ชื่อผู้ป่วย หรือค้นหาตาม ผู้ส่งตรวจ
            </Text>
            <Flex gap={8} align="center">
              <Input.Search
                prefix={<IdcardOutlined style={{ color: "#bfbfbf" }} />}
                placeholder="HN หรือชื่อผู้ป่วย..."
                enterButton={<Button type="primary" icon={<SearchOutlined />}>ค้นหาผู้ป่วย</Button>}
                size="large"
                loading={loading}
                onSearch={onSearchPatient}
                allowClear
                style={{ flex: 1 }}
              />
              <div style={{ width: 1, height: 40, background: "#f0f0f0", margin: "0 4px", flexShrink: 0 }} />
              <Input.Search
                prefix={<UserOutlined style={{ color: "#bfbfbf" }} />}
                placeholder="ชื่อ ผู้ส่งตรวจ..."
                enterButton={<Button icon={<UserOutlined />}>ค้นหา ผู้ส่งตรวจ</Button>}
                size="large"
                loading={loading}
                onSearch={onSearchผู้ส่งตรวจ}
                allowClear
                style={{ flex: 1 }}
              />
            </Flex>
          </Card>

          {/* Results */}
          <Card
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            title={
              hasSearched ? (
                <Flex align="center" gap={8}>
                  <Text strong>ผลการค้นหา</Text>
                  <Badge count={rows.length} showZero color="#1890ff" overflowCount={999} />
                </Flex>
              ) : null
            }
          >
            <Table
              dataSource={pagedRows}
              rowKey="_rowKey"
              loading={loading}
              scroll={{ x: 1350, y: "calc(100vh - 360px)" }}
              sticky
              columns={columns}
              size="middle"
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total: rows.length,
                onChange: (p) => setPage(p),
                hideOnSinglePage: true,
                showTotal: (t) => `พบ ${t} รายการ`,
              }}
              locale={{
                emptyText: hasSearched ? "ไม่พบข้อมูล" : "กรอก HN, ชื่อผู้ป่วย หรือ ผู้ส่งตรวจ เพื่อค้นหา",
              }}
            />
          </Card>
        </div>
      </Content>

    </Layout>
  );
};

export default ResultPage;
