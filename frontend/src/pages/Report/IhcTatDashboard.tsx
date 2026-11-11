import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Modal,
  Progress,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip as AntTooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BgColorsOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  SendOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import { exportToCsv } from "../../utils/exportCsv";
import type {
  IhcOutstandingCase,
  IhcOutstandingStage,
  IhcTatBucket,
  IhcTatRequest,
  IhcTatStats,
} from "../../types/surgicalReport";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const BUCKETS: { key: IhcTatBucket; label: string; color: string }[] = [
  { key: "lt3", label: "< 3 days", color: "#52c41a" },
  { key: "t3_5", label: "3–5 days", color: "#1890ff" },
  { key: "t5_10", label: "5–10 days", color: "#fa8c16" },
  { key: "gt10", label: "> 10 days", color: "#f5222d" },
];

const STAGES: Record<IhcOutstandingStage, { label: string; color: string }> = {
  pending: { label: "Not sent / stained yet", color: "default" },
  sent: { label: "At outlab", color: "blue" },
  stained: { label: "Ready to read", color: "gold" },
  completed: { label: "Result entered, not signed", color: "purple" },
};

const MARKER_COLORS: Record<string, string> = {
  pending: "default",
  sent: "blue",
  stained: "gold",
  completed: "purple",
};

// An outstanding request older than this (working days) is flagged.
const OVERDUE_DAYS = 10;

const patientName = (r: { patient_title: string | null; patient_name: string | null; patient_ln: string | null }) =>
  [r.patient_title, r.patient_name, r.patient_ln].filter(Boolean).join(" ");

const fmtDate = (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "—");
const fmtDays = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v} d`);

const cardStyle: React.CSSProperties = { borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };

const Kpi: React.FC<{
  icon: React.ReactNode;
  color: string;
  background: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ icon, color, background, label, value, hint }) => (
  <Card variant="borderless" style={{ ...cardStyle, background, height: "100%" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 52, height: 52, borderRadius: 12, background: "#fff", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 2px 8px ${color}33`, fontSize: 26, color,
        }}
      >
        {icon}
      </div>
      <div>
        <Text style={{ fontSize: 13, color: "#666", display: "block" }}>{label}</Text>
        <Text style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2, display: "block" }}>{value}</Text>
        {hint && <Text style={{ fontSize: 12, color: "#888" }}>{hint}</Text>}
      </div>
    </div>
  </Card>
);

const requestColumns: ColumnsType<IhcTatRequest> = [
  { title: "Accession No.", dataIndex: "accession_no", key: "accession_no", width: 120 },
  { title: "Patient", key: "patient", render: (_, r) => patientName(r) },
  {
    title: "Markers",
    key: "markers",
    render: (_, r) => (
      <AntTooltip title={r.markers.join(", ")}>
        <span>{r.markers.length > 3 ? `${r.markers.slice(0, 3).join(", ")} +${r.markers.length - 3}` : r.markers.join(", ")}</span>
      </AntTooltip>
    ),
  },
  {
    title: "Source",
    key: "source",
    render: (_, r) => (r.source === "outlab" ? <Tag color="blue">{r.lab || "Outlab"}</Tag> : <Tag>In-house</Tag>),
  },
  { title: "Ordered", dataIndex: "ordered_at", key: "ordered_at", render: fmtDate },
  { title: "Out", dataIndex: "reported_at", key: "reported_at", render: fmtDate },
  { title: "Total", dataIndex: "total_days", key: "total_days", render: fmtDays },
  { title: "At outlab", dataIndex: "outlab_days", key: "outlab_days", render: fmtDays },
  { title: "Ready → out", dataIndex: "reading_days", key: "reading_days", render: fmtDays },
];

const IhcTatDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(2, "month").startOf("month"),
    dayjs().endOf("month"),
  ]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IhcTatStats | null>(null);
  const [outstanding, setOutstanding] = useState<IhcOutstandingCase[]>([]);
  const [stageFilter, setStageFilter] = useState<IhcOutstandingStage | "all">("all");
  const [bucketOpen, setBucketOpen] = useState<IhcTatBucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, open] = await Promise.all([
        SurgicalReportService.getIhcTat(dateRange[0].format("YYYY-MM-DD"), dateRange[1].format("YYYY-MM-DD")),
        SurgicalReportService.getIhcOutstanding(),
      ]);
      setData(stats);
      setOutstanding(open);
    } catch {
      message.error("Failed to load IHC TAT data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;
  const totalDist = data ? BUCKETS.reduce((n, b) => n + data.distribution[b.key], 0) : 0;
  const overdueCount = outstanding.filter((o) => o.age_days > OVERDUE_DAYS).length;
  const oldest = outstanding.reduce((m, o) => Math.max(m, o.age_days), 0);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: outstanding.length };
    outstanding.forEach((o) => { counts[o.stage] = (counts[o.stage] ?? 0) + 1; });
    return counts;
  }, [outstanding]);

  const shownOutstanding = stageFilter === "all" ? outstanding : outstanding.filter((o) => o.stage === stageFilter);
  const bucketRequests = bucketOpen && data ? data.requests.filter((r) => r.bucket === bucketOpen) : [];

  const handleExport = () => {
    if (!data) return;
    exportToCsv(
      `ihc-tat_${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}.csv`,
      data.requests as unknown as Record<string, unknown>[],
      [
        { header: "Accession No.", key: "accession_no" },
        { header: "Patient", key: "patient_name", render: (_, row) => patientName(row as unknown as IhcTatRequest) },
        { header: "Markers", key: "markers", render: (v) => (v as string[]).join(" | ") },
        { header: "Slides", key: "slides" },
        { header: "Source", key: "source" },
        { header: "Lab", key: "lab" },
        { header: "Ordered", key: "ordered_at", render: (v) => fmtDate(v as string) },
        { header: "Sent", key: "sent_at", render: (v) => fmtDate(v as string | null) },
        { header: "Slide ready", key: "ready_at", render: (v) => fmtDate(v as string | null) },
        { header: "Out (signed)", key: "reported_at", render: (v) => fmtDate(v as string) },
        { header: "Total (working days)", key: "total_days" },
        { header: "At outlab (working days)", key: "outlab_days" },
        { header: "Ready to out (working days)", key: "reading_days" },
      ],
      {
        preamble: [
          ["IHC TAT", `${dateRange[0].format("DD/MM/YYYY")} - ${dateRange[1].format("DD/MM/YYYY")}`],
          ["Requests", summary?.requests ?? 0, "Median total (working days)", summary?.median_total_days ?? "—"],
        ],
      },
    );
  };

  const outstandingColumns: ColumnsType<IhcOutstandingCase> = [
    { title: "Accession No.", dataIndex: "accession_no", key: "accession_no", width: 120 },
    { title: "Patient", key: "patient", render: (_, r) => patientName(r) },
    {
      title: "Markers",
      key: "markers",
      render: (_, r) => (
        <Space size={[4, 4]} wrap>
          {r.markers.map((m, i) => (
            <Tag key={`${m.name}-${i}`} color={MARKER_COLORS[m.status] ?? "default"} style={{ marginInlineEnd: 0 }}>
              {m.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Stage",
      dataIndex: "stage",
      key: "stage",
      render: (s: IhcOutstandingStage, r) => (
        <Space size={4} direction="vertical">
          <Tag color={STAGES[s].color}>{STAGES[s].label}</Tag>
          {s === "sent" && (r.lab || r.sent_at) && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {[r.lab, r.sent_at && `sent ${fmtDate(r.sent_at)}`].filter(Boolean).join(" · ")}
            </Text>
          )}
        </Space>
      ),
    },
    { title: "Ordered", dataIndex: "ordered_at", key: "ordered_at", render: fmtDate },
    {
      title: "Waiting",
      dataIndex: "age_days",
      key: "age_days",
      sorter: (a, b) => a.age_days - b.age_days,
      render: (v: number) => (
        <Text strong={v > OVERDUE_DAYS} type={v > OVERDUE_DAYS ? "danger" : undefined}>
          {v} d
        </Text>
      ),
    },
  ];

  const axisProps = { tick: { fontSize: 11 } };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <Space align="center">
          <BgColorsOutlined style={{ fontSize: 24, color: "#722ed1" }} />
          <Title level={3} style={{ margin: 0 }}>IHC Turnaround (TAT)</Title>
        </Space>
        <Space wrap>
          <Text type="secondary">Signed out:</Text>
          <RangePicker
            value={dateRange}
            onChange={(vals) => {
              if (vals?.[0] && vals?.[1]) setDateRange([vals[0], vals[1]]);
            }}
            format="DD/MM/YYYY"
            allowClear={false}
            presets={[
              { label: "This Month", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
              { label: "Last Month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
              { label: "Last 3 Months", value: [dayjs().subtract(2, "month").startOf("month"), dayjs().endOf("month")] },
              { label: "This Year", value: [dayjs().startOf("year"), dayjs().endOf("year")] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!data?.requests.length}>Export CSV</Button>
        </Space>
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        From IHC order to the sign-off that carries the result, in working days. One request is a case&apos;s IHC
        slides signed out together.
      </Text>

      <Divider style={{ margin: "12px 0 20px" }} />

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Kpi
              icon={<ClockCircleOutlined />} color="#722ed1" background="#f9f0ff"
              label="Median order → out"
              value={fmtDays(summary?.median_total_days)}
              hint={summary ? `${summary.requests} requests · ${summary.slides} slides` : undefined}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Kpi
              icon={<SendOutlined />} color="#1890ff" background="#e6f4ff"
              label="Median at outlab"
              value={fmtDays(summary?.median_outlab_days)}
              hint={summary ? `sent → back · ${summary.outlab_requests} outlab, ${summary.inhouse_requests} in-house` : undefined}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Kpi
              icon={<ExperimentOutlined />} color="#13c2c2" background="#e6fffb"
              label="Median slide ready → out"
              value={fmtDays(summary?.median_reading_days)}
              hint="reading and sign-off"
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Kpi
              icon={<WarningOutlined />} color={overdueCount ? "#f5222d" : "#52c41a"} background={overdueCount ? "#fff1f0" : "#f6ffed"}
              label="Not out yet"
              value={`${outstanding.length} cases`}
              hint={outstanding.length ? `${overdueCount} waiting > ${OVERDUE_DAYS} d · oldest ${oldest} d` : "nothing outstanding"}
            />
          </Col>
        </Row>

        {data && (
          <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
            <Col xs={24} lg={10}>
              <Card variant="borderless" style={{ ...cardStyle, height: "100%" }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>Order → out distribution</Title>
                {totalDist === 0 ? (
                  <Empty description="No IHC signed out in this period" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {BUCKETS.map((b) => {
                      const n = data.distribution[b.key];
                      const pct = Math.round((n / totalDist) * 100);
                      return (
                        <div
                          key={b.key}
                          role={n > 0 ? "button" : undefined}
                          aria-label={`${b.label}: ${n} requests`}
                          onClick={() => n > 0 && setBucketOpen(b.key)}
                          style={{ cursor: n > 0 ? "pointer" : "default" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 13 }}>{b.label}</Text>
                            <Text strong>{n} requests ({pct}%)</Text>
                          </div>
                          <Progress percent={pct} strokeColor={b.color} showInfo={false} size="small" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card variant="borderless" style={{ ...cardStyle, height: "100%" }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>Monthly requests and median order → out</Title>
                {data.monthly.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={data.monthly} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" {...axisProps} />
                      <YAxis yAxisId="left" allowDecimals={false} {...axisProps} />
                      <YAxis yAxisId="right" orientation="right" {...axisProps} unit=" d" />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="requests" name="Requests" fill="#d3adf7" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="median_total_days" name="Median (working days)" stroke="#722ed1" strokeWidth={2.5} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty description="No IHC signed out in this period" />
                )}
              </Card>
            </Col>
          </Row>
        )}

        {data && data.by_lab.length > 0 && (
          <Card variant="borderless" style={{ ...cardStyle, marginTop: 20 }}>
            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Outlab time by lab (sent → back)</Title>
            <Table
              size="small"
              rowKey="lab"
              pagination={false}
              dataSource={data.by_lab}
              columns={[
                { title: "Lab", dataIndex: "lab", key: "lab" },
                { title: "Requests", dataIndex: "requests", key: "requests" },
                { title: "Median", dataIndex: "median_outlab_days", key: "median", render: fmtDays },
                { title: "Longest", dataIndex: "max_outlab_days", key: "max", render: fmtDays },
              ]}
            />
          </Card>
        )}

        <Card variant="borderless" style={{ ...cardStyle, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>IHC not out yet</Title>
            <Segmented
              size="small"
              value={stageFilter}
              onChange={(v) => setStageFilter(v as IhcOutstandingStage | "all")}
              options={[
                { label: `All (${stageCounts.all ?? 0})`, value: "all" },
                ...(Object.keys(STAGES) as IhcOutstandingStage[]).map((s) => ({
                  label: `${STAGES[s].label} (${stageCounts[s] ?? 0})`,
                  value: s,
                })),
              ]}
            />
          </div>
          <Table
            size="small"
            rowKey="case_id"
            dataSource={shownOutstanding}
            columns={outstandingColumns}
            pagination={shownOutstanding.length > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: <Empty description="Every IHC ordered has gone out" /> }}
          />
        </Card>
      </Spin>

      <Modal
        title={bucketOpen ? `Order → out ${BUCKETS.find((b) => b.key === bucketOpen)?.label}` : ""}
        open={!!bucketOpen}
        onCancel={() => setBucketOpen(null)}
        footer={null}
        width={1000}
      >
        <Table
          size="small"
          rowKey={(r) => `${r.case_id}-${r.reported_at}`}
          dataSource={bucketRequests}
          columns={requestColumns}
          pagination={bucketRequests.length > 10 ? { pageSize: 10 } : false}
        />
      </Modal>
    </div>
  );
};

export default IhcTatDashboard;
