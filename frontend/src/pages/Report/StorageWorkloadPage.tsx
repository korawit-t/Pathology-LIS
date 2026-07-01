import React, { useState, useEffect } from "react";
import { Card, DatePicker, Space, Button, Table, Tag, Spin, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, ReloadOutlined, DownloadOutlined, UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import type { BlockStorageWorkloadRow, SlideStorageWorkloadRow, StorageStats } from "../../types/surgicalReport";
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

// ─── Block Storage tab ────────────────────────────────────────────────────────
const BlockStorageTable: React.FC<{
  rows: BlockStorageWorkloadRow[];
  dateRange: [Dayjs | null, Dayjs | null];
}> = ({ rows, dateRange }) => {
  const total = rows.reduce((s, r) => s + r.block_count, 0);

  const columns: ColumnsType<BlockStorageWorkloadRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
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
    downloadCsv(`block_storage_${s}_${e}.csv`, ["#", "Staff", "Blocks"], [
      ...rows.map((r, i) => [i + 1, r.full_name, r.block_count]),
      ["", "รวม", total],
    ]);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table<BlockStorageWorkloadRow>
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
              <Tag color="geekblue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{total}</Tag>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
};

// ─── Slide Storage tab ────────────────────────────────────────────────────────
const SLIDE_CATS: { key: keyof Omit<SlideStorageWorkloadRow, "user_id" | "full_name" | "total">; label: string; color: string }[] = [
  { key: "HE",      label: "H&E",       color: "#1890ff" },
  { key: "Special", label: "Special",   color: "#722ed1" },
  { key: "IHC",     label: "IHC",       color: "#d46b08" },
  { key: "Gyne",    label: "Gyne",      color: "#13c2c2" },
  { key: "NonGyne", label: "Non-Gyne",  color: "#eb2f96" },
];

const SlideStorageTable: React.FC<{
  rows: SlideStorageWorkloadRow[];
  dateRange: [Dayjs | null, Dayjs | null];
}> = ({ rows, dateRange }) => {
  const totals = SLIDE_CATS.reduce((acc, c) => {
    acc[c.key] = rows.reduce((s, r) => s + (r[c.key] ?? 0), 0);
    return acc;
  }, {} as Record<string, number>);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  const columns: ColumnsType<SlideStorageWorkloadRow> = [
    { title: "#", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
    { title: "Staff", dataIndex: "full_name", render: nameRender },
    ...SLIDE_CATS.map((c) => ({
      title: c.label,
      dataIndex: c.key,
      align: "center" as const,
      sorter: (a: SlideStorageWorkloadRow, b: SlideStorageWorkloadRow) => (a[c.key] ?? 0) - (b[c.key] ?? 0),
      render: (v: number) =>
        v > 0 ? (
          <Tag color={c.color} style={{ minWidth: 40, textAlign: "center", fontWeight: 600 }}>{v}</Tag>
        ) : (
          <span style={{ color: "#d9d9d9" }}>—</span>
        ),
    })),
    {
      title: "รวม",
      dataIndex: "total",
      align: "center",
      defaultSortOrder: "descend" as const,
      sorter: (a: SlideStorageWorkloadRow, b: SlideStorageWorkloadRow) => a.total - b.total,
      render: (v: number) => (
        <Tag color="geekblue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>{v}</Tag>
      ),
    },
  ];

  const exportCsv = () => {
    const s = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const e = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    downloadCsv(`slide_storage_${s}_${e}.csv`,
      ["#", "Staff", ...SLIDE_CATS.map((c) => c.label), "รวม"],
      [
        ...rows.map((r, i) => [i + 1, r.full_name, ...SLIDE_CATS.map((c) => r[c.key] ?? 0), r.total]),
        ["", "รวม", ...SLIDE_CATS.map((c) => totals[c.key]), grandTotal],
      ],
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table<SlideStorageWorkloadRow>
        rowKey="user_id"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
            <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
            {SLIDE_CATS.map((c, i) => (
              <Table.Summary.Cell key={c.key} index={i + 2} align="center">
                <Tag color={c.color} style={{ minWidth: 40, textAlign: "center", fontWeight: 700 }}>
                  {totals[c.key]}
                </Tag>
              </Table.Summary.Cell>
            ))}
            <Table.Summary.Cell index={7} align="center">
              <Tag color="geekblue" style={{ minWidth: 52, textAlign: "center", fontWeight: 700 }}>
                {grandTotal}
              </Tag>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
};

// ─── main page ────────────────────────────────────────────────────────────────
const StorageWorkloadPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StorageStats>({ block_storage: [], slide_storage: [] });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(DEFAULT_RANGE);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    if (!dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const res = await SurgicalReportService.getStorageStats(
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
          defaultActiveKey="block"
          items={[
            {
              key: "block",
              label: <span>Block Storage {badge(data.block_storage.reduce((s, r) => s + r.block_count, 0))}</span>,
              children: <BlockStorageTable rows={data.block_storage} dateRange={dateRange} />,
            },
            {
              key: "slide",
              label: <span>Slide Storage {badge(data.slide_storage.reduce((s, r) => s + r.total, 0))}</span>,
              children: <SlideStorageTable rows={data.slide_storage} dateRange={dateRange} />,
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default StorageWorkloadPage;
