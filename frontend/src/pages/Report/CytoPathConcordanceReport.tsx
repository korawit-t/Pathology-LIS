import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import CytoPathCorrelationService, {
  type CytoPathCorrelation,
  type CytoPathResult,
  type CytoPathSummary,
  type DiscrepancyCategory,
} from "../../services/cytoPathCorrelationService";
import UserService from "../../services/userService";
import { useAuth } from "../../hooks/useAuth";
import { exportToCsv } from "../../utils/exportCsv";
import { sanitizeHtml, stripHtmlToText } from "../../utils/sanitize";
import logger from "../../utils/logger";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const PAGE_SIZE = 20;

const RESULT_CONFIG: Record<
  CytoPathResult,
  { label: string; color: string; chart: string }
> = {
  concordant: { label: "ตรงกัน", color: "green", chart: "#52c41a" },
  minor_discrepancy: { label: "ต่างเล็กน้อย", color: "orange", chart: "#fa8c16" },
  major_discrepancy: { label: "ต่างอย่างมีนัยสำคัญ", color: "red", chart: "#cf1322" },
  not_applicable: { label: "เทียบไม่ได้", color: "default", chart: "#bfbfbf" },
};

const DISCREPANCY_CATEGORIES: { value: DiscrepancyCategory; label: string }[] = [
  { value: "interpretive", label: "ตีความต่างกัน (เห็นเซลล์เดียวกัน สรุปต่างกัน)" },
  { value: "screening_miss", label: "มองข้ามเซลล์ผิดปกติ (screening miss)" },
  { value: "sampling", label: "สิ่งส่งตรวจ/สไลด์ไม่พอตัดสิน" },
  { value: "wording", label: "ความหมายเดิม แก้แค่ถ้อยคำ" },
  { value: "other", label: "อื่น ๆ" },
];

/** The grader's own tab filter — worklist rows, not backend statuses. */
type WorklistFilter = "pending" | "minor_discrepancy" | "major_discrepancy" | "all";

const WORKLIST_FILTERS: { value: WorklistFilter; label: string }[] = [
  { value: "pending", label: "รอตัดสิน" },
  { value: "minor_discrepancy", label: "ต่างเล็กน้อย" },
  { value: "major_discrepancy", label: "ต่างอย่างมีนัยสำคัญ" },
  { value: "all", label: "ทั้งหมด" },
];

function ResultTag({ value }: { value: CytoPathResult | null }) {
  if (!value) return <Tag icon={<ExclamationCircleOutlined />}>รอตัดสิน</Tag>;
  const cfg = RESULT_CONFIG[value];
  return (
    <Tag color={cfg.color} icon={value === "concordant" ? <CheckCircleOutlined /> : undefined}>
      {cfg.label}
    </Tag>
  );
}

/** The wording hint. Deliberately never styled as a verdict — for non-gyne the
 *  diagnosis is free text, so all the machine can honestly say is whether the
 *  pathologist retyped it. */
function AutoHint({ value }: { value: CytoPathCorrelation["auto_result"] }) {
  if (!value) return <Text type="secondary">—</Text>;
  return value === "identical" ? (
    <Tooltip title="ข้อความเหมือนเดิมทุกประการ (ยังต้องให้คนตัดสินอยู่ดี)">
      <Tag>ข้อความไม่เปลี่ยน</Tag>
    </Tooltip>
  ) : (
    <Tooltip title="pathologist แก้ข้อความ — ไม่ได้แปลว่าผลต่างกันเสมอไป">
      <Tag color="gold">ข้อความเปลี่ยน</Tag>
    </Tooltip>
  );
}

function rate(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function DiagnosisPane({ title, html, meta }: { title: string; html: string | null; meta?: string }) {
  return (
    <Card size="small" title={title} style={{ height: "100%" }}>
      {meta && (
        <Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
          {meta}
        </Text>
      )}
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
      ) : (
        <Text type="secondary">ไม่มีข้อมูล</Text>
      )}
    </Card>
  );
}

