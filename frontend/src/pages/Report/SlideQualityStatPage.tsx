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
  Divider,
} from "antd";
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
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

interface QualityBucket {
  good: number;
  fair: number;
  poor: number;
  unspecified: number;
}

interface QualityStatResult {
  total: number;
  slide_quality: QualityBucket;
  stain_quality: QualityBucket | null;
}

const QUALITY_COLORS: Record<string, string> = {
  good: "#52c41a",
  fair: "#faad14",
  poor: "#ff4d4f",
  unspecified: "#d9d9d9",
};

const QUALITY_LABELS: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  unspecified: "Not Set",
};

function qualityTag(value: string) {
  const color = QUALITY_COLORS[value] ?? "#d9d9d9";
  const icon =
    value === "good" ? <CheckCircleOutlined /> :
    value === "fair" ? <ExclamationCircleOutlined /> :
    value === "poor" ? <CloseCircleOutlined /> : undefined;
  return <Tag color={color} icon={icon}>{QUALITY_LABELS[value] ?? value}</Tag>;
}

function bucketToChartData(bucket: QualityBucket) {
  return [
    { name: "Good", count: bucket.good, fill: QUALITY_COLORS.good },
    { name: "Fair", count: bucket.fair, fill: QUALITY_COLORS.fair },
    { name: "Poor", count: bucket.poor, fill: QUALITY_COLORS.poor },
    { name: "Not Set", count: bucket.unspecified, fill: QUALITY_COLORS.unspecified },
  ];
}

function bucketToTableRows(bucket: QualityBucket, total: number) {
  return (["good", "fair", "poor", "unspecified"] as const).map((key) => ({
    key,
    quality: key,
    count: bucket[key],
    pct: total > 0 ? ((bucket[key] / total) * 100).toFixed(1) : "0.0",
  }));
}

const tableColumns = [
  {
    title: "Quality",
    dataIndex: "quality",
    key: "quality",
    render: (v: string) => qualityTag(v),
  },
  { title: "Cases", dataIndex: "count", key: "count" },
  {
    title: "%",
    dataIndex: "pct",
    key: "pct",
    render: (v: string) => `${v}%`,
  },
];

interface QualitySectionProps {
  title: string;
  data: QualityStatResult | null;
  loading: boolean;
  exportFilename?: string;
}

const QUALITY_EXPORT_COLS = [
  { header: "Quality", key: "quality", render: (v: unknown) => QUALITY_LABELS[v as string] ?? String(v) },
  { header: "Cases", key: "count" },
  { header: "%", key: "pct", render: (v: unknown) => `${v}%` },
];

