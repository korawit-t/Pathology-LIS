import React, { useState, useEffect, useCallback } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  DatePicker,
  Button,
  Space,
  Typography,
  Divider,
  Spin,
  message,
  Progress,
  Segmented,
} from "antd";
import {
  ClockCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

type TatData = Awaited<ReturnType<typeof GyneCytologyCaseService.getTatStats>>;

const DIST_COLORS: Record<string, string> = {
  "< 3 days": "#52c41a",
  "3–5 days": "#1890ff",
  "5–10 days": "#fa8c16",
  "> 10 days": "#f5222d",
};

interface Props {
  type: "gyne" | "nongyne";
}

type DistSet = "all" | "routine" | "express";

const CytoTATDashboard: React.FC<Props> = ({ type }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TatData | null>(null);
  const [distSet, setDistSet] = useState<DistSet>("all");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("year"),
    dayjs().endOf("month"),
  ]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateRange[0].format("YYYY-MM-DD");
      const to = dateRange[1].format("YYYY-MM-DD");
      const res =
        type === "gyne"
          ? await GyneCytologyCaseService.getTatStats(from, to)
          : await NongyneCytologyCaseService.getTatStats(from, to);
      setData(res);
    } catch {
      message.error("Failed to load TAT data");
    } finally {
      setLoading(false);
    }
  }, [type, dateRange]);

  useEffect(() => {
    setData(null);
    fetch();
  }, [fetch]);

  const activeDist = data
    ? distSet === "routine"
      ? (data as any).routine_distribution ?? data.distribution
      : distSet === "express"
        ? (data as any).express_distribution ?? data.distribution
        : data.distribution
    : null;

  const distData = activeDist
    ? [
        { label: "< 3 days", value: activeDist.lt3 },
        { label: "3–5 days", value: activeDist.t3_5 },
        { label: "5–10 days", value: activeDist.t5_10 },
        { label: "> 10 days", value: activeDist.gt10 },
      ]
    : [];

  const totalDist = distData.reduce((s, d) => s + d.value, 0);
  const chartGridProps = { strokeDasharray: "3 3", stroke: "#f0f0f0" };
  const axisProps = { tick: { fontSize: 11 } };
  const tooltipProps = { contentStyle: { borderRadius: 8, fontSize: 12 } };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space align="center">
          <ClockCircleOutlined style={{ fontSize: 24, color: "#1890ff" }} />
          <Title level={3} style={{ margin: 0 }}>
            Turnaround Time (TAT)
          </Title>
        </Space>
        <Space wrap>
          <Text type="secondary">Period:</Text>
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
              { label: "This Year", value: [dayjs().startOf("year"), dayjs().endOf("year")] },
              { label: "Last 3 Months", value: [dayjs().subtract(3, "month").startOf("month"), dayjs().endOf("month")] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      <Divider style={{ margin: "0 0 20px 0" }} />

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Card
              bordered={false}
              style={{ borderRadius: 12, background: "#e6f4ff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #1890ff33", flexShrink: 0 }}>
                  <ClockCircleOutlined style={{ fontSize: 28, color: "#1890ff" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Avg TAT (All Cases)</Text>}
                  value={data?.avg_tat_days ?? "—"}
                  suffix={data ? "days" : ""}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#1890ff" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card
              bordered={false}
              style={{ borderRadius: 12, background: "#f9f0ff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #722ed133", flexShrink: 0 }}>
                  <FileTextOutlined style={{ fontSize: 28, color: "#722ed1" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Avg TAT (Routine)</Text>}
                  value={data?.routine_avg_days ?? "—"}
                  suffix={data ? "days" : ""}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#722ed1" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card
              bordered={false}
              style={{ borderRadius: 12, background: "#fff7e6", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #fa8c1633", flexShrink: 0 }}>
                  <ThunderboltOutlined style={{ fontSize: 28, color: "#fa8c16" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Avg TAT (Express)</Text>}
                  value={data?.express_avg_days ?? "—"}
                  suffix={data ? "days" : ""}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#fa8c16" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card
              bordered={false}
              style={{ borderRadius: 12, background: "#f6ffed", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #52c41a33", flexShrink: 0 }}>
                  <CheckCircleOutlined style={{ fontSize: 28, color: "#52c41a" }} />
                </div>
                <div>
                  <Text style={{ fontSize: 13, color: "#666", display: "block" }}>
                    On-Time Rate{data ? ` (≤${data.target_days}d / ≤${data.express_target_days}d)` : ""}
                  </Text>
                  <Text style={{ fontSize: 28, fontWeight: 700, color: "#52c41a", lineHeight: 1.2, display: "block" }}>
                    {data ? `${data.on_time_pct}%` : "—"}
                  </Text>
                  {data && (
                    <Text style={{ fontSize: 12, color: "#888" }}>
                      {data.on_time_count} / {data.total_reported} cases
                    </Text>
                  )}
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {data && (
          <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
            <Col xs={24} lg={10}>
              <Card
                bordered={false}
                style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", height: "100%" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <Title level={5} style={{ margin: 0 }}>TAT Distribution</Title>
                  <Segmented
                    size="small"
                    value={distSet}
                    onChange={(v) => setDistSet(v as DistSet)}
                    options={[
                      { label: "All", value: "all" },
                      { label: "Routine", value: "routine" },
                      { label: "Express", value: "express" },
                    ]}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {distData.map((d) => (
                    <div key={d.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 13 }}>{d.label}</Text>
                        <Text strong>
                          {d.value} cases ({totalDist ? Math.round((d.value / totalDist) * 100) : 0}%)
                        </Text>
                      </div>
                      <Progress
                        percent={totalDist ? Math.round((d.value / totalDist) * 100) : 0}
                        strokeColor={DIST_COLORS[d.label]}
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={160} style={{ marginTop: 24 }}>
                  <BarChart data={distData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                    <CartesianGrid {...chartGridProps} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Cases">
                      {distData.map((d) => (
                        <Cell key={d.label} fill={DIST_COLORS[d.label]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>

            <Col xs={24} lg={14}>
              <Card
                bordered={false}
                style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", height: "100%" }}
              >
                <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                  Monthly Avg TAT Trend
                </Title>
                {data.monthly.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.monthly} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="month" {...axisProps} />
                      <YAxis allowDecimals={false} {...axisProps} unit=" d" />
                      <Tooltip
                        {...tooltipProps}
                        formatter={(v: number) => [`${v} days`, "Avg TAT"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="avg_days"
                        stroke="#1890ff"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#1890ff" }}
                        activeDot={{ r: 6 }}
                        name="Avg TAT"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
                    No data for selected period
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        )}

        {data && data.monthly.length > 0 && (
          <Card
            bordered={false}
            style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
              Monthly Case Volume with Avg TAT
            </Title>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis yAxisId="left" allowDecimals={false} {...axisProps} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} {...axisProps} unit=" d" />
                <Tooltip {...tooltipProps} />
                <Bar yAxisId="left" dataKey="case_count" fill="#1890ff" radius={[3, 3, 0, 0]} name="Cases" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avg_days"
                  stroke="#f5222d"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Avg TAT (days)"
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </Spin>
    </div>
  );
};

export default CytoTATDashboard;
