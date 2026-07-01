import React, { useState, useEffect } from "react";
import { Card, DatePicker, Space, Button, Table, Tag, Spin, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import type {
  TissueProcessEmbedRow,
  TissueProcessSectionRow,
  TissueProcessStainRow,
  TissueProcessingRunRow,
  TissueProcessStats,
} from "../../types/surgicalReport";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;
const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf("month"), dayjs()];

// ─── reusable name renderer ───────────────────────────────────────────────────
const nameRender = (v: string) => (
  <span>
    <UserOutlined style={{ marginRight: 6, color: "#595959" }} />
    {v}
  </span>
);

// ─── generic CSV helper ────────────────────────────────────────────────────────
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const all = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + all], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── generic summary footer ───────────────────────────────────────────────────
function SummaryRow({ cells }: { cells: { value: number; color: string }[] }) {
  return (
    <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
      <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
      {cells.map((c, i) => (
        <Table.Summary.Cell key={i} index={i + 2} align="center">
          <Tag color={c.color} style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>
            {c.value}
          </Tag>
        </Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  );
}

// ─── Embedding tab ────────────────────────────────────────────────────────────
const EmbedTable: React.FC<{ rows: TissueProcessEmbedRow[]; dateRange: [Dayjs | null, Dayjs | null] }> = ({
  rows,
  dateRange,
}) => {
  const total = rows.reduce((s, r) => s + r.block_count, 0);
  const columns: ColumnsType<TissueProcessEmbedRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Blocks",
      dataIndex: "block_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.block_count - b.block_count,
      render: (v: number) => (
        <Tag color="purple" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];
  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(
      `embedding_${s}_${e}.csv`,
      ["#", "Staff", "Blocks"],
      [...rows.map((r, i) => [i + 1, r.full_name, r.block_count]), ["", "รวม", total]],
    );
  };
  return (
    <WorkloadTable
      columns={columns}
      rows={rows}
      rowKey="user_id"
      summary={<SummaryRow cells={[{ value: total, color: "purple" }]} />}
      exportCsv={exportCsv}
      disabled={rows.length === 0}
    />
  );
};

// ─── Sectioning tab ───────────────────────────────────────────────────────────
const SectionTable: React.FC<{ rows: TissueProcessSectionRow[]; dateRange: [Dayjs | null, Dayjs | null] }> = ({
  rows,
  dateRange,
}) => {
  const totalBlocks = rows.reduce((s, r) => s + r.block_count, 0);
  const totalSlides = rows.reduce((s, r) => s + r.slide_count, 0);
  const columns: ColumnsType<TissueProcessSectionRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Blocks",
      dataIndex: "block_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.block_count - b.block_count,
      render: (v: number) => (
        <Tag color="blue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
    {
      title: "Slides",
      dataIndex: "slide_count",
      align: "center",
      sorter: (a, b) => a.slide_count - b.slide_count,
      render: (v: number) => (
        <Tag color="geekblue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];
  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(
      `sectioning_${s}_${e}.csv`,
      ["#", "Staff", "Blocks", "Slides"],
      [
        ...rows.map((r, i) => [i + 1, r.full_name, r.block_count, r.slide_count]),
        ["", "รวม", totalBlocks, totalSlides],
      ],
    );
  };
  return (
    <WorkloadTable
      columns={columns}
      rows={rows}
      rowKey="user_id"
      summary={
        <SummaryRow
          cells={[
            { value: totalBlocks, color: "blue" },
            { value: totalSlides, color: "geekblue" },
          ]}
        />
      }
      exportCsv={exportCsv}
      disabled={rows.length === 0}
    />
  );
};

// ─── Staining tab ─────────────────────────────────────────────────────────────
const StainTable: React.FC<{ rows: TissueProcessStainRow[]; dateRange: [Dayjs | null, Dayjs | null] }> = ({
  rows,
  dateRange,
}) => {
  const total = rows.reduce((s, r) => s + r.slide_count, 0);
  const columns: ColumnsType<TissueProcessStainRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Slides",
      dataIndex: "slide_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.slide_count - b.slide_count,
      render: (v: number) => (
        <Tag color="orange" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];
  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(
      `staining_${s}_${e}.csv`,
      ["#", "Staff", "Slides"],
      [...rows.map((r, i) => [i + 1, r.full_name, r.slide_count]), ["", "รวม", total]],
    );
  };
  return (
    <WorkloadTable
      columns={columns}
      rows={rows}
      rowKey="user_id"
      summary={<SummaryRow cells={[{ value: total, color: "orange" }]} />}
      exportCsv={exportCsv}
      disabled={rows.length === 0}
    />
  );
};

// ─── shared table wrapper ─────────────────────────────────────────────────────
function WorkloadTable<T extends object>({
  columns,
  rows,
  rowKey,
  summary,
  exportCsv,
  disabled,
}: {
  columns: ColumnsType<T>;
  rows: T[];
  rowKey: keyof T;
  summary: React.ReactNode;
  exportCsv: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={disabled}>
          Export CSV
        </Button>
      </div>
      <Table<T>
        rowKey={rowKey as string}
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
        summary={() => summary}
      />
    </div>
  );
}

// ─── Tissue Processing tab ────────────────────────────────────────────────────
const TissueProcessingTable: React.FC<{ rows: TissueProcessingRunRow[]; dateRange: [Dayjs | null, Dayjs | null] }> = ({
  rows,
  dateRange,
}) => {
  const totalRuns = rows.reduce((s, r) => s + r.run_count, 0);
  const totalBlocks = rows.reduce((s, r) => s + r.block_count, 0);
  const columns: ColumnsType<TissueProcessingRunRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Runs",
      dataIndex: "run_count",
      align: "center",
      sorter: (a, b) => a.run_count - b.run_count,
      render: (v: number) => (
        <Tag color="cyan" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
    {
      title: "Blocks",
      dataIndex: "block_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.block_count - b.block_count,
      render: (v: number) => (
        <Tag color="geekblue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];
  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(
      `tissue_processing_${s}_${e}.csv`,
      ["#", "Staff", "Runs", "Blocks"],
      [
        ...rows.map((r, i) => [i + 1, r.full_name, r.run_count, r.block_count]),
        ["", "รวม", totalRuns, totalBlocks],
      ],
    );
  };
  return (
    <WorkloadTable
      columns={columns}
      rows={rows}
      rowKey="user_id"
      summary={
        <SummaryRow
          cells={[
            { value: totalRuns, color: "cyan" },
            { value: totalBlocks, color: "geekblue" },
          ]}
        />
      }
      exportCsv={exportCsv}
      disabled={rows.length === 0}
    />
  );
};

// ─── main page ────────────────────────────────────────────────────────────────
const HistoPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TissueProcessStats>({
    embedding: [],
    sectioning: [],
    staining: [],
    tissue_processing: [],
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(DEFAULT_RANGE);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    if (!dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const res = await SurgicalReportService.getTissueProcessStats(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );
      setData(res);
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  };

  const badge = (n: number) =>
    n > 0 ? (
      <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>{n}</Tag>
    ) : null;

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => { if (dates) setDateRange(dates); }}
            format="DD/MM/YYYY"
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchStats} loading={loading}>
            ค้นหา
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { setDateRange(DEFAULT_RANGE); setTimeout(fetchStats, 0); }}
          >
            Reset
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Tabs
          size="middle"
          defaultActiveKey="tissue-processing"
          items={[
            {
              key: "tissue-processing",
              label: <span>Tissue Processing {badge(data.tissue_processing.reduce((s, r) => s + r.block_count, 0))}</span>,
              children: <TissueProcessingTable rows={data.tissue_processing} dateRange={dateRange} />,
            },
            {
              key: "embedding",
              label: <span>Embedding {badge(data.embedding.reduce((s, r) => s + r.block_count, 0))}</span>,
              children: <EmbedTable rows={data.embedding} dateRange={dateRange} />,
            },
            {
              key: "sectioning",
              label: <span>Sectioning {badge(data.sectioning.reduce((s, r) => s + r.block_count, 0))}</span>,
              children: <SectionTable rows={data.sectioning} dateRange={dateRange} />,
            },
            {
              key: "staining",
              label: <span>Staining {badge(data.staining.reduce((s, r) => s + r.slide_count, 0))}</span>,
              children: <StainTable rows={data.staining} dateRange={dateRange} />,
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default HistoPage;
