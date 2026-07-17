import React, { useState, useCallback } from "react";
import {
  Table,
  Tag,
  Space,
  Typography,
  DatePicker,
  Button,
  Row,
  Col,
  Statistic,
  Card,
  Modal,
  Tooltip,
  Divider,
  Tabs,
  Select,
} from "antd";
import type { TablePaginationConfig } from "antd/es/table";
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  FilePdfOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";
import { stripHtmlToText } from "../../utils/sanitize";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import api from "../../services/httpClient";
import type { CorrelationRecord } from "../../services/cytoHistoCorrelationService";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import NongyneReportService from "../../services/nongyneReportService";
import SurgicalReportService from "../../services/surgicalReportService";
import logger from "../../utils/logger";

const { Text } = Typography;
const { RangePicker } = DatePicker;

const RESULT_OPTIONS = [
  { value: "agree",             label: "Agree",             color: "green"   },
  { value: "minor_discrepancy", label: "Minor Discrepancy", color: "orange"  },
  { value: "major_discrepancy", label: "Major Discrepancy", color: "red"     },
  { value: "no_follow_up",      label: "No Follow-up",      color: "default" },
];

function ResultTag({ value }: { value: string }) {
  const opt = RESULT_OPTIONS.find((o) => o.value === value);
  if (!opt) return <Tag>{value}</Tag>;
  const icon = value === "agree" ? <CheckCircleOutlined /> : value.includes("discrepancy") ? <ExclamationCircleOutlined /> : undefined;
  return <Tag color={opt.color} icon={icon}>{opt.label}</Tag>;
}

interface ListResponse {
  items: CorrelationRecord[];
  total: number;
}

interface CorrelationSummary {
  hsil_total: number;
  hsil_major_discordant: number;
  hsil_minor_discordant: number;
}

interface GroupCaseRow {
  id: number;
  accession_no: string;
  hn: string | null;
  patient_title: string | null;
  patient_name: string | null;
  patient_ln: string | null;
  specimen_type: string | null;
  registered_at: string | null;
  category_1_code: string | null;
  category_1_text: string | null;
  category_code: string | null;
  category_text: string | null;
  interpretation: string | null;
}

const PAGE_SIZE = 20;

