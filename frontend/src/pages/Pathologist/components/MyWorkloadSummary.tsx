import React, { useState, useEffect, useCallback } from "react";

interface TatData {
  avg_tat_days: number;
  routine_avg_days: number;
  express_avg_days: number;
  total_reported: number;
  distribution: { lt3: number; t3_5: number; t5_10: number; gt10: number };
  monthly: { month: string; case_count: number; avg_days: number }[];
}
import { Row, Col, Card, Statistic, DatePicker, Space, Typography, Spin, Progress, Divider } from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  BgColorsOutlined,
  ApartmentOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
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
  Legend,
  LabelList,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import SurgicalCaseService from "../../../services/surgicalCaseService";

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface WorkloadData {
  total_cases: number;
  signed_cases: number;
  he_slides: number;
  special_stain_slides: number;
  ihc_slides: number;
}

interface DailyData {
  date: string;
  cases: number;
  he_slides: number;
  special_stain_slides: number;
  ihc_slides: number;
}

const STAT_CARDS: Array<{
  key: keyof WorkloadData;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = [
  {
    key: "total_cases",
    label: "Assigned Cases",
    icon: <FileTextOutlined style={{ fontSize: 22, color: "#1890ff" }} />,
    color: "#1890ff",
    bg: "#e6f4ff",
  },
  {
    key: "signed_cases",
    label: "Signed Out",
    icon: <CheckCircleOutlined style={{ fontSize: 22, color: "#52c41a" }} />,
    color: "#52c41a",
    bg: "#f6ffed",
  },
  {
    key: "he_slides",
    label: "H&E Slides",
    icon: <ExperimentOutlined style={{ fontSize: 22, color: "#722ed1" }} />,
    color: "#722ed1",
    bg: "#f9f0ff",
  },
  {
    key: "special_stain_slides",
    label: "Special Stain",
    icon: <BgColorsOutlined style={{ fontSize: 22, color: "#fa8c16" }} />,
    color: "#fa8c16",
    bg: "#fff7e6",
  },
  {
    key: "ihc_slides",
    label: "IHC Slides",
    icon: <ApartmentOutlined style={{ fontSize: 22, color: "#eb2f96" }} />,
    color: "#eb2f96",
    bg: "#fff0f6",
  },
];

const CHART_PROPS = { margin: { top: 4, right: 8, left: -16, bottom: 4 } };
const AXIS_PROPS = { tick: { fontSize: 11 }, interval: "preserveStartEnd" as const };
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#f0f0f0" };
const TOOLTIP_PROPS = { contentStyle: { borderRadius: 8, fontSize: 12 } };

interface MyWorkloadSummaryProps {
  pathologistId: number;
}

const MyWorkloadSummary: React.FC<MyWorkloadSummaryProps> = ({ pathologistId }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkloadData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [ihcTop, setIhcTop] = useState<{ name: string; count: number }[]>([]);
  const [tatData, setTatData] = useState<TatData | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateRange[0].format("YYYY-MM-DD");
      const to = dateRange[1].format("YYYY-MM-DD");
      const [summary, daily, ihcTopData, tat] = await Promise.all([
        SurgicalCaseService.getWorkloadSummary(from, to, pathologistId),
        SurgicalCaseService.getWorkloadDaily(from, to, pathologistId),
        SurgicalCaseService.getWorkloadIHCTop(from, to, pathologistId, 10),
        SurgicalCaseService.getTatStats(from, to, pathologistId),
      ]);
      setData({
        total_cases: summary.total_cases,
        signed_cases: summary.signed_cases ?? 0,
        he_slides: summary.he_slides,
        special_stain_slides: summary.special_stain_slides,
        ihc_slides: summary.ihc_slides,
      });
      setDailyData(daily.map((d) => ({ ...d, date: dayjs(d.date).format("DD/MM") })));
      setIhcTop([...ihcTopData].reverse()); // reverse so highest is at top of horizontal bar
      setTatData(tat);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [dateRange, pathologistId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Text strong style={{ fontSize: 15, color: "#262626" }}>My Workload Summary</Text>
        <RangePicker
          size="small"
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
          ]}
        />
      </div>

      <Spin spinning={loading}>
        {/* Stat cards */}
        <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
          {STAT_CARDS.map((card) => (
            <Col xs={12} sm={8} md={6} lg={4} key={card.key} style={{ minWidth: 140 }}>
              <Card
                bordered={false}
                size="small"
                style={{ borderRadius: 10, background: card.bg, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                bodyStyle={{ padding: "12px 16px" }}
              >
                <Space align="start" size={10}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 1px 6px ${card.color}33`,
                      flexShrink: 0,
                    }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#888", lineHeight: 1.2, marginBottom: 2 }}>
                      {card.label}
                    </div>
                    <Statistic
                      value={data?.[card.key] ?? "—"}
                      valueStyle={{ fontSize: 22, fontWeight: 700, color: card.color, lineHeight: 1 }}
                    />
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Daily trend charts */}
        {dailyData.length > 0 && (
          <Row gutter={[16, 16]}>
            {/* Cases per day — line chart */}
            <Col xs={24} lg={12}>
              <Card
                bordered={false}
                size="small"
                style={{ borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              >
                <Text strong style={{ fontSize: 13, color: "#1890ff", display: "block", marginBottom: 12 }}>
                  Cases / Day
                </Text>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyData} {...CHART_PROPS}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="date" {...AXIS_PROPS} />
                    <YAxis tick={AXIS_PROPS.tick} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Line
                      type="monotone"
                      dataKey="cases"
                      stroke="#1890ff"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#1890ff" }}
                      activeDot={{ r: 5 }}
                      name="Cases"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>

            {/* Slides per day — stacked bar chart */}
            <Col xs={24} lg={12}>
              <Card
                bordered={false}
                size="small"
                style={{ borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              >
                <Text strong style={{ fontSize: 13, color: "#595959", display: "block", marginBottom: 12 }}>
                  Slides / Day
                </Text>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyData} {...CHART_PROPS}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="date" {...AXIS_PROPS} />
                    <YAxis tick={AXIS_PROPS.tick} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="he_slides" name="H&E" stackId="a" fill="#722ed1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="special_stain_slides" name="Special" stackId="a" fill="#fa8c16" />
                    <Bar dataKey="ihc_slides" name="IHC" stackId="a" fill="#eb2f96" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}

        {/* Top 10 IHC ordered */}
        {ihcTop.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Card
                bordered={false}
                size="small"
                style={{ borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              >
                <Text strong style={{ fontSize: 13, color: "#eb2f96", display: "block", marginBottom: 12 }}>
                  Top 10 IHC Ordered
                </Text>
                <ResponsiveContainer width="100%" height={Math.max(ihcTop.length * 36, 200)}>
                  <BarChart
                    layout="vertical"
                    data={ihcTop}
                    margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid {...GRID_PROPS} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [v, "Orders"]} />
                    <Bar dataKey="count" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={20} fill="#1890ff">
                      <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#595959" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}

        {/* TAT section */}
        {tatData && (
          <>
            <Divider style={{ margin: "20px 0 16px 0" }}>
              <Text style={{ fontSize: 12, color: "#888" }}>Turnaround Time</Text>
            </Divider>

            {/* TAT KPI cards */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={8}>
                <Card
                  bordered={false}
                  size="small"
                  style={{ borderRadius: 10, background: "#e6f4ff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  bodyStyle={{ padding: "12px 16px" }}
                >
                  <Space align="start" size={10}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px #1890ff33", flexShrink: 0 }}>
                      <ClockCircleOutlined style={{ fontSize: 20, color: "#1890ff" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.2, marginBottom: 2 }}>Avg TAT (All)</div>
                      <Statistic value={tatData.avg_tat_days} suffix="d" valueStyle={{ fontSize: 22, fontWeight: 700, color: "#1890ff", lineHeight: 1 }} />
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  bordered={false}
                  size="small"
                  style={{ borderRadius: 10, background: "#f9f0ff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  bodyStyle={{ padding: "12px 16px" }}
                >
                  <Space align="start" size={10}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px #722ed133", flexShrink: 0 }}>
                      <ClockCircleOutlined style={{ fontSize: 20, color: "#722ed1" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.2, marginBottom: 2 }}>Avg TAT (Routine)</div>
                      <Statistic value={tatData.routine_avg_days} suffix="d" valueStyle={{ fontSize: 22, fontWeight: 700, color: "#722ed1", lineHeight: 1 }} />
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  bordered={false}
                  size="small"
                  style={{ borderRadius: 10, background: "#fff7e6", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  bodyStyle={{ padding: "12px 16px" }}
                >
                  <Space align="start" size={10}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px #fa8c1633", flexShrink: 0 }}>
                      <ThunderboltOutlined style={{ fontSize: 20, color: "#fa8c16" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.2, marginBottom: 2 }}>Avg TAT (Express)</div>
                      <Statistic value={tatData.express_avg_days} suffix="d" valueStyle={{ fontSize: 22, fontWeight: 700, color: "#fa8c16", lineHeight: 1 }} />
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>

            {/* TAT distribution + monthly trend */}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Card
                  bordered={false}
                  size="small"
                  style={{ borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                >
                  <Text strong style={{ fontSize: 13, color: "#595959", display: "block", marginBottom: 12 }}>
                    TAT Distribution
                  </Text>
                  {(() => {
                    const dist = [
                      { label: "< 3 days", value: tatData.distribution.lt3, color: "#52c41a" },
                      { label: "3–5 days", value: tatData.distribution.t3_5, color: "#1890ff" },
                      { label: "5–10 days", value: tatData.distribution.t5_10, color: "#fa8c16" },
                      { label: "> 10 days", value: tatData.distribution.gt10, color: "#f5222d" },
                    ];
                    const total = dist.reduce((s, d) => s + d.value, 0);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {dist.map((d) => (
                          <div key={d.label}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <Text style={{ fontSize: 12 }}>{d.label}</Text>
                              <Text strong style={{ fontSize: 12 }}>{d.value} ({total ? Math.round(d.value / total * 100) : 0}%)</Text>
                            </div>
                            <Progress
                              percent={total ? Math.round(d.value / total * 100) : 0}
                              strokeColor={d.color}
                              showInfo={false}
                              size="small"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </Card>
              </Col>

              {tatData.monthly.length > 0 && (
                <Col xs={24} lg={14}>
                  <Card
                    bordered={false}
                    size="small"
                    style={{ borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  >
                    <Text strong style={{ fontSize: 13, color: "#595959", display: "block", marginBottom: 12 }}>
                      Monthly Avg TAT Trend
                    </Text>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={tatData.monthly} {...CHART_PROPS}>
                        <CartesianGrid {...GRID_PROPS} />
                        <XAxis dataKey="month" {...AXIS_PROPS} />
                        <YAxis tick={AXIS_PROPS.tick} allowDecimals={false} unit=" d" />
                        <Tooltip {...TOOLTIP_PROPS} formatter={(v: number) => [`${v} days`, "Avg TAT"]} />
                        <Line
                          type="monotone"
                          dataKey="avg_days"
                          stroke="#1890ff"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: "#1890ff" }}
                          activeDot={{ r: 5 }}
                          name="Avg TAT"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              )}
            </Row>
          </>
        )}
      </Spin>
    </div>
  );
};

export default MyWorkloadSummary;
