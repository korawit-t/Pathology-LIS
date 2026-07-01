import React, { useState, useEffect } from "react";
import {
  Card,
  DatePicker,
  Space,
  Button,
  Table,
  Tag,
  Spin,
  Tabs,
  Statistic,
  Row,
  Col,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  UserOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import type { StaffGrossRow, StaffGrossItem } from "../../types/surgicalReport";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;

const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf("month"), dayjs()];

const ITEM_COLUMNS: ColumnsType<StaffGrossItem> = [
  {
    title: "Specimen Name",
    dataIndex: "specimen_name",
    ellipsis: true,
  },
  {
    title: "จำนวน",
    dataIndex: "count",
    align: "center",
    width: 100,
    sorter: (a, b) => a.count - b.count,
    render: (v: number) => (
      <Tag color="geekblue" style={{ minWidth: 40, textAlign: "center", fontWeight: 700 }}>
        {v}
      </Tag>
    ),
  },
];

interface GrossStaffTableProps {
  rows: StaffGrossRow[];
  role: "examiner" | "assistant";
  dateRange: [Dayjs | null, Dayjs | null];
}

const GrossStaffTable: React.FC<GrossStaffTableProps> = ({ rows, role, dateRange }) => {
  const totalSpecimens = rows.reduce((s, r) => s + r.specimen_count, 0);

  const exportCsv = () => {
    const start = dateRange[0]?.format("YYYY-MM-DD") ?? "";
    const end = dateRange[1]?.format("YYYY-MM-DD") ?? "";
    const header = ["Staff", "Specimen Name", "จำนวน"];
    const dataRows: (string | number)[][] = [];
    for (const staff of rows) {
      for (const item of staff.items) {
        dataRows.push([staff.full_name, item.specimen_name, item.count]);
      }
      dataRows.push([staff.full_name, "รวม", staff.specimen_count]);
    }
    const csv = [header, ...dataRows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gross_${role}_${start}_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#8c8c8c" }}>
        ไม่พบข้อมูล
      </div>
    );
  }

  return (
    <div>
      {/* Summary + export */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Card size="small" style={{ background: "#f0f5ff", border: "1px solid #adc6ff", minWidth: 160 }}>
          <Statistic
            title={<span style={{ fontSize: 12, color: "#595959" }}>รวม Specimen ทั้งหมด</span>}
            value={totalSpecimens}
            valueStyle={{ fontSize: 24, fontWeight: 800, color: "#1d39c4" }}
            suffix={<span style={{ fontSize: 12, color: "#8c8c8c" }}>ชิ้น</span>}
          />
        </Card>
        <Button
          icon={<DownloadOutlined />}
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {/* Per-staff expandable tables */}
      {rows.map((staff) => (
        <Card
          key={staff.user_id}
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Row align="middle" gutter={12}>
              <Col>
                <UserOutlined style={{ marginRight: 6, color: "#595959" }} />
                <span style={{ fontWeight: 600 }}>{staff.full_name}</span>
              </Col>
              <Col>
                <Tag color="geekblue" style={{ fontWeight: 700, fontSize: 13 }}>
                  {staff.specimen_count} ชิ้น
                </Tag>
              </Col>
            </Row>
          }
        >
          <Table<StaffGrossItem>
            rowKey={(r) => `${r.specimen_name}|${r.site}|${r.procedure}`}
            dataSource={staff.items}
            columns={ITEM_COLUMNS}
            pagination={false}
            size="small"
            summary={() => (
              <Table.Summary.Row style={{ fontWeight: 700, background: "#fafafa" }}>
                <Table.Summary.Cell index={0} colSpan={3}>
                  รวม
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center">
                  <Tag color="geekblue" style={{ minWidth: 40, textAlign: "center", fontWeight: 700 }}>
                    {staff.specimen_count}
                  </Tag>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      ))}
    </div>
  );
};

const StaffGrossPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ examiners: StaffGrossRow[]; assistants: StaffGrossRow[] }>({
    examiners: [],
    assistants: [],
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(DEFAULT_RANGE);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    if (!dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const res = await SurgicalReportService.getStaffGrossStats(
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
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Tabs
          size="small"
          items={[
            {
              key: "examiner",
              label: (
                <span>
                  <ExperimentOutlined style={{ marginRight: 6 }} />
                  Gross Examiner
                  {data.examiners.length > 0 && (
                    <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>
                      {data.examiners.reduce((s, r) => s + r.specimen_count, 0)}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <GrossStaffTable rows={data.examiners} role="examiner" dateRange={dateRange} />
              ),
            },
            {
              key: "assistant",
              label: (
                <span>
                  <ExperimentOutlined style={{ marginRight: 6 }} />
                  Gross Assistant
                  {data.assistants.length > 0 && (
                    <Tag color="cyan" style={{ marginLeft: 6, fontSize: 11 }}>
                      {data.assistants.reduce((s, r) => s + r.specimen_count, 0)}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <GrossStaffTable rows={data.assistants} role="assistant" dateRange={dateRange} />
              ),
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default StaffGrossPage;
