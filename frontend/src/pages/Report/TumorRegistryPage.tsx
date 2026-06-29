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
  Table,
  Tag,
  Progress,
  Empty,
} from "antd";
import {
  ExperimentOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import TumorRegistryService, { TumorRegistrySummary } from "../../services/tumorRegistryService";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const GRADE_COLORS: Record<string, string> = {
  G1: "#52c41a",
  G2: "#faad14",
  G3: "#f5222d",
  GX: "#8c8c8c",
};

const TOPO_COLOR = "#722ed1";

const TumorRegistryPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TumorRegistrySummary | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("year"),
    dayjs().endOf("month"),
  ]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await TumorRegistryService.getSummary(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );
      setData(res);
    } catch {
      message.error("Failed to load tumor registry data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const chartGridProps = { strokeDasharray: "3 3", stroke: "#f0f0f0" };
  const axisProps = { tick: { fontSize: 11 } };
  const tooltipProps = { contentStyle: { borderRadius: 8, fontSize: 12 } };

  const topoColumns = [
    { title: "Rank", key: "rank", render: (_: unknown, __: unknown, i: number) => i + 1, width: 60 },
    {
      title: "Topography Code",
      dataIndex: "code",
      key: "code",
      render: (v: string) => <Tag color="purple">{v}</Tag>,
      width: 150,
    },
    { title: "Description", dataIndex: "desc", key: "desc" },
    {
      title: "Cases",
      dataIndex: "count",
      key: "count",
      render: (v: number) => <Tag color="volcano">{v}</Tag>,
      width: 100,
    },
    {
      title: "% of Registered",
      key: "pct",
      render: (_: unknown, r: { count: number }) => {
        const pct = data?.total_registered ? Math.round(r.count / data.total_registered * 100) : 0;
        return <Progress percent={pct} size="small" strokeColor={TOPO_COLOR} />;
      },
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <Space align="center">
          <ExperimentOutlined style={{ fontSize: 24, color: "#722ed1" }} />
          <Title level={3} style={{ margin: 0 }}>Tumor Registry</Title>
        </Space>
        <Space wrap>
          <Text type="secondary">Period:</Text>
          <RangePicker
            value={dateRange}
            onChange={(vals) => { if (vals?.[0] && vals?.[1]) setDateRange([vals[0], vals[1]]); }}
            format="DD/MM/YYYY"
            allowClear={false}
            presets={[
              { label: "This Month", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
              { label: "This Year", value: [dayjs().startOf("year"), dayjs().endOf("year")] },
              { label: "Last Year", value: [dayjs().subtract(1, "year").startOf("year"), dayjs().subtract(1, "year").endOf("year")] },
              { label: "Last 3 Months", value: [dayjs().subtract(3, "month").startOf("month"), dayjs().endOf("month")] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>Refresh</Button>
        </Space>
      </div>

      <Divider style={{ margin: "0 0 20px 0" }} />

      <Spin spinning={loading}>
        {/* KPI cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#f9f0ff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ExperimentOutlined style={{ fontSize: 26, color: "#722ed1" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Total Registered</Text>}
                  value={data?.total_registered ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#722ed1" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#fff1f0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <WarningOutlined style={{ fontSize: 26, color: "#f5222d" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Malignant Cases</Text>}
                  value={data?.malignant_total ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#f5222d" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#f6ffed", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckCircleOutlined style={{ fontSize: 26, color: "#52c41a" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>ICD-O Coverage</Text>}
                  value={data?.coverage_pct ?? "—"}
                  suffix={data != null ? "%" : ""}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#52c41a" }}
                />
              </div>
            </Card>
          </Col>
        </Row>

        {data && (
          <>
            {/* Coverage bar */}
            <Card bordered={false} style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>ICD-O Coding Coverage</Title>
              <Progress
                percent={data.coverage_pct}
                format={(p) => `${p}%`}
                strokeColor={{ "0%": "#722ed1", "100%": "#b37feb" }}
                size={{ height: 18 }}
              />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {data.total_registered} coded out of {data.malignant_total} malignant cases
              </Text>
            </Card>

            <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
              {/* Grade distribution */}
              {data.by_grade.length > 0 && (
                <Col xs={24} md={10}>
                  <Card bordered={false} style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", height: "100%" }}>
                    <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>Grade Distribution</Title>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={data.by_grade}
                          dataKey="count"
                          nameKey="grade"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={((props: { grade?: string; count?: number }) => `${props.grade}: ${props.count}`) as never}
                        >
                          {data.by_grade.map((entry) => (
                            <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? "#8c8c8c"} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipProps} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              )}

              {/* pT distribution */}
              {data.by_pt.length > 0 && (
                <Col xs={24} md={14}>
                  <Card bordered={false} style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", height: "100%" }}>
                    <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>pT Stage Distribution</Title>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.by_pt} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="pt" {...axisProps} />
                        <YAxis allowDecimals={false} {...axisProps} />
                        <Tooltip {...tooltipProps} />
                        <Bar dataKey="count" name="Cases" fill="#1890ff" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              )}
            </Row>

            {/* Top ICD-O Topography */}
            {data.by_topography.length > 0 ? (
              <Card bordered={false} style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>Top ICD-O Topography (C codes)</Title>
                <Table
                  dataSource={data.by_topography}
                  columns={topoColumns}
                  rowKey="code"
                  pagination={false}
                  size="small"
                />
              </Card>
            ) : (
              data.total_registered === 0 && (
                <Card bordered={false} style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  <Empty description="ยังไม่มีข้อมูล ICD-O — เริ่มกรอก Tumor Registry ใน surgical case ที่ malignant" />
                </Card>
              )
            )}
          </>
        )}
      </Spin>
    </div>
  );
};

export default TumorRegistryPage;