const CytoHistoCorrelationReport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"gyne" | "nongyne">("gyne");
  const [data, setData] = useState<CorrelationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [resultFilter, setResultFilter] = useState<string | null>(null);

  const [summary, setSummary] = useState<CorrelationSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [hsilModalOpen, setHsilModalOpen] = useState(false);
  const [hsilModalLoading, setHsilModalLoading] = useState(false);
  const [hsilModalLabel, setHsilModalLabel] = useState("");
  const [hsilCaseData, setHsilCaseData] = useState<GroupCaseRow[]>([]);
  const [hsilCorrelationData, setHsilCorrelationData] = useState<CorrelationRecord[]>([]);
  const [hsilModalKind, setHsilModalKind] = useState<"cases" | "correlations">("cases");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);

  const openPdf = async (key: string, fetcher: () => Promise<Blob>, title: string) => {
    try {
      setPreviewLoadingKey(key);
      const blob = await fetcher();
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewTitle(title);
      setPreviewOpen(true);
    } catch (err) {
      logger.error("openPdf", err);
    } finally {
      setPreviewLoadingKey(null);
    }
  };

  const fetchSummary = useCallback(async (range = dateRange) => {
    setSummaryLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (range) {
        params.start_date = range[0].format("YYYY-MM-DD");
        params.end_date = range[1].format("YYYY-MM-DD");
      }
      const res = await api.get<CorrelationSummary>("/cyto-histo-correlations/summary", { params });
      setSummary(res.data);
    } catch (err) {
      logger.error("CytoHistoCorrelationReport summary fetch", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange]);

  const openHsilCases = useCallback(async (label: string) => {
    setHsilModalKind("cases");
    setHsilModalLabel(label);
    setHsilModalOpen(true);
    setHsilModalLoading(true);
    try {
      const params: Record<string, unknown> = { group: "hsil_plus" };
      if (dateRange) {
        params.start_date = dateRange[0].format("YYYY-MM-DD");
        params.end_date = dateRange[1].format("YYYY-MM-DD");
      }
      const res = await api.get<GroupCaseRow[]>("/cyto-histo-correlations/summary/cases", { params });
      setHsilCaseData(res.data);
    } catch (err) {
      logger.error("CytoHistoCorrelationReport hsil cases fetch", err);
    } finally {
      setHsilModalLoading(false);
    }
  }, [dateRange]);

  const openHsilDiscordant = useCallback(async (result: string, label: string) => {
    setHsilModalKind("correlations");
    setHsilModalLabel(label);
    setHsilModalOpen(true);
    setHsilModalLoading(true);
    try {
      const params: Record<string, unknown> = { result };
      if (dateRange) {
        params.start_date = dateRange[0].format("YYYY-MM-DD");
        params.end_date = dateRange[1].format("YYYY-MM-DD");
      }
      const res = await api.get<CorrelationRecord[]>("/cyto-histo-correlations/hsil-discordant", { params });
      setHsilCorrelationData(res.data);
    } catch (err) {
      logger.error("CytoHistoCorrelationReport hsil discordant fetch", err);
    } finally {
      setHsilModalLoading(false);
    }
  }, [dateRange]);

  const fetchData = useCallback(async (p = 1, result = resultFilter, range = dateRange, tab = activeTab) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE };
      if (result) params.result = result;
      params.case_type = tab;
      if (range) {
        params.start_date = range[0].format("YYYY-MM-DD");
        params.end_date = range[1].format("YYYY-MM-DD");
      }
      const res = await api.get<ListResponse>("/cyto-histo-correlations", { params });
      setData(res.data.items);
      setTotal(res.data.total);
      setPage(p);
    } catch (err) {
      logger.error("CytoHistoCorrelationReport fetch", err);
    } finally {
      setLoading(false);
    }
  }, [resultFilter, dateRange, activeTab]);

  // Summary counts from loaded data (approximation for current page; real totals need a stats endpoint)
  const counts = RESULT_OPTIONS.reduce((acc, o) => {
    acc[o.value] = data.filter((r) => r.correlation_result === o.value).length;
    return acc;
  }, {} as Record<string, number>);
  const agreeRate = data.length > 0 ? Math.round((counts.agree / data.length) * 100) : 0;
  const discrepancyRate = data.length > 0 ? Math.round(((counts.minor_discrepancy + counts.major_discrepancy) / data.length) * 100) : 0;

  const columns = [
    {
      title: "Cytology Accession",
      key: "cyto_acc",
      render: (r: CorrelationRecord) => (
        <div>
          <Text strong style={{ color: "#722ed1", display: "block" }}>{r.cytology_accession_no ?? `#${r.nongyne_case_id ?? r.gyne_case_id}`}</Text>
          <Tag color={r.case_type === "gyne" ? "green" : "orange"} style={{ fontSize: 10 }}>
            {r.case_type === "gyne" ? "Gyne" : "Non-Gyne"}
          </Tag>
        </div>
      ),
      width: 150,
    },
    {
      title: "Surgical Accession",
      dataIndex: "surgical_accession_no",
      key: "surgical_acc",
      width: 150,
      render: (v: string) => <Text strong style={{ color: "#1677ff" }}>{v}</Text>,
    },
    {
      title: "Cytology Diagnosis",
      key: "cyto_dx",
      render: (r: CorrelationRecord) => (
        <div>
          {r.cytology_diagnosis_snapshot
            ? <Text style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{r.cytology_diagnosis_snapshot}</Text>
            : <Text type="secondary">—</Text>
          }
          {r.cytology_report_id && (
            <div style={{ marginTop: 4 }}>
              <Tooltip title="View Cytology Report PDF">
                <Button
                  type="link"
                  size="small"
                  icon={<FilePdfOutlined style={{ color: "#ff4d4f" }} />}
                  loading={previewLoadingKey === `cyto-${r.id}`}
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={() =>
                    openPdf(
                      `cyto-${r.id}`,
                      () => r.case_type === "gyne"
                        ? GyneDiagnosisService.getReportPdf(r.cytology_report_id!)
                        : NongyneReportService.getReportPdf(r.cytology_report_id!),
                      `Cytology Report — ${r.cytology_accession_no ?? ""}`,
                    )
                  }
                >
                  Report PDF
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Histology Diagnosis",
      key: "histo_dx",
      render: (r: CorrelationRecord) => (
        <div>
          {r.histology_diagnosis
            ? <Text style={{ whiteSpace: "pre-wrap" }}>{r.histology_diagnosis}</Text>
            : <Text type="secondary">—</Text>
          }
          {r.surgical_report_id && (
            <div style={{ marginTop: 4 }}>
              <Tooltip title="View Surgical Report PDF">
                <Button
                  type="link"
                  size="small"
                  icon={<FilePdfOutlined style={{ color: "#ff4d4f" }} />}
                  loading={previewLoadingKey === `surg-${r.id}`}
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={() =>
                    openPdf(
                      `surg-${r.id}`,
                      () => SurgicalReportService.getReportPdf(r.surgical_report_id!),
                      `Surgical Report — ${r.surgical_accession_no}`,
                    )
                  }
                >
                  Report PDF
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Result",
      dataIndex: "correlation_result",
      key: "result",
      width: 160,
      render: (v: string) => <ResultTag value={v} />,
    },
    {
      title: "Comment",
      dataIndex: "comment",
      key: "comment",
      width: 180,
      render: (v: string) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : null,
    },
    {
      title: "Recorded By",
      key: "by",
      width: 160,
      render: (r: CorrelationRecord) => (
        <div>
          <Text style={{ fontSize: 12, display: "block" }}>{r.correlated_by?.full_name ?? "—"}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.correlated_at).format("DD/MM/YYYY HH:mm")}</Text>
        </div>
      ),
    },
  ];

  const handleTabChange = (key: string) => {
    const tab = key as "gyne" | "nongyne";
    setActiveTab(tab);
    setData([]);
    setTotal(0);
    setSummary(null);
    setResultFilter(null);
    setDateRange(null);
    setPage(1);
  };

  const tabContent = (tab: "gyne" | "nongyne") => (
    <div>
      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
          format="DD/MM/YYYY"
          placeholder={["Start date", "End date"]}
        />
        <Select
          allowClear
          placeholder="All results"
          style={{ width: 180 }}
          value={resultFilter}
          onChange={setResultFilter}
          options={RESULT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { fetchData(1, resultFilter, dateRange, tab); if (tab === "gyne") fetchSummary(); }}>
          Search
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => { setDateRange(null); setResultFilter(null); setData([]); setTotal(0); setSummary(null); }}>
          Reset
        </Button>
      </Space>

      {/* HSIL+ Cyto-Histo Discordant — Gyne only */}
      {tab === "gyne" && (summary || summaryLoading) && (
        <div style={{ marginBottom: 20, maxWidth: 420 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Divider orientation={"left" as any} style={{ marginTop: 4, marginBottom: 12, fontWeight: 600 }}>
            HSIL หรือสูงกว่า — Cyto-Histo Correlation
          </Divider>
          <Table<{ key: string; label: string; count: number; color?: string }>
            loading={summaryLoading}
            dataSource={summary ? [
              { key: "hsil_total", label: "HSIL+ ทั้งหมด",    count: summary.hsil_total },
              { key: "major",      label: "Major Discordant", count: summary.hsil_major_discordant, color: "#cf1322" },
              { key: "minor",      label: "Minor Discordant", count: summary.hsil_minor_discordant, color: "#fa8c16" },
            ] : []}
            rowKey="key"
            pagination={false}
            size="small"
            bordered
            onRow={(row) => ({
              style: { cursor: "pointer" },
              onClick: () => {
                if (row.key === "hsil_total") openHsilCases(row.label);
                else if (row.key === "major") openHsilDiscordant("major_discrepancy", row.label);
                else openHsilDiscordant("minor_discrepancy", row.label);
              },
            })}
            columns={[
              {
                title: "ประเภท",
                dataIndex: "label",
                key: "label",
                render: (label: string, row) => <Text style={{ color: row.color }}>{label}</Text>,
              },
              {
                title: "จำนวน",
                dataIndex: "count",
                key: "count",
                align: "center" as const,
                width: 90,
                render: (v: number, row) => (
                  <Text strong style={{ color: v > 0 ? row.color : undefined }}>{v}</Text>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Summary cards */}
      {data.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" bordered={false} style={{ background: "#f6ffed", border: "1px solid #b7eb8f" }}>
              <Statistic title="Agree" value={counts.agree} valueStyle={{ color: "#52c41a" }}
                suffix={<Text type="secondary" style={{ fontSize: 13 }}>({agreeRate}%)</Text>} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bordered={false} style={{ background: "#fff7e6", border: "1px solid #ffd591" }}>
              <Statistic title="Minor Discrepancy" value={counts.minor_discrepancy} valueStyle={{ color: "#fa8c16" }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bordered={false} style={{ background: "#fff1f0", border: "1px solid #ffa39e" }}>
              <Statistic title="Major Discrepancy" value={counts.major_discrepancy} valueStyle={{ color: "#cf1322" }}
                suffix={<Text type="secondary" style={{ fontSize: 13 }}>({discrepancyRate}%)</Text>} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bordered={false} style={{ background: "#fafafa", border: "1px solid #d9d9d9" }}>
              <Statistic title="No Follow-up" value={counts.no_follow_up} />
            </Card>
          </Col>
        </Row>
      )}

      {data.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={() =>
              exportToCsv(
                `cyto-histo-correlation-p${page}`,
                data as unknown as Record<string, unknown>[],
                [
                  { header: "Cytology Accession", key: "cytology_accession_no" },
                  { header: "Case Type", key: "case_type" },
                  { header: "Surgical Accession", key: "surgical_accession_no" },
                  { header: "Cytology Diagnosis", key: "cytology_diagnosis_snapshot", render: (v) => v ? stripHtmlToText(String(v)) : "" },
                  { header: "Histology Diagnosis", key: "histology_diagnosis", render: (v) => String(v ?? "") },
                  { header: "Result", key: "correlation_result" },
                  { header: "Comment", key: "comment", render: (v) => String(v ?? "") },
                  { header: "Recorded By", key: "correlated_by", render: (_v, row) => (row.correlated_by as { full_name?: string } | null)?.full_name ?? "" },
                  { header: "Recorded At", key: "correlated_at", render: (v) => v ? dayjs(v as string).format("DD/MM/YYYY HH:mm") : "" },
                ],
              )
            }
          >
            Export CSV (หน้านี้)
          </Button>
        </div>
      )}
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `Total ${t} records`,
          onChange: (p) => fetchData(p),
        }}
        onChange={(pagination: TablePaginationConfig) => {
          if (pagination.current) fetchData(pagination.current);
        }}
        locale={{ emptyText: "Use the filters above and click Search to load records." }}
      />
    </div>
  );

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: "gyne",    label: "Gyne Cytology",     children: tabContent("gyne")    },
          { key: "nongyne", label: "Non-Gyne Cytology",  children: tabContent("nongyne") },
        ]}
      />

      <Modal
        open={previewOpen}
        title={previewTitle}
        footer={null}
        width={860}
        centered
        onCancel={() => {
          setPreviewOpen(false);
          if (previewUrl) window.URL.revokeObjectURL(previewUrl);
          setPreviewUrl("");
        }}
      >
        <iframe
          src={previewUrl}
          title={previewTitle}
          style={{ width: "100%", height: "72vh", border: "none" }}
        />
      </Modal>

      <Modal
        open={hsilModalOpen}
        title={`รายชื่อ — ${hsilModalLabel} (${hsilModalKind === "cases" ? hsilCaseData.length : hsilCorrelationData.length})`}
        footer={null}
        width={hsilModalKind === "cases" ? 960 : 1200}
        centered
        onCancel={() => setHsilModalOpen(false)}
      >
        {hsilModalKind === "cases" ? (
          <Table<GroupCaseRow>
            dataSource={hsilCaseData}
            loading={hsilModalLoading}
            rowKey="id"
            size="small"
            bordered
            pagination={{ pageSize: 10, showTotal: (t) => `Total ${t} cases` }}
            columns={[
              {
                title: "Accession No.",
                dataIndex: "accession_no",
                key: "accession_no",
                width: 130,
                render: (v: string) => <Text strong style={{ color: "#722ed1" }}>{v}</Text>,
              },
              { title: "HN", dataIndex: "hn", key: "hn", width: 110 },
              {
                title: "Patient",
                key: "patient",
                render: (r: GroupCaseRow) =>
                  [r.patient_title, r.patient_name, r.patient_ln].filter(Boolean).join(" ") || "—",
              },
              { title: "Specimen", dataIndex: "specimen_type", key: "specimen_type", width: 130 },
              {
                title: "Registered",
                dataIndex: "registered_at",
                key: "registered_at",
                width: 110,
                render: (v: string | null) => v ? dayjs(v).format("DD/MM/YYYY") : "—",
              },
              {
                title: "Diagnosis",
                key: "diagnosis",
                render: (r: GroupCaseRow) => (
                  <div>
                    {r.category_text
                      ? <Text>{r.category_text}{r.category_code ? ` (${r.category_code})` : ""}</Text>
                      : <Text type="secondary">—</Text>}
                    {r.interpretation && (
                      <div><Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.interpretation}</Text></div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <Table<CorrelationRecord>
            dataSource={hsilCorrelationData}
            columns={columns}
            loading={hsilModalLoading}
            rowKey="id"
            size="small"
            bordered
            pagination={{ pageSize: 10, showTotal: (t) => `Total ${t} records` }}
          />
        )}
      </Modal>
    </div>
  );
};

export default CytoHistoCorrelationReport;
