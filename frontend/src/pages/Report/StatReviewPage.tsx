import React, { useState, useEffect } from "react";
import {
  Card,
  Space,
  Button,
  DatePicker,
  Select,
  Row,
  Col,
  Statistic,
  Spin,
  Tag,
  Divider,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import SurgicalReportService from "../../services/surgicalReportService";
import UserService from "../../services/userService";
import { SurgicalStatResponse } from "../../types/surgicalReport";
import type { User } from "../../types/user";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;

const StatReviewPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SurgicalStatResponse | null>(null);
  const [pathologists, setPathologists] = useState<User[]>([]);

  // Filters
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().subtract(30, "days"),
    dayjs(),
  ]);
  const [selectedPathologist, setSelectedPathologist] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    fetchPathologists();
  }, []);

  useEffect(() => {
    fetchStats();
  }, [dateRange, selectedPathologist]);

  const fetchPathologists = async () => {
    try {
      // Assuming UserService.getUsers can filter by role, or we fetch all and filter client side
      // if API doesn't support ?role=pathologist
      const users = await UserService.getUsers();
      // Only show lab manager, admin, or pathologist
      const filtered = users.filter(
        (u) =>
          u.roles?.includes("pathologist") ||
          u.roles?.includes("admin") ||
          u.roles?.includes("lab_manager"),
      );
      setPathologists(filtered.length > 0 ? filtered : users);
    } catch (e) {
      logger.error(e);
    }
  };

  const fetchStats = async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;

    setLoading(true);
    try {
      const start = dateRange[0].format("YYYY-MM-DD");
      const end = dateRange[1].format("YYYY-MM-DD");
      const res = await SurgicalReportService.getSurgicalStatistics(
        start,
        end,
        selectedPathologist,
      );
      setStats(res);
    } catch (error) {
      logger.error("Failed to fetch stats", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>

      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates) {
                setDateRange(dates);
              }
            }}
            format="DD/MM/YYYY"
          />
          <Select
            allowClear
            placeholder="Select Pathologist"
            value={selectedPathologist}
            onChange={setSelectedPathologist}
            style={{ width: 250 }}
            options={pathologists.map((p) => ({
              label: p.full_name || p.username,
              value: p.id,
            }))}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={fetchStats}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDateRange([dayjs().subtract(30, "days"), dayjs()]);
              setSelectedPathologist(undefined);
            }}
          >
            Reset
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic title="Total Cases" value={stats?.total_cases || 0} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Average Turnaround Time (Days)"
                value={stats?.average_tt_days || 0}
                precision={2}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Average Turnaround Time (Hours)"
                value={stats?.average_tt_hours || 0}
                precision={2}
              />
            </Card>
          </Col>
        </Row>

        {/* Specimen Complexity Breakdown */}
        <Divider titlePlacement="left" style={{ marginTop: 24, marginBottom: 16, fontWeight: 600, color: "#595959" }}>
          Specimen Complexity
        </Divider>
        <Row gutter={[16, 16]}>
          {(
            [
              { key: "small",  label: "Small",  color: "#52c41a", bg: "#f6ffed", border: "#b7eb8f" },
              { key: "medium", label: "Medium", color: "#faad14", bg: "#fffbe6", border: "#ffe58f" },
              { key: "large",  label: "Large",  color: "#f5222d", bg: "#fff1f0", border: "#ffa39e" },
            ] as const
          ).map(({ key, label, color, bg, border }) => (
            <Col xs={24} sm={8} key={key}>
              <Card
                style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8 }}
                bodyStyle={{ padding: "20px 24px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Tag
                    color={color}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "2px 12px",
                      borderRadius: 20,
                      color: "#fff",
                      background: color,
                      border: "none",
                    }}
                  >
                    {label}
                  </Tag>
                </div>
                <Statistic
                  title={<span style={{ color: "#595959", fontSize: 13 }}>Specimen (items)</span>}
                  value={stats?.complexity_breakdown?.[key] ?? 0}
                  valueStyle={{ fontSize: 32, fontWeight: 800, color }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        {stats?.daily_stats && stats.daily_stats.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card title="Daily Cases Trend">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.daily_stats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(tick) => dayjs(tick).format("DD/MM")}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(label) => dayjs(label).format("DD MMM YYYY")}
                    />
                    <Legend />
                    <Bar
                      dataKey="total_cases"
                      name="Total Cases"
                      fill="#1890ff"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}

        {stats?.tt_distribution && stats.tt_distribution.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card title="Turnaround Time Distribution">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={stats.tt_distribution} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="tt_days"
                      tickFormatter={(tick) => `${tick} Days`}
                      label={{ value: "Turnaround Time (Days)", position: "insideBottom", offset: -10 }}
                    />
                    <YAxis 
                      allowDecimals={false} 
                      label={{ value: "Number of Cases", angle: -90, position: "insideLeft", offset: 10 }} 
                    />
                    <Tooltip
                      formatter={(value: number) => [value, "Cases"]}
                      labelFormatter={(label) => `TAT: ${label} Days`}
                    />
                    <Bar
                      dataKey="case_count"
                      name="Cases"
                      fill="#722ed1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}
      </Spin>
    </div>
  );
};

export default StatReviewPage;