const QualitySection: React.FC<QualitySectionProps> = ({ title, data, loading, exportFilename }) => {
  const slideData = data ? bucketToChartData(data.slide_quality) : [];
  const stainData = data?.stain_quality ? bucketToChartData(data.stain_quality) : [];

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>{title}</Title>}
      extra={
        data && (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              const base = exportFilename ?? "slide-quality";
              const slideRows = bucketToTableRows(data.slide_quality, data.total) as unknown as Record<string, unknown>[];
              exportToCsv(`${base}-slide`, slideRows, QUALITY_EXPORT_COLS);
              if (data.stain_quality) {
                const stainRows = bucketToTableRows(data.stain_quality, data.total) as unknown as Record<string, unknown>[];
                exportToCsv(`${base}-stain`, stainRows, QUALITY_EXPORT_COLS);
              }
            }}
          >
            Export CSV
          </Button>
        )
      }
      bordered={false}
      style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}
    >
      <Spin spinning={loading}>
        {data ? (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col>
                <Statistic title="Total Cases Assessed" value={data.total} />
              </Col>
              {(["good", "fair", "poor"] as const).map((k) => (
                <Col key={k}>
                  <Statistic
                    title={<Tag color={QUALITY_COLORS[k]}>{QUALITY_LABELS[k]}</Tag>}
                    value={data.slide_quality[k]}
                    valueStyle={{ color: QUALITY_COLORS[k] }}
                  />
                </Col>
              ))}
            </Row>

            <Row gutter={24}>
              <Col xs={24} lg={data.stain_quality ? 12 : 24}>
                <Text strong>Slide Quality</Text>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={slideData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Cases">
                      {slideData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Table
                  size="small"
                  dataSource={bucketToTableRows(data.slide_quality, data.total)}
                  columns={tableColumns}
                  pagination={false}
                  style={{ marginTop: 8 }}
                />
              </Col>

              {data.stain_quality && (
                <Col xs={24} lg={12}>
                  <Text strong>Stain Quality</Text>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stainData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Cases">
                        {stainData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <Table
                    size="small"
                    dataSource={bucketToTableRows(data.stain_quality, data.total)}
                    columns={tableColumns}
                    pagination={false}
                    style={{ marginTop: 8 }}
                  />
                </Col>
              )}
            </Row>
          </>
        ) : (
          <Text type="secondary">No data — select a date range and click Search.</Text>
        )}
      </Spin>
    </Card>
  );
};

const SlideQualityStatPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);
  const [loading, setLoading] = useState({ surgical: false, gyne: false, nongyne: false });
  const [stats, setStats] = useState<{
    surgical: QualityStatResult | null;
    gyne: QualityStatResult | null;
    nongyne: QualityStatResult | null;
  }>({ surgical: null, gyne: null, nongyne: null });

  const fetchAll = useCallback(async () => {
    if (!dateRange) return;
    const [start, end] = dateRange;
    const startStr = start.format("YYYY-MM-DD");
    const endStr = end.format("YYYY-MM-DD");
    const params = { start_date: startStr, end_date: endStr };

    setLoading({ surgical: true, gyne: true, nongyne: true });

    const [surgicalRes, gyneRes, nongyneRes] = await Promise.allSettled([
      api.get("/surgical-cases/slide-quality-stats", { params }),
      api.get("/gyne-cytology/slide-quality-stats", { params }),
      api.get("/nongyne-cytology/slide-quality-stats", { params }),
    ]);

    setStats({
      surgical: surgicalRes.status === "fulfilled" ? surgicalRes.value.data : null,
      gyne: gyneRes.status === "fulfilled" ? gyneRes.value.data : null,
      nongyne: nongyneRes.status === "fulfilled" ? nongyneRes.value.data : null,
    });

    if (surgicalRes.status === "rejected") logger.error("Surgical quality stats error", surgicalRes.reason);
    if (gyneRes.status === "rejected") logger.error("Gyne quality stats error", gyneRes.reason);
    if (nongyneRes.status === "rejected") logger.error("Nongyne quality stats error", nongyneRes.reason);

    setLoading({ surgical: false, gyne: false, nongyne: false });
  }, [dateRange]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD/MM/YYYY"
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetchAll}>
          Search
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setDateRange([dayjs().startOf("month"), dayjs().endOf("month")]);
            setStats({ surgical: null, gyne: null, nongyne: null });
          }}
        >
          Reset
        </Button>
      </Space>

      <Divider titlePlacement="left">Surgical Pathology</Divider>
      <QualitySection title="Surgical — Slide Quality" data={stats.surgical} loading={loading.surgical} exportFilename={`slide-quality-surgical-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`} />

      <Divider titlePlacement="left">Cytology</Divider>
      <QualitySection title="Gynecological Cytology — Slide & Stain Quality" data={stats.gyne} loading={loading.gyne} exportFilename={`slide-quality-gyne-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`} />
      <QualitySection title="Non-Gynecological Cytology — Slide & Stain Quality" data={stats.nongyne} loading={loading.nongyne} exportFilename={`slide-quality-nongyne-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`} />
    </div>
  );
};

export default SlideQualityStatPage;