const CytoPathConcordanceReport: React.FC = () => {
  const { user } = useAuth();
  const canGrade = useMemo(() => {
    const roles = user?.roles ?? [];
    return ["admin", "pathologist", "senior_pathologist", "lab_manager"].some((r) =>
      roles.includes(r as never),
    );
  }, [user]);

  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, "days"),
    dayjs(),
  ]);
  const [caseType, setCaseType] = useState<"gyne" | "nongyne" | undefined>(undefined);
  const [cytotechId, setCytotechId] = useState<number | undefined>(undefined);
  const [cytotechs, setCytotechs] = useState<{ id: number; full_name: string }[]>([]);

  const [summary, setSummary] = useState<CytoPathSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [worklistFilter, setWorklistFilter] = useState<WorklistFilter>("pending");
  const [rows, setRows] = useState<CytoPathCorrelation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const [selected, setSelected] = useState<CytoPathCorrelation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const baseParams = useMemo(
    () => ({
      case_type: caseType,
      cytotechnologist_id: cytotechId,
      start_date: range[0].format("YYYY-MM-DD"),
      end_date: range[1].format("YYYY-MM-DD"),
    }),
    [caseType, cytotechId, range],
  );

  useEffect(() => {
    UserService.getUsers()
      .then((users) =>
        setCytotechs(
          users
            .filter((u) => (u.roles ?? []).includes("cytotechnologist" as never))
            .map((u) => ({ id: u.id, full_name: u.full_name })),
        ),
      )
      .catch((err) => logger.error("โหลดรายชื่อ cytotechnologist ไม่สำเร็จ", err));
  }, []);

  const loadSummary = useCallback(() => {
    setSummaryLoading(true);
    CytoPathCorrelationService.getSummary(baseParams)
      .then(setSummary)
      .catch((err) => {
        logger.error("โหลดสรุปผล cyto-path ไม่สำเร็จ", err);
        message.error("โหลดสรุปผลไม่สำเร็จ");
      })
      .finally(() => setSummaryLoading(false));
  }, [baseParams]);

  const loadList = useCallback(() => {
    setListLoading(true);
    CytoPathCorrelationService.getAll({
      ...baseParams,
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      ...(worklistFilter === "pending"
        ? { status: "pending_review" as const }
        : worklistFilter === "all"
          ? {}
          : { result: worklistFilter }),
    })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        logger.error("โหลดรายการ cyto-path ไม่สำเร็จ", err);
        message.error("โหลดรายการไม่สำเร็จ");
      })
      .finally(() => setListLoading(false));
  }, [baseParams, page, worklistFilter]);

  useEffect(() => loadSummary(), [loadSummary]);
  useEffect(() => loadList(), [loadList]);

  // Changing a filter has to go back to page 1, but doing that in an effect
  // fires loadList twice — once on the stale page, once on the reset one.
  // Resetting in the same handler as the filter keeps it to one fetch.
  const applyFilter = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const openDrawer = (row: CytoPathCorrelation) => {
    setSelected(row);
    form.setFieldsValue({
      result: row.result,
      discrepancy_category: row.discrepancy_category,
      comment: row.comment,
    });
  };

  const submitVerdict = async () => {
    if (!selected) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await CytoPathCorrelationService.setVerdict(selected.id, values);
      message.success("บันทึกผลการตัดสินแล้ว");
      setSelected(null);
      loadList();
      loadSummary();
    } catch (err) {
      logger.error("บันทึกผลการตัดสินไม่สำเร็จ", err);
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const overall = summary?.overall;
  const pendingCount = overall?.pending ?? 0;

  const listColumns = [
    {
      title: "Accession",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      render: (v: string | null, row: CytoPathCorrelation) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v ?? "—"}</Text>
          <Tag color={row.case_type === "gyne" ? "magenta" : "cyan"}>
            {row.case_type === "gyne" ? "Gyne" : "Non-Gyne"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Cytotechnologist",
      key: "cytotechnologist",
      width: 150,
      render: (_: unknown, row: CytoPathCorrelation) =>
        row.cytotechnologist?.full_name ?? <Text type="secondary">—</Text>,
    },
    {
      title: "ผล cytotech",
      dataIndex: "screening_summary",
      key: "screening_summary",
      ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">ไม่มีข้อมูล</Text>,
    },
    {
      title: "ผล final",
      dataIndex: "final_summary",
      key: "final_summary",
      ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">ยังไม่เซ็น</Text>,
    },
    {
      title: "ข้อความ",
      dataIndex: "auto_result",
      key: "auto_result",
      width: 130,
      align: "center" as const,
      render: (v: CytoPathCorrelation["auto_result"]) => <AutoHint value={v} />,
    },
    {
      title: "ผลตัดสิน",
      dataIndex: "result",
      key: "result",
      width: 170,
      render: (v: CytoPathResult | null) => <ResultTag value={v} />,
    },
    {
      title: "เซ็นออก",
      dataIndex: "signed_out_at",
      key: "signed_out_at",
      width: 130,
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "—"),
    },
    {
      title: "",
      key: "action",
      width: 110,
      render: (_: unknown, row: CytoPathCorrelation) => (
        <Button type="link" onClick={() => openDrawer(row)}>
          {canGrade ? "ตัดสิน" : "ดูรายละเอียด"}
        </Button>
      ),
    },
  ];

  const perUserColumns = [
    { title: "Cytotechnologist", dataIndex: "full_name", key: "full_name" },
    { title: "เคสทั้งหมด", dataIndex: "total", key: "total", align: "center" as const, width: 100 },
    { title: "ตัดสินแล้ว", dataIndex: "graded", key: "graded", align: "center" as const, width: 100 },
    {
      title: "ตรงกัน",
      dataIndex: "concordant",
      key: "concordant",
      align: "center" as const,
      width: 90,
    },
    {
      title: "ต่างเล็กน้อย",
      dataIndex: "minor_discrepancy",
      key: "minor_discrepancy",
      align: "center" as const,
      width: 110,
    },
    {
      title: "ต่างมีนัยสำคัญ",
      dataIndex: "major_discrepancy",
      key: "major_discrepancy",
      align: "center" as const,
      width: 120,
      render: (v: number) => (
        <Text strong={v > 0} type={v > 0 ? "danger" : undefined}>
          {v}
        </Text>
      ),
    },
    {
      title: "รอตัดสิน",
      dataIndex: "pending",
      key: "pending",
      align: "center" as const,
      width: 100,
    },
    {
      title: "Concordance",
      dataIndex: "concordance_rate",
      key: "concordance_rate",
      align: "center" as const,
      width: 120,
      render: (v: number | null) => <Text strong>{rate(v)}</Text>,
    },
  ];

  const toolbar = (
    <Space wrap style={{ marginBottom: 16 }}>
      <RangePicker
        value={range}
        format="DD/MM/YYYY"
        allowClear={false}
        onChange={(v) => v && applyFilter(setRange)(v as [Dayjs, Dayjs])}
      />
      <Select
        allowClear
        placeholder="ทุกประเภท"
        style={{ width: 150 }}
        value={caseType}
        onChange={applyFilter(setCaseType)}
        options={[
          { value: "gyne", label: "Gyne" },
          { value: "nongyne", label: "Non-Gyne" },
        ]}
      />
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder="ทุก cytotechnologist"
        style={{ width: 240 }}
        value={cytotechId}
        onChange={applyFilter(setCytotechId)}
        options={cytotechs.map((c) => ({ value: c.id, label: c.full_name }))}
      />
      <Button
        icon={<ReloadOutlined />}
        onClick={() => {
          loadSummary();
          loadList();
        }}
      >
        Refresh
      </Button>
      <Button
        onClick={() => {
          setRange([dayjs().subtract(30, "days"), dayjs()]);
          setCaseType(undefined);
          setCytotechId(undefined);
          setPage(1);
        }}
      >
        Reset
      </Button>
    </Space>
  );

  const overviewTab = (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" variant="borderless" style={{ background: "#fafafa" }}>
            <Statistic title="เคสที่เทียบได้" value={overall?.total ?? 0} loading={summaryLoading} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" variant="borderless" style={{ background: "#f6ffed" }}>
            <Statistic
              title="Concordance"
              value={rate(overall?.concordance_rate ?? null)}
              valueStyle={{ color: "#52c41a" }}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" variant="borderless" style={{ background: "#fff1f0" }}>
            <Statistic
              title="ต่างอย่างมีนัยสำคัญ"
              value={rate(overall?.major_rate ?? null)}
              valueStyle={{ color: "#cf1322" }}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" variant="borderless" style={{ background: "#fff7e6" }}>
            <Statistic
              title="รอตัดสิน"
              value={pendingCount}
              valueStyle={{ color: "#fa8c16" }}
              loading={summaryLoading}
            />
          </Card>
        </Col>
      </Row>

      {overall && overall.graded === 0 && overall.total > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="ยังไม่มีเคสไหนถูกตัดสิน"
          description="อัตรา concordance คิดจากเคสที่ตัดสินแล้วเท่านั้น — เคสที่ยังรออยู่ไม่ถูกนับเป็นตรงกัน จึงยังแสดงเป็น — อยู่"
        />
      )}

      <Card
        size="small"
        title="สถิติรายคน"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!summary?.by_cytotechnologist.length}
            onClick={() =>
              exportToCsv(
                `cyto-path-concordance-by-staff-${range[0].format("YYYYMMDD")}-${range[1].format("YYYYMMDD")}`,
                (summary?.by_cytotechnologist ?? []) as unknown as Record<string, unknown>[],
                [
                  { header: "Cytotechnologist", key: "full_name" },
                  { header: "เคสทั้งหมด", key: "total" },
                  { header: "ตัดสินแล้ว", key: "graded" },
                  { header: "ตรงกัน", key: "concordant" },
                  { header: "ต่างเล็กน้อย", key: "minor_discrepancy" },
                  { header: "ต่างมีนัยสำคัญ", key: "major_discrepancy" },
                  { header: "รอตัดสิน", key: "pending" },
                  {
                    header: "Concordance %",
                    key: "concordance_rate",
                    render: (v) => (v === null ? "" : String(v)),
                  },
                ],
              )
            }
          >
            Export CSV
          </Button>
        }
      >
        <Table
          size="small"
          rowKey={(r) => String(r.user_id ?? "unassigned")}
          loading={summaryLoading}
          dataSource={summary?.by_cytotechnologist ?? []}
          columns={perUserColumns}
          pagination={false}
          locale={{ emptyText: <Empty description="ยังไม่มีเคสในช่วงเวลานี้" /> }}
        />
      </Card>

      <Card size="small" title="แนวโน้มรายเดือน">
        {summary?.monthly.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <ReTooltip />
              <Legend />
              <Bar
                dataKey="concordant"
                stackId="a"
                name={RESULT_CONFIG.concordant.label}
                fill={RESULT_CONFIG.concordant.chart}
              />
              <Bar
                dataKey="minor_discrepancy"
                stackId="a"
                name={RESULT_CONFIG.minor_discrepancy.label}
                fill={RESULT_CONFIG.minor_discrepancy.chart}
              />
              <Bar
                dataKey="major_discrepancy"
                stackId="a"
                name={RESULT_CONFIG.major_discrepancy.label}
                fill={RESULT_CONFIG.major_discrepancy.chart}
              />
              <Bar dataKey="pending" stackId="a" name="รอตัดสิน" fill="#d9d9d9" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="ยังไม่มีข้อมูลในช่วงเวลานี้" />
        )}
      </Card>
    </>
  );

  const worklistTab = (
    <>
      <Space style={{ marginBottom: 12, width: "100%", justifyContent: "space-between" }}>
        <Segmented
          value={worklistFilter}
          onChange={(v) => applyFilter(setWorklistFilter)(v as WorklistFilter)}
          options={WORKLIST_FILTERS}
        />
        <Button
          icon={<DownloadOutlined />}
          disabled={!rows.length}
          onClick={() =>
            exportToCsv(
              `cyto-path-concordance-p${page}`,
              rows as unknown as Record<string, unknown>[],
              [
                { header: "Accession", key: "accession_no" },
                { header: "ประเภท", key: "case_type" },
                {
                  header: "Cytotechnologist",
                  key: "cytotechnologist",
                  render: (_v, row) =>
                    (row.cytotechnologist as { full_name?: string } | null)?.full_name ?? "",
                },
                {
                  header: "ผล cytotech",
                  key: "screening_diagnosis",
                  render: (v) => (v ? stripHtmlToText(String(v)) : ""),
                },
                {
                  header: "ผล final",
                  key: "final_diagnosis",
                  render: (v) => (v ? stripHtmlToText(String(v)) : ""),
                },
                { header: "ข้อความ", key: "auto_result", render: (v) => String(v ?? "") },
                { header: "ผลตัดสิน", key: "result", render: (v) => String(v ?? "") },
                {
                  header: "ประเภทความต่าง",
                  key: "discrepancy_category",
                  render: (v) => String(v ?? ""),
                },
                { header: "หมายเหตุ", key: "comment", render: (v) => String(v ?? "") },
                {
                  header: "เซ็นออก",
                  key: "signed_out_at",
                  render: (v) => (v ? dayjs(v as string).format("DD/MM/YYYY HH:mm") : ""),
                },
              ],
            )
          }
        >
          Export CSV (หน้านี้)
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="middle"
        bordered
        loading={listLoading}
        dataSource={rows}
        columns={listColumns}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: <Empty description="ไม่มีเคสในเงื่อนไขนี้" /> }}
      />
    </>
  );

  return (
    <div>
      {toolbar}
      <Tabs
        items={[
          { key: "overview", label: "ภาพรวม", children: overviewTab },
          {
            key: "worklist",
            label: (
              <span>
                รายการเคส <Badge count={pendingCount} overflowCount={999} />
              </span>
            ),
            children: worklistTab,
          },
        ]}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width={880}
        title={
          selected ? (
            <Space>
              <Text strong>{selected.accession_no}</Text>
              <Tag color={selected.case_type === "gyne" ? "magenta" : "cyan"}>
                {selected.case_type === "gyne" ? "Gyne" : "Non-Gyne"}
              </Tag>
              <AutoHint value={selected.auto_result} />
            </Space>
          ) : null
        }
        extra={
          canGrade && selected ? (
            <Button type="primary" loading={saving} onClick={submitVerdict}>
              บันทึกผลการตัดสิน
            </Button>
          ) : null
        }
      >
        {selected && (
          <>
            {selected.status === "no_screening_data" && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: 16 }}
                message="เคสนี้ไม่มีผลฝั่ง cytotech"
                description="pathologist เป็นผู้เขียนเองทั้งหมด หรือเป็นเคสก่อนเปิดใช้ระบบนี้ — จึงไม่ถูกนับในสถิติ concordance"
              />
            )}
            <Row gutter={16}>
              <Col span={12}>
                <DiagnosisPane
                  title="ผล cytotechnologist (ตอนส่งเคส)"
                  html={selected.screening_diagnosis}
                  meta={[
                    selected.cytotechnologist?.full_name,
                    selected.screened_at
                      ? dayjs(selected.screened_at).format("DD/MM/YYYY HH:mm")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </Col>
              <Col span={12}>
                <DiagnosisPane
                  title="ผล final (ตอนเซ็นออก)"
                  html={selected.final_diagnosis}
                  meta={[
                    selected.pathologist?.full_name,
                    selected.signed_out_at
                      ? dayjs(selected.signed_out_at).format("DD/MM/YYYY HH:mm")
                      : null,
                    (selected.version_no ?? 1) > 1 ? `แก้ไขครั้งที่ ${selected.version_no}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </Col>
            </Row>

            <Title level={5} style={{ marginTop: 24 }}>
              ผลการตัดสิน
            </Title>
            {!canGrade && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="ดูได้อย่างเดียว — การตัดสินเป็นสิทธิ์ของ pathologist หรือหัวหน้าแล็บ"
              />
            )}
            <Form form={form} layout="vertical" disabled={!canGrade || saving}>
              <Form.Item name="result" label="ผลเทียบ">
                <Radio.Group>
                  {(Object.keys(RESULT_CONFIG) as CytoPathResult[]).map((key) => (
                    <Radio.Button key={key} value={key}>
                      {RESULT_CONFIG[key].label}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
              <Form.Item name="discrepancy_category" label="สาเหตุที่ต่างกัน">
                <Select allowClear placeholder="เลือกสาเหตุ" options={DISCREPANCY_CATEGORIES} />
              </Form.Item>
              <Form.Item name="comment" label="หมายเหตุ">
                <TextArea rows={3} placeholder="บันทึกเพิ่มเติมสำหรับรายงาน QC" />
              </Form.Item>
            </Form>
            {selected.reviewed_by && (
              <Text type="secondary">
                ตัดสินโดย {selected.reviewed_by.full_name}
                {selected.reviewed_at
                  ? ` เมื่อ ${dayjs(selected.reviewed_at).format("DD/MM/YYYY HH:mm")}`
                  : ""}
              </Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default CytoPathConcordanceReport;
