import React, { useState, useEffect, useCallback } from "react";
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
  Tabs,
  Tag,
  Divider,
  Typography,
  Progress,
  Modal,
  Table,
} from "antd";
import { SafetyCertificateOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";

const { Title, Text } = Typography;
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
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
import UserService from "../../services/userService";
import api from "../../services/httpClient";
import type { User } from "../../types/user";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;

interface CytoStatResponse {
  total_cases: number;
  average_tt_days: number;
  average_tt_hours: number;
  daily_stats: { date: string; total_cases: number; average_tt_hours: number }[];
  tt_distribution: { tt_days: string; case_count: number }[];
}

interface QCBucket {
  total: number;
  agree: number;
  disagree: number;
  agree_rate: number;
  disagree_rate: number;
  minor_discrepancy: number;
  major_discrepancy: number;
}

interface QCStatResponse {
  nilm: QCBucket;
  abnormal: QCBucket;
  total_reviewed: number;
}

interface GyneSummaryRow {
  period: string;
  conventional: number;
  liquid_based: number;
  unsatisfactory: number;
  lsil: number;
  hsil_major_discordant: number;
  hsil_minor_discordant: number;
  total: number;
}

interface DiagBreakdownRow {
  group: string;
  label: string;
  conventional: number;
  liquid_based: number;
  total: number;
}

interface CorrelationSummary {
  registration_counts: { conventional: number; liquid_based: number; other: number; total: number };
  breakdown: DiagBreakdownRow[];
  grand_total: { conventional: number; liquid_based: number; total: number };
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
  is_satisfied_specimen: boolean | null;
  category_1_code: string | null;
  category_1_text: string | null;
  category_code: string | null;
  category_text: string | null;
  interpretation: string | null;
}

const fetchCytoStats = async (
  type: "gyne" | "nongyne",
  start: string,
  end: string,
  pathologistId?: number,
  cytotechnicianId?: number,
): Promise<CytoStatResponse> => {
  const prefix = type === "gyne" ? "/gyne-cytology" : "/nongyne-cytology";
  const res = await api.get<CytoStatResponse>(`${prefix}/statistics`, {
    params: {
      start_date: start,
      end_date: end,
      pathologist_id: pathologistId,
      cytotechnologist_id: cytotechnicianId,
    },
  });
  return res.data;
};

interface StatPanelProps {
  type: "gyne" | "nongyne";
}

const StatPanel: React.FC<StatPanelProps> = ({ type }) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CytoStatResponse | null>(null);
  const [qcStats, setQcStats] = useState<QCStatResponse | null>(null);
  const [summaryRows, setSummaryRows] = useState<GyneSummaryRow[]>([]);
  const [correlationSummary, setCorrelationSummary] = useState<CorrelationSummary | null>(null);
  const [qcCaseModal, setQcCaseModal] = useState<{ open: boolean; reason: "random_10pct" | "abnormal" | null }>({ open: false, reason: null });
  const [qcCases, setQcCases] = useState<any[]>([]);
  const [qcCasesLoading, setQcCasesLoading] = useState(false);
  const [groupCasesOpen, setGroupCasesOpen] = useState(false);
  const [groupCasesLoading, setGroupCasesLoading] = useState(false);
  const [groupCasesData, setGroupCasesData] = useState<GroupCaseRow[]>([]);
  const [groupCasesLabel, setGroupCasesLabel] = useState("");
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [cytotechs, setCytotechs] = useState<User[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().subtract(30, "days"),
    dayjs(),
  ]);
  const [selectedPathologist, setSelectedPathologist] = useState<number | undefined>(undefined);
  const [selectedCytotech, setSelectedCytotech] = useState<number | undefined>(undefined);

  useEffect(() => {
    UserService.getUsers()
      .then((users) => {
        setPathologists(users.filter((u) => u.roles?.some((r) => r === "pathologist" || r === "senior_pathologist")));
        setCytotechs(users.filter((u) => u.roles?.some((r) => r === "cytotechnologist")));
      })
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const start = dateRange[0].format("YYYY-MM-DD");
      const end = dateRange[1].format("YYYY-MM-DD");
      const data = await fetchCytoStats(type, start, end, selectedPathologist, selectedCytotech);
      setStats(data);
      if (type === "gyne") {
        const [qc, summary, correlation] = await Promise.all([
          api.get<QCStatResponse>("/gyne-cytology/qc-statistics", {
            params: {
              start_date: start,
              end_date: end,
              pathologist_id: selectedPathologist ?? undefined,
              cytotechnologist_id: selectedCytotech ?? undefined,
            },
          }),
          api.get<GyneSummaryRow[]>("/gyne-cytology/summary-table", {
            params: {
              start_date: start,
              end_date: end,
              pathologist_id: selectedPathologist ?? undefined,
              cytotechnologist_id: selectedCytotech ?? undefined,
            },
          }),
          api.get<CorrelationSummary>("/cyto-histo-correlations/summary", {
            params: { start_date: start, end_date: end },
          }),
        ]);
        setQcStats(qc.data);
        setSummaryRows(summary.data);
        setCorrelationSummary(correlation.data);
      }
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  }, [type, dateRange, selectedPathologist, selectedCytotech]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReset = () => {
    setDateRange([dayjs().subtract(30, "days"), dayjs()]);
    setSelectedPathologist(undefined);
    setSelectedCytotech(undefined);
  };

  const openQcCaseModal = async (reason: "random_10pct" | "abnormal") => {
    if (!dateRange?.[0] || !dateRange?.[1]) return;
    setQcCaseModal({ open: true, reason });
    setQcCasesLoading(true);
    try {
      const res = await api.get<any[]>("/gyne-cytology/qc-cases", {
        params: {
          start_date: dateRange[0].format("YYYY-MM-DD"),
          end_date: dateRange[1].format("YYYY-MM-DD"),
          review_reason: reason,
          pathologist_id: selectedPathologist ?? undefined,
          cytotechnologist_id: selectedCytotech ?? undefined,
        },
      });
      setQcCases(res.data);
    } catch (e) {
      logger.error(e);
    } finally {
      setQcCasesLoading(false);
    }
  };

  const openGroupCases = async (group: string, label: string) => {
    if (!dateRange?.[0] || !dateRange?.[1]) return;
    setGroupCasesLabel(label);
    setGroupCasesOpen(true);
    setGroupCasesLoading(true);
    try {
      const res = await api.get<GroupCaseRow[]>("/cyto-histo-correlations/summary/cases", {
        params: {
          group,
          start_date: dateRange[0].format("YYYY-MM-DD"),
          end_date: dateRange[1].format("YYYY-MM-DD"),
        },
      });
      setGroupCasesData(res.data);
    } catch (e) {
      logger.error(e);
    } finally {
      setGroupCasesLoading(false);
    }
  };

  return (
    <>
      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => dates && setDateRange(dates)}
            format="DD/MM/YYYY"
          />
          <Select
            allowClear
            placeholder="All Pathologists"
            value={selectedPathologist}
            onChange={setSelectedPathologist}
            style={{ width: 200 }}
            options={pathologists.map((p) => ({
              label: p.full_name || p.username,
              value: p.id,
            }))}
          />
          <Select
            allowClear
            placeholder="All Cytotechnologists"
            value={selectedCytotech}
            onChange={setSelectedCytotech}
            style={{ width: 210 }}
            options={cytotechs.map((u) => ({
              label: u.full_name || u.username,
              value: u.id,
            }))}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchStats} loading={loading}>
            Refresh
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Reset
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic title="Total Cases" value={stats?.total_cases ?? 0} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Avg Turnaround (Days)"
                value={stats?.average_tt_days ?? 0}
                precision={2}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Avg Turnaround (Hours)"
                value={stats?.average_tt_hours ?? 0}
                precision={2}
              />
            </Card>
          </Col>
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
                    <Tooltip labelFormatter={(l) => dayjs(l).format("DD MMM YYYY")} />
                    <Legend />
                    <Bar dataKey="total_cases" name="Total Cases" fill="#13c2c2" radius={[4, 4, 0, 0]} />
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
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={stats.tt_distribution}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="tt_days"
                      tickFormatter={(tick) => `${tick}d`}
                      label={{ value: "TAT (Days)", position: "insideBottom", offset: -10 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      label={{ value: "Cases", angle: -90, position: "insideLeft", offset: 10 }}
                    />
                    <Tooltip
                      formatter={(v: number) => [v, "Cases"]}
                      labelFormatter={(l) => `TAT: ${l} Days`}
                    />
                    <Bar dataKey="case_count" name="Cases" fill="#722ed1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}
        {type === "gyne" && (
          <Modal
            title={
              <span>
                <SafetyCertificateOutlined style={{ marginRight: 8, color: "#722ed1" }} />
                QC Review Cases — {qcCaseModal.reason === "random_10pct" ? "NILM 10% Random" : "Abnormal"}
              </span>
            }
            open={qcCaseModal.open}
            onCancel={() => { setQcCaseModal({ open: false, reason: null }); setQcCases([]); }}
            footer={
              <Button
                icon={<DownloadOutlined />}
                disabled={qcCases.length === 0}
                onClick={() =>
                  exportToCsv(
                    `qc-cases-${qcCaseModal.reason ?? "all"}`,
                    qcCases,
                    [
                      { header: "Accession No.", key: "accession_no" },
                      { header: "HN", key: "hn" },
                      { header: "Patient", key: "patient_name" },
                      { header: "Result", key: "review_result" },
                      { header: "Discrepancy", key: "discrepancy_level", render: (v) => String(v ?? "") },
                      { header: "Note", key: "review_note", render: (v) => String(v ?? "") },
                      { header: "Reviewed By", key: "reviewed_by", render: (v) => String(v ?? "") },
                      { header: "Reviewed At", key: "reviewed_at", render: (v) => v ? dayjs(v as string).format("DD/MM/YY HH:mm") : "" },
                    ],
                  )
                }
              >
                Export CSV
              </Button>
            }
            width={900}
          >
            <Table
              loading={qcCasesLoading}
              dataSource={qcCases}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 15, showSizeChanger: false }}
              columns={[
                {
                  title: "Accession No.",
                  dataIndex: "accession_no",
                  width: 130,
                },
                {
                  title: "HN",
                  dataIndex: "hn",
                  width: 100,
                },
                {
                  title: "Patient",
                  dataIndex: "patient_name",
                  ellipsis: true,
                },
                {
                  title: "Result",
                  dataIndex: "review_result",
                  width: 90,
                  render: (v: string) =>
                    v === "agree"
                      ? <Tag color="success">Agree</Tag>
                      : <Tag color="error">Disagree</Tag>,
                },
                {
                  title: "Discrepancy",
                  dataIndex: "discrepancy_level",
                  width: 110,
                  render: (v: string) =>
                    v === "major" ? <Tag color="error">Major</Tag>
                    : v === "minor" ? <Tag color="warning">Minor</Tag>
                    : <Text type="secondary">—</Text>,
                },
                {
                  title: "Note",
                  dataIndex: "review_note",
                  ellipsis: true,
                  render: (v: string) => v || <Text type="secondary">—</Text>,
                },
                {
                  title: "Reviewed By",
                  dataIndex: "reviewed_by",
                  width: 150,
                  ellipsis: true,
                  render: (v: string) => v || <Text type="secondary">—</Text>,
                },
                {
                  title: "Reviewed At",
                  dataIndex: "reviewed_at",
                  width: 130,
                  render: (v: string) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "—",
                },
              ]}
            />
          </Modal>
        )}

        {type === "gyne" && (
          <Modal
            open={groupCasesOpen}
            title={`รายชื่อเคส — ${groupCasesLabel} (${groupCasesData.length})`}
            footer={null}
            width={960}
            centered
            onCancel={() => setGroupCasesOpen(false)}
          >
            <Table<GroupCaseRow>
              dataSource={groupCasesData}
              loading={groupCasesLoading}
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
                  title: "Category 1",
                  key: "category_1",
                  width: 150,
                  render: (r: GroupCaseRow) =>
                    r.category_1_text
                      ? <Text>{r.category_1_text}{r.category_1_code ? ` (${r.category_1_code})` : ""}</Text>
                      : <Text type="secondary">—</Text>,
                },
                {
                  title: "Diagnosis (category_2)",
                  key: "diagnosis",
                  render: (r: GroupCaseRow) => (
                    <div>
                      {r.category_text
                        ? <Text>{r.category_text}{r.category_code ? ` (${r.category_code})` : ""}</Text>
                        : <Text type="secondary">ไม่มีผล / No current diagnosis</Text>}
                      {r.interpretation && (
                        <div><Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.interpretation}</Text></div>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Modal>
        )}

        {type === "gyne" && qcStats && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card
                title={
                  <Title level={5} style={{ margin: 0 }}>
                    <SafetyCertificateOutlined style={{ marginRight: 8, color: "#722ed1" }} />
                    QC Review Quality
                  </Title>
                }
              >
                <Row gutter={[24, 24]}>
                  {/* NILM column */}
                  <Col xs={24} md={12}>
                    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Tag color="blue" style={{ fontSize: 13, padding: "2px 10px" }}>NILM — 10% Random</Tag>
                      <Button size="small" onClick={() => openQcCaseModal("random_10pct")}>View Details</Button>
                    </div>
                    <Row gutter={[12, 12]}>
                      <Col span={8}><Statistic title="Reviewed" value={qcStats.nilm.total} /></Col>
                      <Col span={8}><Statistic title="Agree" value={qcStats.nilm.agree} valueStyle={{ color: "#52c41a" }} /></Col>
                      <Col span={8}><Statistic title="Disagree" value={qcStats.nilm.disagree} valueStyle={{ color: "#ff4d4f" }} /></Col>
                    </Row>
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Agreement Rate</Text>
                      <Progress
                        percent={qcStats.nilm.agree_rate}
                        strokeColor="#52c41a"
                        trailColor="#ff4d4f"
                        format={(p) => `${p}%`}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                    {qcStats.nilm.disagree > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Discrepancy Breakdown</Text>
                        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                          <Tag color="warning">Minor: {qcStats.nilm.minor_discrepancy}</Tag>
                          <Tag color="error">Major: {qcStats.nilm.major_discrepancy}</Tag>
                        </div>
                      </div>
                    )}
                  </Col>

                  <Col xs={0} md={1} style={{ display: "flex", justifyContent: "center" }}>
                    <Divider type="vertical" style={{ height: "100%" }} />
                  </Col>

                  {/* Abnormal column */}
                  <Col xs={24} md={11}>
                    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Tag color="volcano" style={{ fontSize: 13, padding: "2px 10px" }}>Abnormal</Tag>
                      <Button size="small" onClick={() => openQcCaseModal("abnormal")}>View Details</Button>
                    </div>
                    <Row gutter={[12, 12]}>
                      <Col span={8}><Statistic title="Reviewed" value={qcStats.abnormal.total} /></Col>
                      <Col span={8}><Statistic title="Agree" value={qcStats.abnormal.agree} valueStyle={{ color: "#52c41a" }} /></Col>
                      <Col span={8}><Statistic title="Disagree" value={qcStats.abnormal.disagree} valueStyle={{ color: "#ff4d4f" }} /></Col>
                    </Row>
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Agreement Rate</Text>
                      <Progress
                        percent={qcStats.abnormal.agree_rate}
                        strokeColor="#52c41a"
                        trailColor="#ff4d4f"
                        format={(p) => `${p}%`}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                    {qcStats.abnormal.disagree > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Discrepancy Breakdown</Text>
                        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                          <Tag color="warning">Minor: {qcStats.abnormal.minor_discrepancy}</Tag>
                          <Tag color="error">Major: {qcStats.abnormal.major_discrepancy}</Tag>
                        </div>
                      </div>
                    )}
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        )}

        {type === "gyne" && correlationSummary && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col xs={24} md={8}>
              <Card title="จำนวนเคสจากการลงทะเบียน">
                <Table<{ key: string; label: string; count: number; bold?: boolean }>
                  dataSource={[
                    { key: "conv",  label: "Conventional Pap", count: correlationSummary.registration_counts.conventional },
                    { key: "liq",   label: "Liquid Based",     count: correlationSummary.registration_counts.liquid_based },
                    { key: "other", label: "อื่นๆ",             count: correlationSummary.registration_counts.other },
                    { key: "total", label: "รวม",              count: correlationSummary.registration_counts.total, bold: true },
                  ]}
                  rowKey="key"
                  pagination={false}
                  size="small"
                  bordered
                  onRow={(row) => row.bold ? { style: { background: "#f0f5ff", fontWeight: 600 } } : {}}
                  columns={[
                    {
                      title: "ประเภท",
                      dataIndex: "label",
                      key: "label",
                      render: (label: string, row) => <Text strong={row.bold}>{label}</Text>,
                    },
                    {
                      title: "จำนวน",
                      dataIndex: "count",
                      key: "count",
                      align: "center" as const,
                      width: 100,
                      render: (v: number, row) => <Text strong={row.bold}>{v}</Text>,
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} md={16}>
              <Card title="ตารางสรุปผล Gyne Cytology (คลิกแถวเพื่อดูรายชื่อเคส)">
                <Table<DiagBreakdownRow>
                  dataSource={correlationSummary.breakdown}
                  rowKey="group"
                  pagination={false}
                  size="small"
                  bordered
                  scroll={{ x: "max-content" }}
                  onRow={(row) => ({
                    onClick: () => openGroupCases(row.group, row.label),
                    style: {
                      cursor: "pointer",
                      background: row.group === "unsatisfactory" ? "#fff7e6" : undefined,
                    },
                  })}
                  summary={() => (
                    <Table.Summary.Row style={{ background: "#f0f5ff", fontWeight: 600 }}>
                      <Table.Summary.Cell index={0}><Text strong>รวมทั้งหมด</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="center"><Text strong>{correlationSummary.grand_total.conventional}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="center"><Text strong>{correlationSummary.grand_total.liquid_based}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="center"><Text strong>{correlationSummary.grand_total.total}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                  columns={[
                    {
                      title: "ประเภท / Diagnosis",
                      dataIndex: "label",
                      key: "label",
                      width: 220,
                    },
                    {
                      title: "Conventional Pap",
                      dataIndex: "conventional",
                      key: "conventional",
                      align: "center" as const,
                      width: 130,
                    },
                    {
                      title: "Liquid Based",
                      dataIndex: "liquid_based",
                      key: "liquid_based",
                      align: "center" as const,
                      width: 110,
                    },
                    {
                      title: "รวม",
                      dataIndex: "total",
                      key: "total",
                      align: "center" as const,
                      width: 80,
                      render: (v: number) => <Text strong>{v}</Text>,
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        )}

        {type === "gyne" && summaryRows.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card
                title="ตารางสรุปผล Gyne Cytology รายเดือน"
                extra={
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() =>
                      exportToCsv("gyne-summary", summaryRows as unknown as Record<string, unknown>[], [
                        { header: "ช่วงเวลา", key: "period", render: (v) => dayjs(String(v) + "-01").format("MMM YYYY") },
                        { header: "Conventional Pap", key: "conventional" },
                        { header: "Liquid Based", key: "liquid_based" },
                        { header: "Unsatisfactory", key: "unsatisfactory" },
                        { header: "LSIL", key: "lsil" },
                        { header: "HSIL+ Major Discordant", key: "hsil_major_discordant" },
                        { header: "HSIL+ Minor Discordant", key: "hsil_minor_discordant" },
                        { header: "รวม", key: "total" },
                      ])
                    }
                  >
                    Export CSV
                  </Button>
                }
              >
                <Table<GyneSummaryRow>
                  dataSource={summaryRows}
                  rowKey="period"
                  size="small"
                  bordered
                  pagination={false}
                  scroll={{ x: "max-content" }}
                  summary={(rows) => {
                    const tot = (key: keyof GyneSummaryRow) =>
                      rows.reduce((s, r) => s + (r[key] as number), 0);
                    return (
                      <Table.Summary.Row style={{ background: "#fafafa", fontWeight: 600 }}>
                        <Table.Summary.Cell index={0}><Text strong>รวมทั้งหมด</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="center"><Text strong>{tot("conventional")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="center"><Text strong>{tot("liquid_based")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="center"><Text strong>{tot("unsatisfactory")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="center"><Text strong>{tot("lsil")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="center"><Text strong style={{ color: "#cf1322" }}>{tot("hsil_major_discordant")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="center"><Text strong style={{ color: "#fa8c16" }}>{tot("hsil_minor_discordant")}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="center"><Text strong>{tot("total")}</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                  columns={[
                    {
                      title: "ช่วงเวลา",
                      dataIndex: "period",
                      key: "period",
                      width: 120,
                      render: (v: string) => dayjs(v + "-01").format("MMM YYYY"),
                    },
                    {
                      title: "Conventional Pap",
                      dataIndex: "conventional",
                      key: "conventional",
                      align: "center" as const,
                      width: 140,
                    },
                    {
                      title: "Liquid Based",
                      dataIndex: "liquid_based",
                      key: "liquid_based",
                      align: "center" as const,
                      width: 120,
                    },
                    {
                      title: "Unsatisfactory",
                      dataIndex: "unsatisfactory",
                      key: "unsatisfactory",
                      align: "center" as const,
                      width: 130,
                    },
                    {
                      title: "LSIL",
                      dataIndex: "lsil",
                      key: "lsil",
                      align: "center" as const,
                      width: 80,
                    },
                    {
                      title: "HSIL หรือสูงกว่า",
                      key: "hsil_group",
                      children: [
                        {
                          title: <span style={{ color: "#cf1322" }}>Major Discordant</span>,
                          dataIndex: "hsil_major_discordant",
                          key: "hsil_major",
                          align: "center" as const,
                          width: 150,
                          render: (v: number) => <Text style={{ color: v > 0 ? "#cf1322" : undefined }}>{v}</Text>,
                        },
                        {
                          title: <span style={{ color: "#fa8c16" }}>Minor Discordant</span>,
                          dataIndex: "hsil_minor_discordant",
                          key: "hsil_minor",
                          align: "center" as const,
                          width: 150,
                          render: (v: number) => <Text style={{ color: v > 0 ? "#fa8c16" : undefined }}>{v}</Text>,
                        },
                      ],
                    },
                    {
                      title: "รวม",
                      dataIndex: "total",
                      key: "total",
                      align: "center" as const,
                      width: 80,
                      render: (v: number) => <Text strong>{v}</Text>,
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        )}
      </Spin>
    </>
  );
};

export { StatPanel };

const CytologyStatPage: React.FC = () => (
  <div>
    <Tabs
      defaultActiveKey="gyne"
      size="large"
      items={[
        {
          key: "gyne",
          label: "Gyne Cytology",
          children: <StatPanel type="gyne" />,
        },
        {
          key: "nongyne",
          label: "Non-Gyne Cytology",
          children: <StatPanel type="nongyne" />,
        },
      ]}
    />
  </div>
);

export default CytologyStatPage;
