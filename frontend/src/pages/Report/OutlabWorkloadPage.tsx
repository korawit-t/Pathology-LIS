import React, { useState, useEffect } from "react";
import { Card, DatePicker, Space, Button, Table, Tag, Spin, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, ReloadOutlined, DownloadOutlined, UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import type { OutlabStainWorkloadRow, OutlabConsultWorkloadRow, OutlabStats } from "../../types/surgicalReport";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;
const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf("month"), dayjs()];

const nameRender = (v: string) => (
  <span><UserOutlined style={{ marginRight: 6, color: "#595959" }} />{v}</span>
);

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Outlab Stain tab ─────────────────────────────────────────────────────────
const OutlabStainTable: React.FC<{
  rows: OutlabStainWorkloadRow[];
  dateRange: [Dayjs | null, Dayjs | null];
}> = ({ rows, dateRange }) => {
  const totalRuns = rows.reduce((s, r) => s + r.run_count, 0);
  const totalSlides = rows.reduce((s, r) => s + r.slide_count, 0);

  const columns: ColumnsType<OutlabStainWorkloadRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Runs",
      dataIndex: "run_count",
      align: "center",
      sorter: (a, b) => a.run_count - b.run_count,
      render: (v: number) => (
        <Tag color="cyan" style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>{v}</Tag>
      ),
    },
    {
      title: "Slides",
      dataIndex: "slide_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.slide_count - b.slide_count,
      render: (v: number) => (
        <Tag color="purple" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];

  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(`outlab_stain_${s}_${e}.csv`, ["#", "Staff", "Runs", "Slides"], [
      ...rows.map((r, i) => [i + 1, r.full_name, r.run_count, r.slide_count]),
      ["", "รวม", totalRuns, totalSlides],
    ]);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table<OutlabStainWorkloadRow>
        rowKey="user_id"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
            <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="center">
              <Tag color="cyan" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{totalRuns}</Tag>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="center">
              <Tag color="purple" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{totalSlides}</Tag>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
};

// ─── Outlab Consult tab ───────────────────────────────────────────────────────
const OutlabConsultTable: React.FC<{
  rows: OutlabConsultWorkloadRow[];
  dateRange: [Dayjs | null, Dayjs | null];
}> = ({ rows, dateRange }) => {
  const totalRuns = rows.reduce((s, r) => s + r.run_count, 0);
  const totalCases = rows.reduce((s, r) => s + r.case_count, 0);

  const columns: ColumnsType<OutlabConsultWorkloadRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    {
      title: "Runs",
      dataIndex: "run_count",
      align: "center",
      sorter: (a, b) => a.run_count - b.run_count,
      render: (v: number) => (
        <Tag color="cyan" style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>{v}</Tag>
      ),
    },
    {
      title: "Cases",
      dataIndex: "case_count",
      align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.case_count - b.case_count,
      render: (v: number) => (
        <Tag color="geekblue" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];

  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(`outlab_consult_${s}_${e}.csv`, ["#", "Staff", "Runs", "Cases"], [
      ...rows.map((r, i) => [i + 1, r.full_name, r.run_count, r.case_count]),
      ["", "รวม", totalRuns, totalCases],
    ]);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table<OutlabConsultWorkloadRow>
        rowKey="user_id"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
            <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="center">
              <Tag color="cyan" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{totalRuns}</Tag>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="center">
              <Tag color="geekblue" style={{ minWidth: 44, textAlign: "center", fontWeight: 700 }}>{totalCases}</Tag>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
};

// ─── main page ────────────────────────────────────────────────────────────────
const OutlabWorkloadPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OutlabStats>({ outlab_stain: [], outlab_consult: [] });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(DEFAULT_RANGE);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    if (!dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const res = await SurgicalReportService.getOutlabStats(
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
    n > 0 ? <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>{n}</Tag> : null;

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
          defaultActiveKey="stain"
          items={[
            {
              key: "stain",
              label: (
                <span>
                  Outlab Stain
                  {badge(data.outlab_stain.reduce((s, r) => s + r.slide_count, 0))}
                </span>
              ),
              children: <OutlabStainTable rows={data.outlab_stain} dateRange={dateRange} />,
            },
            {
              key: "consult",
              label: (
                <span>
                  Outlab Consult
                  {badge(data.outlab_consult.reduce((s, r) => s + r.case_count, 0))}
                </span>
              ),
              children: <OutlabConsultTable rows={data.outlab_consult} dateRange={dateRange} />,
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default OutlabWorkloadPage;
