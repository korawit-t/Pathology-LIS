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
} from "antd";
import {
  FileTextOutlined,
  BlockOutlined,
  ExperimentOutlined,
  BgColorsOutlined,
  ApartmentOutlined,
  SendOutlined,
  ReloadOutlined,
  BarChartOutlined,
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
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import SurgicalCaseService from "../../services/surgicalCaseService";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface WorkloadData {
  total_cases: number;
  total_blocks: number;
  he_slides: number;
  special_stain_slides: number;
  ihc_slides: number;
  consult_cases: number;
}

interface DailyData {
  date: string;
  cases: number;
  he_slides: number;
  special_stain_slides: number;
  ihc_slides: number;
}

const STAT_CARDS = [
  {
    key: "total_cases" as keyof WorkloadData,
    label: "Total Cases",
    icon: <FileTextOutlined style={{ fontSize: 28, color: "#1890ff" }} />,
    color: "#1890ff",
    bg: "#e6f4ff",
  },
  {
    key: "total_blocks" as keyof WorkloadData,
    label: "Total Blocks",
    icon: <BlockOutlined style={{ fontSize: 28, color: "#52c41a" }} />,
    color: "#52c41a",
    bg: "#f6ffed",
  },
  {
    key: "he_slides" as keyof WorkloadData,
    label: "H&E Slides",
    icon: <ExperimentOutlined style={{ fontSize: 28, color: "#722ed1" }} />,
    color: "#722ed1",
    bg: "#f9f0ff",
  },
  {
    key: "special_stain_slides" as keyof WorkloadData,
    label: "Special Stain Slides",
    icon: <BgColorsOutlined style={{ fontSize: 28, color: "#fa8c16" }} />,
    color: "#fa8c16",
    bg: "#fff7e6",
  },
  {
    key: "ihc_slides" as keyof WorkloadData,
    label: "IHC Slides",
    icon: <ApartmentOutlined style={{ fontSize: 28, color: "#eb2f96" }} />,
    color: "#eb2f96",
    bg: "#fff0f6",
  },
  {
    key: "consult_cases" as keyof WorkloadData,
    label: "Consult Cases",
    icon: <SendOutlined style={{ fontSize: 28, color: "#13c2c2" }} />,
    color: "#13c2c2",
    bg: "#e6fffb",
  },
];

const WorkloadDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkloadData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, daily] = await Promise.all([
        SurgicalCaseService.getWorkloadSummary(
          dateRange[0].format("YYYY-MM-DD"),
          dateRange[1].format("YYYY-MM-DD"),
        ),
        SurgicalCaseService.getWorkloadDaily(
          dateRange[0].format("YYYY-MM-DD"),
          dateRange[1].format("YYYY-MM-DD"),
        ),
      ]);
      setData(summary);
      // Format dates for display
      setDailyData(daily.map((d) => ({ ...d, date: dayjs(d.date).format("DD/MM") })));
    } catch {
      message.error("Failed to load workload data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            <BarChartOutlined style={{ fontSize: 24, color: "#1890ff" }} />
            <Title level={3} style={{ margin: 0 }}>
              Surgical Workload Dashboard
            </Title>
          </Space>

          <Space wrap>
            <Text type="secondary">Period:</Text>
            <RangePicker
              value={dateRange}
              onChange={(vals) => {
                if (vals?.[0] && vals?.[1]) {
                  setDateRange([vals[0], vals[1]]);
                }
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
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </div>

        <Divider style={{ margin: "0 0 20px 0" }} />

        <Spin spinning={loading}>
          <Row gutter={[16, 16]}>
            {STAT_CARDS.map((card) => (
              <Col xs={24} sm={12} lg={8} key={card.key}>
                <Card
                  bordered={false}
                  style={{
                    borderRadius: 12,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    background: card.bg,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: `0 2px 8px ${card.color}33`,
                        flexShrink: 0,
                      }}
                    >
                      {card.icon}
                    </div>
                    <Statistic
                      title={
                        <Text style={{ fontSize: 13, color: "#666" }}>
                          {card.label}
                        </Text>
                      }
                      value={data?.[card.key] ?? "—"}
                      valueStyle={{
                        fontSize: 32,
                        fontWeight: 700,
                        color: card.color,
                        lineHeight: 1.2,
                      }}
                    />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          {data && (
            <Card
              bordered={false}
              style={{
                marginTop: 20,
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                Summary
              </Title>
              <Row gutter={[24, 8]}>
                <Col>
                  <Text type="secondary">Period: </Text>
                  <Text strong>
                    {dateRange[0].format("DD/MM/YYYY")} – {dateRange[1].format("DD/MM/YYYY")}
                  </Text>
                </Col>
                <Col>
                  <Text type="secondary">Total stain slides: </Text>
                  <Text strong>
                    {data.he_slides + data.special_stain_slides + data.ihc_slides}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 4 }}>
                    (H&E: {data.he_slides} / Special: {data.special_stain_slides} / IHC: {data.ihc_slides})
                  </Text>
                </Col>
              </Row>
            </Card>
          )}

          {/* ── Daily trend charts ── */}
          {dailyData.length > 0 && (() => {
            const chartProps = {
              margin: { top: 4, right: 8, left: -16, bottom: 4 },
            };
            const axisProps = {
              tick: { fontSize: 11 },
              interval: "preserveStartEnd" as const,
            };
            const gridProps = { strokeDasharray: "3 3", stroke: "#f0f0f0" };
            const tooltipProps = { contentStyle: { borderRadius: 8, fontSize: 12 } };

            const charts: Array<{ title: string; color: string; dataKey: keyof DailyData; type: "bar" | "line" }> = [
              { title: "Cases / Day", color: "#1890ff", dataKey: "cases", type: "line" },
              { title: "H&E Slides / Day", color: "#722ed1", dataKey: "he_slides", type: "bar" },
              { title: "Special Stain / Day", color: "#fa8c16", dataKey: "special_stain_slides", type: "bar" },
              { title: "IHC Slides / Day", color: "#eb2f96", dataKey: "ihc_slides", type: "bar" },
            ];

            return (
              <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                {charts.map(({ title, color, dataKey, type }) => (
                  <Col xs={24} lg={12} key={dataKey}>
                    <Card
                      bordered={false}
                      style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                    >
                      <Text strong style={{ fontSize: 14, display: "block", marginBottom: 12, color }}>
                        {title}
                      </Text>
                      <ResponsiveContainer width="100%" height={200}>
                        {type === "line" ? (
                          <LineChart data={dailyData} {...chartProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey="date" {...axisProps} />
                            <YAxis {...{ tick: axisProps.tick }} allowDecimals={false} />
                            <Tooltip {...tooltipProps} />
                            <Line
                              type="monotone"
                              dataKey={dataKey}
                              stroke={color}
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: color }}
                              activeDot={{ r: 5 }}
                              name={title}
                            />
                          </LineChart>
                        ) : (
                          <BarChart data={dailyData} {...chartProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey="date" {...axisProps} />
                            <YAxis {...{ tick: axisProps.tick }} allowDecimals={false} />
                            <Tooltip {...tooltipProps} />
                            <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} name={title} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                ))}
              </Row>
            );
          })()}
        </Spin>
    </div>
  );
};

export default WorkloadDashboard;
