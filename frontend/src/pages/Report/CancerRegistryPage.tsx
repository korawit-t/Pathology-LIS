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
} from "antd";
import {
  MedicineBoxOutlined,
  ReloadOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";
import SurgicalCaseService from "../../services/surgicalCaseService";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

type CancerData = Awaited<ReturnType<typeof SurgicalCaseService.getCancerRegistrySummary>>;

const CancerRegistryPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CancerData | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("year"),
    dayjs().endOf("month"),
  ]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await SurgicalCaseService.getCancerRegistrySummary(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );
      setData(res);
    } catch {
      message.error("Failed to load cancer registry data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const chartGridProps = { strokeDasharray: "3 3", stroke: "#f0f0f0" };
  const axisProps = { tick: { fontSize: 11 } };
  const tooltipProps = { contentStyle: { borderRadius: 8, fontSize: 12 } };

  const specimenColumns = [
    { title: "Rank", key: "rank", render: (_: unknown, __: unknown, i: number) => i + 1, width: 60 },
    { title: "Specimen", dataIndex: "specimen_name", key: "specimen_name" },
    {
      title: "Malignant Cases",
      dataIndex: "count",
      key: "count",
      render: (v: number) => <Tag color="red">{v}</Tag>,
      width: 140,
    },
    {
      title: "% of Malignant",
      key: "pct",
      render: (_: unknown, r: { count: number }) => {
        const pct = data?.malignant ? Math.round(r.count / data.malignant * 100) : 0;
        return <Progress percent={pct} size="small" strokeColor="#f5222d" />;
      },
    },
  ];

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
          <MedicineBoxOutlined style={{ fontSize: 24, color: "#f5222d" }} />
          <Title level={3} style={{ margin: 0 }}>
            Cancer Registry
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
              { label: "This Year", value: [dayjs().startOf("year"), dayjs().endOf("year")] },
              { label: "Last Year", value: [dayjs().subtract(1, "year").startOf("year"), dayjs().subtract(1, "year").endOf("year")] },
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
        {/* KPI cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#f5f5f5", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MedicineBoxOutlined style={{ fontSize: 26, color: "#595959" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Total Cases</Text>}
                  value={data?.total ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#595959" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#fff1f0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertOutlined style={{ fontSize: 26, color: "#f5222d" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Malignant</Text>}
                  value={data?.malignant ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#f5222d" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#f6ffed", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckCircleOutlined style={{ fontSize: 26, color: "#52c41a" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Benign</Text>}
                  value={data?.benign ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#52c41a" }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, background: "#fff7e6", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <QuestionCircleOutlined style={{ fontSize: 26, color: "#fa8c16" }} />
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 13, color: "#666" }}>Indeterminate</Text>}
                  value={data?.indeterminate ?? "—"}
                  valueStyle={{ fontSize: 28, fontWeight: 700, color: "#fa8c16" }}
                />
              </div>
            </Card>
          </Col>
        </Row>

        {data && (
          <>
            {/* Malignancy rate bar */}
            <Card
              bordered={false}
              style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            >
              <Row gutter={48} align="middle">
                <Col xs={24} sm={12}>
                  <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                    Malignancy Rate
                  </Title>
                  <Progress
                    percent={data.malignancy_rate}
                    format={(p) => `${p}%`}
                    strokeColor={{ "0%": "#fa8c16", "100%": "#f5222d" }}
                    size={{ height: 18 }}
                  />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {data.malignant} malignant out of {data.total} total cases
                  </Text>
                </Col>
                <Col xs={24} sm={12}>
                  <Row gutter={16} justify="center">
                    {[
                      { label: "Malignant", value: data.malignant, color: "#f5222d" },
                      { label: "Benign", value: data.benign, color: "#52c41a" },
                      { label: "Indet.", value: data.indeterminate, color: "#fa8c16" },
                    ].map((s) => (
                      <Col key={s.label} style={{ textAlign: "center" }}>
                        <Text style={{ fontSize: 28, fontWeight: 700, color: s.color, display: "block" }}>
                          {data.total ? Math.round(s.value / data.total * 100) : 0}%
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>
                      </Col>
                    ))}
                  </Row>
                </Col>
              </Row>
            </Card>

            {/* Monthly stacked chart */}
            {data.monthly.length > 0 && (
              <Card
                bordered={false}
                style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                  Monthly Breakdown
                </Title>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.monthly} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                    <CartesianGrid {...chartGridProps} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip {...tooltipProps} />
                    <Legend />
                    <Bar dataKey="malignant" name="Malignant" fill="#f5222d" stackId="a" />
                    <Bar dataKey="benign" name="Benign" fill="#52c41a" stackId="a" />
                    <Bar dataKey="indeterminate" name="Indeterminate" fill="#fa8c16" stackId="a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Top specimens */}
            {data.by_specimen.length > 0 && (
              <Card
                bordered={false}
                style={{ marginTop: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <Title level={5} style={{ margin: 0 }}>
                    Top Malignant Specimen Types
                  </Title>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() =>
                      exportToCsv(
                        `cancer-registry-specimen-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`,
                        data.by_specimen.map((r, i) => ({ rank: i + 1, ...r })),
                        [
                          { header: "Rank", key: "rank" },
                          { header: "Specimen", key: "specimen_name" },
                          { header: "Malignant Cases", key: "count" },
                          {
                            header: "% of Malignant",
                            key: "count",
                            render: (v: unknown) =>
                              data.malignant ? ((v as number) / data.malignant * 100).toFixed(1) + "%" : "0%",
                          },
                        ],
                      )
                    }
                  >
                    Export CSV
                  </Button>
                </div>
                <Table
                  dataSource={data.by_specimen}
                  columns={specimenColumns}
                  rowKey="specimen_name"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}
          </>
        )}
      </Spin>
    </div>
  );
};

export default CancerRegistryPage;
