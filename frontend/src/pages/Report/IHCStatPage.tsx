import React, { useState, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  DatePicker,
  Button,
  Space,
  Typography,
  Table,
  Tag,
  Spin,
  Empty,
  Divider,
  Select,
} from "antd";
import { SearchOutlined, ReloadOutlined, TableOutlined, BarChartOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";
import { sanitizeHtml, stripHtmlToText } from "../../utils/sanitize";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import api from "../../services/httpClient";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarkerResult {
  option_value: string;
  option_label: string;
  count: number;
}

interface MarkerExtraFieldStat {
  field_id: number;
  label: string;
  total: number;
  results: MarkerResult[];
}

interface MarkerStat {
  ap_test_id: number;
  marker_name: string;
  total: number;
  results: MarkerResult[];
  extra_fields?: MarkerExtraFieldStat[];
}

interface IHCStats {
  surgical: MarkerStat[];
  nongyne: MarkerStat[];
}

interface CaseRow {
  accession_no: string;
  registered_at: string | null;
  specimen_label?: string;
  specimen_name?: string;
  diagnosis: string;
  ihc: Record<string, string>;
}

interface CaseList {
  columns: string[];
  rows: CaseRow[];
}

interface IHCCaseListData {
  surgical: CaseList;
  nongyne: CaseList;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = [
  "#1890ff",
  "#52c41a",
  "#ff4d4f",
  "#faad14",
  "#722ed1",
  "#13c2c2",
  "#fa541c",
  "#eb2f96",
];

function pickColor(index: number) {
  return PALETTE[index % PALETTE.length];
}

// ── Stat columns for summary table ────────────────────────────────────────────

const statTableColumns = (total: number): ColumnsType<MarkerResult> => [
  {
    title: "Result",
    dataIndex: "option_label",
    key: "option_label",
    render: (v: string, _: MarkerResult, idx: number) => (
      <Tag color={pickColor(idx)}>{v}</Tag>
    ),
  },
  { title: "Count", dataIndex: "count", key: "count" },
  {
    title: "%",
    key: "pct",
    render: (_: unknown, row: MarkerResult) =>
      total > 0 ? `${((row.count / total) * 100).toFixed(1)}%` : "0.0%",
  },
];

// ── MarkerCard (summary view) ─────────────────────────────────────────────────

const MarkerCard: React.FC<{ marker: MarkerStat }> = ({ marker }) => {
  const chartData = marker.results.map((r, i) => ({
    name: r.option_label,
    count: r.count,
    fill: pickColor(i),
  }));

  return (
    <Card
      size="small"
      title={
        <span>
          <Text strong>{marker.marker_name}</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            n={marker.total}
          </Text>
        </span>
      }
      style={{ borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}
      bordered={false}
    >
      <Row gutter={16} style={{ marginBottom: 8 }}>
        {marker.results.map((r, i) => (
          <Col key={r.option_value}>
            <Statistic
              title={<Tag color={pickColor(i)}>{r.option_label}</Tag>}
              value={r.count}
              valueStyle={{ color: pickColor(i), fontSize: 20 }}
            />
          </Col>
        ))}
      </Row>
      <Row gutter={24}>
        <Col xs={24} md={12}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Cases">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Col>
        <Col xs={24} md={12}>
          <Table<MarkerResult>
            size="small"
            dataSource={marker.results}
            rowKey="option_value"
            columns={statTableColumns(marker.total)}
            pagination={false}
          />
        </Col>
      </Row>

      {marker.extra_fields && marker.extra_fields.length > 0 && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          {marker.extra_fields.map((field) => (
            <div key={field.field_id} style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                {field.label} <Text type="secondary">(n={field.total})</Text>
              </Text>
              <Space size={[8, 8]} wrap>
                {field.results.map((r, i) => (
                  <Tag key={r.option_value || i} color={pickColor(i)}>
                    {r.option_label}: {r.count}
                    {field.total > 0 && ` (${((r.count / field.total) * 100).toFixed(1)}%)`}
                  </Tag>
                ))}
              </Space>
            </div>
          ))}
        </>
      )}
    </Card>
  );
};

// ── CaseListTable (detail study view) ────────────────────────────────────────

const CaseListTable: React.FC<{
  data: CaseList;
  isSurgical: boolean;
  loading: boolean;
  selectedMarkers: string[];
  exportFilename?: string;
}> = ({ data, isSurgical, loading, selectedMarkers, exportFilename }) => {
  const allMarkerCols = data.columns;
  const markerCols = selectedMarkers.length > 0
    ? allMarkerCols.filter((m) => selectedMarkers.includes(m))
    : allMarkerCols;
  const { rows } = data;

  const fixedCols: ColumnsType<CaseRow> = [
    {
      title: "Accession",
      dataIndex: "accession_no",
      key: "accession_no",
      fixed: "left",
      width: 130,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    ...(isSurgical
      ? [
          {
            title: "Spec",
            dataIndex: "specimen_label",
            key: "specimen_label",
            width: 55,
            render: (v: string) => <Tag>{v}</Tag>,
          } as ColumnsType<CaseRow>[number],
          {
            title: "Specimen",
            dataIndex: "specimen_name",
            key: "specimen_name",
            width: 150,
            ellipsis: true,
          } as ColumnsType<CaseRow>[number],
        ]
      : []),
    {
      title: "Date",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 100,
      render: (v: string | null) =>
        v ? dayjs(v).format("DD/MM/YYYY") : "-",
    },
    {
      title: "Diagnosis",
      dataIndex: "diagnosis",
      key: "diagnosis",
      render: (v: string) =>
        v ? (
          <div
            style={{ fontSize: 12, lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(v) /* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */ }}
          />
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  const ihcCols: ColumnsType<CaseRow> = markerCols.map((marker, i) => ({
    title: <Tag color={pickColor(i)}>{marker}</Tag>,
    key: marker,
    width: 110,
    render: (_: unknown, row: CaseRow) => {
      const val = row.ihc[marker];
      return val ? <Tag color={pickColor(i)}>{val}</Tag> : <Text type="secondary">—</Text>;
    },
  }));

  const handleExport = () => {
    const exportCols = [
      { header: "Accession", key: "accession_no" },
      ...(isSurgical
        ? [
            { header: "Spec", key: "specimen_label" },
            { header: "Specimen", key: "specimen_name" },
          ]
        : []),
      { header: "Date", key: "registered_at", render: (v: unknown) => v ? dayjs(v as string).format("DD/MM/YYYY") : "-" },
      { header: "Diagnosis", key: "diagnosis", render: (v: unknown) => v ? stripHtmlToText(String(v)) : "" },
      ...markerCols.map((m) => ({
        header: m,
        key: "ihc",
        render: (_v: unknown, row: Record<string, unknown>) => (row.ihc as Record<string, string>)?.[m] ?? "",
      })),
    ];
    exportToCsv(
      exportFilename ?? "ihc-case-list",
      rows as unknown as Record<string, unknown>[],
      exportCols,
    );
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Button icon={<DownloadOutlined />} size="small" onClick={handleExport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table<CaseRow>
        size="small"
        loading={loading}
        dataSource={rows}
        rowKey={(r) => `${r.accession_no}-${r.specimen_label ?? ""}`}
        columns={[...fixedCols, ...ihcCols]}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} rows` }}
        style={{ marginTop: 8 }}
      />
    </>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

type SourceKey = "surgical" | "nongyne";
const SOURCE_OPTIONS: { label: string; value: SourceKey }[] = [
  { label: "Surgical", value: "surgical" },
  { label: "Non-Gyne Cytology", value: "nongyne" },
];

const IHCStatPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);
  const [source, setSource] = useState<SourceKey>("surgical");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<IHCStats | null>(null);
  const [caseList, setCaseList] = useState<IHCCaseListData | null>(null);
  const [selectedMarkers, setSelectedMarkers] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    if (!dateRange) return;
    const [start, end] = dateRange;
    const params = {
      start_date: start.format("YYYY-MM-DD"),
      end_date: end.format("YYYY-MM-DD"),
    };
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.allSettled([
        api.get("/ihc/stats", { params }),
        api.get("/ihc/case-list", { params }),
      ]);
      setStats(statsRes.status === "fulfilled" ? statsRes.value.data : null);
      setCaseList(listRes.status === "fulfilled" ? listRes.value.data : null);
      setSelectedMarkers([]);
      if (statsRes.status === "rejected") logger.error("IHC stats error", statsRes.reason);
      if (listRes.status === "rejected") logger.error("IHC case-list error", listRes.reason);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const allMarkers = stats ? stats[source] : [];
  const markers = selectedMarkers.length > 0
    ? allMarkers.filter((m) => selectedMarkers.includes(m.marker_name))
    : allMarkers;
  const listData = caseList ? caseList[source] : null;

  const markerOptions = allMarkers.map((m) => ({
    label: m.marker_name,
    value: m.marker_name,
  }));

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD/MM/YYYY"
        />
        <Select
          value={source}
          onChange={(v) => { setSource(v); setSelectedMarkers([]); }}
          options={SOURCE_OPTIONS}
          style={{ width: 180 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetchAll} loading={loading}>
          Search
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setDateRange([dayjs().startOf("month"), dayjs().endOf("month")]);
            setStats(null);
            setCaseList(null);
            setSelectedMarkers([]);
          }}
        >
          Reset
        </Button>
      </Space>

      {markerOptions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ marginRight: 8 }}>Filter IHC marker:</Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="แสดงทุก marker"
            value={selectedMarkers}
            onChange={setSelectedMarkers}
            options={markerOptions}
            style={{ minWidth: 280, maxWidth: "100%" }}
          />
        </div>
      )}

      <Spin spinning={loading}>
        {stats === null ? (
          <Empty description="เลือกช่วงวันที่และกด Search" />
        ) : markers.length === 0 ? (
          <Empty description="ไม่มีข้อมูล IHC ในช่วงเวลานี้" />
        ) : (
          <>
            {/* ── Summary ── */}
            <Divider>
              <Space>
                <BarChartOutlined />
                <Title level={5} style={{ margin: 0 }}>
                  {SOURCE_OPTIONS.find((o) => o.value === source)?.label} — IHC Summary
                </Title>
              </Space>
            </Divider>
            {markers.map((m) => (
              <MarkerCard key={m.ap_test_id} marker={m} />
            ))}

            {/* ── Case-level detail table ── */}
            {listData && (
              <>
                <Divider>
                  <Space>
                    <TableOutlined />
                    <Title level={5} style={{ margin: 0 }}>
                      Case List ({listData.rows.length} rows)
                    </Title>
                  </Space>
                </Divider>
                <CaseListTable
                  data={listData}
                  isSurgical={source === "surgical"}
                  loading={false}
                  selectedMarkers={selectedMarkers}
                  exportFilename={`ihc-case-list-${source}-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`}
                />
              </>
            )}
          </>
        )}
      </Spin>
    </div>
  );
};

export default IHCStatPage;
