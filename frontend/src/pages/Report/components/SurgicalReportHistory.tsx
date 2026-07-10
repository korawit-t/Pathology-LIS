import React, { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { sanitizeHtml } from "../../../utils/sanitize";
import { Table, Tag, Button, Space, Typography, message, Divider, Image } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import SurgicalReportService from "../../../services/surgicalReportService";
import legacyReportService from "../../../services/legacyReportService";
import { MicroscopicImageSnapshot } from "../../../types/surgicalReport";
import MicroscopicImageService from "../../../services/microscopicImageService";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import { ArchiveItem } from "../../../services/archiveService";
import dayjs from "dayjs";
import AccessionTag from "../../../components/AccessionTag";
import logger from "../../../utils/logger";
import SecureImage from "../../../components/SecureImage";

const { Text, Title } = Typography;

const PAGE_SIZE = 20;

interface Props {
  hospital_id?: number;
}

export interface ReportHistoryHandle {
  search: (value: string) => void;
}

const SurgicalReportHistory = forwardRef<ReportHistoryHandle, Props>(({ hospital_id }, ref) => {
  const [rows, setRows] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState<string | undefined>(undefined);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const fetchData = useCallback(async (p: number, search?: string) => {
    setLoading(true);
    try {
      const data = await SurgicalReportService.getArchive(p, PAGE_SIZE, search, hospital_id);
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      logger.error("Fetch Error:", error);
      message.error("ไม่สามารถดึงข้อมูลรายงานได้");
    } finally {
      setLoading(false);
    }
  }, [hospital_id]);

  useEffect(() => { fetchData(1, undefined); }, [fetchData]);

  const onSearch = useCallback((value: string) => {
    const s = value.trim() || undefined;
    setSearchText(s);
    setPage(1);
    fetchData(1, s);
  }, [fetchData]);

  useImperativeHandle(ref, () => ({ search: onSearch }), [onSearch]);

  const handleViewPDF = async (row: ArchiveItem) => {
    const key = `${row.source}-${row.id}`;
    try {
      setPreviewLoadingId(key);
      const blob =
        row.source === "current"
          ? await SurgicalReportService.getReportPdf(row.id)
          : await legacyReportService.getPdf("surgical", row.id);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setIsModalOpen(true);
      if (row.source === "legacy") legacyReportService.markRead("surgical", row.id).catch(() => {});
    } catch (error) {
      logger.error("View PDF Error:", error);
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
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">-</Text>,
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
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Total {total} records (current + legacy)
        </Text>
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
          expandedRowRender: (r) => {
            const record = r as ArchiveItem & {
              patient_cid?: string;
              clinical_history_snapshot?: string;
              specimen_summary?: string;
              diagnosis_summary?: string;
              microscopic_images?: MicroscopicImageSnapshot[];
              comment_summary?: string;
            };
            return (
              <div style={{ background: "#fafafa", padding: 24, borderRadius: 8, border: "1px solid #f0f0f0" }}>
                <Title level={5}>
                  <FileSearchOutlined /> Report Details (ID: {record.id})
                </Title>
                <Divider style={{ margin: "12px 0" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <Text type="secondary"><b>Clinician:</b></Text>
                    <p>{record.clinician_name || "-"}</p>
                  </div>
                </div>
                <Divider plain>Diagnostic Result</Divider>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Diagnosis Summary:</Text>
                  <div
                    style={{ background: "#e6f7ff", padding: 15, border: "1px solid #91d5ff", borderRadius: 4, marginTop: 8 }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.diagnosis_summary || "") /* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */ }}
                  />
                </div>
                {record.microscopic_images && record.microscopic_images.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <Text type="secondary"><b>Microscopic Images:</b></Text>
                    <div style={{ marginTop: 8, padding: 12, background: "#fff", border: "1px solid #ddd", borderRadius: 4 }}>
                      <Image.PreviewGroup>
                        <Space size={[12, 12]} wrap>
                          {record.microscopic_images.map((img: MicroscopicImageSnapshot) => (
                            <div key={img.id} style={{ textAlign: "center" }}>
                              <SecureImage
                                width={120}
                                height={90}
                                style={{ objectFit: "cover", borderRadius: 4 }}
                                src={MicroscopicImageService.getSecureImageUrl(img.image_url)}
                              />
                              {img.magnification && (
                                <div style={{ fontSize: 10, color: "#8c8c8c" }}>{img.magnification}</div>
                              )}
                            </div>
                          ))}
                        </Space>
                      </Image.PreviewGroup>
                    </div>
                  </div>
                )}
                {record.comment_summary && (
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary"><b>Comments/Suggestions:</b></Text>
                    <div
                      style={{ background: "#fffbe6", padding: 10, border: "1px solid #ffe58f", borderRadius: 4, marginTop: 4 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.comment_summary) /* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */ }}
                    />
                  </div>
                )}
              </div>
            );
          },
        }}
      />
      <ReportPreviewModal open={isModalOpen} pdfUrl={pdfUrl} onCancel={() => setIsModalOpen(false)} />
    </>
  );
});

export default SurgicalReportHistory;
