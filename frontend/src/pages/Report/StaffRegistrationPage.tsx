import React, { useState, useEffect } from "react";
import { Card, DatePicker, Space, Button, Table, Tag, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, ReloadOutlined, UserOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import type { StaffRegistrationRow } from "../../types/surgicalReport";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;

const COLUMNS: ColumnsType<StaffRegistrationRow> = [
  {
    title: "#",
    width: 48,
    render: (_v, _r, idx) => idx + 1,
    align: "center",
  },
  {
    title: "ชื่อ Staff",
    dataIndex: "full_name",
    render: (name: string) => (
      <span>
        <UserOutlined style={{ marginRight: 6, color: "#595959" }} />
        {name}
      </span>
    ),
  },
  {
    title: "Surgical",
    dataIndex: "surgical",
    align: "center",
    sorter: (a, b) => a.surgical - b.surgical,
    render: (v: number) => (
      <Tag color="purple" style={{ minWidth: 42, textAlign: "center" }}>
        {v}
      </Tag>
    ),
  },
  {
    title: "Gyne Cyto",
    dataIndex: "gyne",
    align: "center",
    sorter: (a, b) => a.gyne - b.gyne,
    render: (v: number) => (
      <Tag color="blue" style={{ minWidth: 42, textAlign: "center" }}>
        {v}
      </Tag>
    ),
  },
  {
    title: "Non-Gyne Cyto",
    dataIndex: "nongyne",
    align: "center",
    sorter: (a, b) => a.nongyne - b.nongyne,
    render: (v: number) => (
      <Tag color="cyan" style={{ minWidth: 42, textAlign: "center" }}>
        {v}
      </Tag>
    ),
  },
  {
    title: "รวม",
    dataIndex: "total",
    align: "center",
    defaultSortOrder: "descend",
    sorter: (a, b) => a.total - b.total,
    render: (v: number) => (
      <Tag
        color="geekblue"
        style={{ minWidth: 48, textAlign: "center", fontWeight: 700 }}
      >
        {v}
      </Tag>
    ),
  },
];

const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf("month"), dayjs()];

const StaffRegistrationPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StaffRegistrationRow[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(DEFAULT_RANGE);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    if (!dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const data = await SurgicalReportService.getStaffRegistrationStats(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );
      setRows(data);
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const start = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const end = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    const header = ["#", "ชื่อ Staff", "Surgical", "Gyne Cyto", "Non-Gyne Cyto", "รวม"];
    const dataRows = rows.map((r, i) => [
      i + 1,
      r.full_name,
      r.surgical,
      r.gyne,
      r.nongyne,
      r.total,
    ]);
    const totalSurg = rows.reduce((s, r) => s + r.surgical, 0);
    const totalGy = rows.reduce((s, r) => s + r.gyne, 0);
    const totalNg = rows.reduce((s, r) => s + r.nongyne, 0);
    const totalAll = rows.reduce((s, r) => s + r.total, 0);
    dataRows.push(["", "รวมทั้งหมด", totalSurg, totalGy, totalNg, totalAll]);

    const csv = [header, ...dataRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff_registration_${start}_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalSurgical = rows.reduce((s, r) => s + r.surgical, 0);
  const totalGyne = rows.reduce((s, r) => s + r.gyne, 0);
  const totalNongyne = rows.reduce((s, r) => s + r.nongyne, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates) setDateRange(dates);
            }}
            format="DD/MM/YYYY"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={fetchStats}
            loading={loading}
          >
            ค้นหา
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDateRange(DEFAULT_RANGE);
              setTimeout(fetchStats, 0);
            }}
          >
            Reset
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Export CSV
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Table<StaffRegistrationRow>
          rowKey="user_id"
          dataSource={rows}
          columns={COLUMNS}
          pagination={false}
          size="middle"
          bordered
          summary={() => (
            <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
              <Table.Summary.Cell index={0} colSpan={2}>
                รวมทั้งหมด
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="center">
                <Tag color="purple" style={{ minWidth: 42, textAlign: "center" }}>
                  {totalSurgical}
                </Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="center">
                <Tag color="blue" style={{ minWidth: 42, textAlign: "center" }}>
                  {totalGyne}
                </Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="center">
                <Tag color="cyan" style={{ minWidth: 42, textAlign: "center" }}>
                  {totalNongyne}
                </Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="center">
                <Tag color="geekblue" style={{ minWidth: 48, textAlign: "center", fontWeight: 700 }}>
                  {grandTotal}
                </Tag>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Spin>
    </div>
  );
};

export default StaffRegistrationPage;
