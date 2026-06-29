import React, { useMemo } from "react";
import { Table, Tag, Space, Typography, Button, Tooltip, Progress } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import dayjs from "dayjs";
import { calculateTATProgress } from "../../../utils/tatUtils";
import type { SystemSetting } from "../../../types/system";
import {
  ClockCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  ExperimentOutlined,
  EditOutlined,
  FileSearchOutlined,
  FireFilled,
  PrinterOutlined,
} from "@ant-design/icons";
import { STATUS_OPTIONS } from "../../../constants/lab.constants";
import { NongyneCytologyCase } from "../../../types/nongyne";
import "../../../styles/table-common.css";
import AccessionTag from "../../../components/AccessionTag";

const renderStatus = (status: string) => {
  const s = status ? status.toLowerCase() : "";
  let color = "default";
  let icon = <ClockCircleOutlined />;
  let label = status ? status : "Unknown";

  if (s === "registered") {
    color = "cyan"; icon = <ClockCircleOutlined />; label = "Registered";
  } else if (s === "screening" || s === "screened") {
    color = "geekblue"; icon = <SyncOutlined spin />; label = "Screening";
  } else if (s === "stained") {
    color = "purple"; icon = <ExperimentOutlined />; label = "Stained";
  } else if (s === "revised") {
    color = "volcano"; icon = <ExclamationCircleOutlined />; label = "Revised";
  } else if (s === "pending_approval") {
    color = "gold"; icon = <ClockCircleOutlined />; label = "Pending Approval";
  } else if (s === "reported" || s === "completed") {
    color = "green"; icon = <CheckCircleOutlined />; label = "Completed";
  } else if (s === "published") {
    color = "purple"; icon = <FileDoneOutlined />; label = "Published";
  } else if (s === "cancelled") {
    color = "red"; icon = <ExclamationCircleOutlined />; label = "Cancelled";
  }

  return <Tag color={color} icon={icon}>{label}</Tag>;
};

const { Text } = Typography;

interface NongyneTableProps {
  dataSource: NongyneCytologyCase[];
  loading: boolean;
  departments: { id: number; name: string }[];
  onEdit: (record: NongyneCytologyCase) => void;
  onPrint?: (record: NongyneCytologyCase) => void;
  onViewPdf?: (caseId: number) => void;
  total: number;
  current: number;
  onChangePage: (page: number) => void;
  hospitals: { id: number; name: string }[];
  schemes: { id: number; name: string }[];
  onFilterChange: (hospitalId: number | null, schemeId: number | null, statusList: string[]) => void;
  settings?: SystemSetting | null;
  holidays?: string[];
}

const NongyneTable: React.FC<NongyneTableProps> = ({
  dataSource,
  loading,
  departments,
  onEdit,
  onPrint,
  onViewPdf,
  total,
  current,
  onChangePage,
  hospitals,
  schemes,
  onFilterChange,
  settings,
  holidays = [],
}) => {
  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const columns: ColumnsType<NongyneCytologyCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      fixed: "left",
      sorter: (a: NongyneCytologyCase, b: NongyneCytologyCase) =>
        a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
      defaultSortOrder: "descend" as const,
      render: (text: string, record: NongyneCytologyCase) => (
        <Space size={4}>
          <AccessionTag value={text} />
          {record.is_express && (
            <Tooltip title="Urgent Case">
              <Tag color="red" icon={<FireFilled />} style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                URG
              </Tag>
            </Tooltip>
          )}
          {record.is_rose && (
            <Tooltip title="Rapid On-Site Evaluation">
              <Tag color="purple" style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                ROSE
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 150,
      sorter: (a, b) => dayjs(a.registered_at).unix() - dayjs(b.registered_at).unix(),
      render: (value: string) =>
        value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Patient",
      key: "patient",
      width: 200,
      render: (_, record) =>
        [record.patient?.title?.title, record.patient?.name, record.patient?.ln].filter(Boolean).join(" ") || "-",
    },
    { title: "HN", dataIndex: "hn", width: 110 },
    {
      title: "Hospital",
      key: "hospital",
      width: 200,
      render: (_, record) => <Text style={{ fontSize: 13 }}>{record.hospital?.name || "—"}</Text>,
      filters: hospitals.map((h) => ({ text: h.name, value: h.id })),
      filterMultiple: false,
    },
    {
      title: "Coverage",
      key: "coverage",
      dataIndex: ["medical_scheme", "name"],
      width: 160,
      render: (name?: string) => (
        <Tooltip title={name}>
          <Tag color="green" style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name || "N/A"}
          </Tag>
        </Tooltip>
      ),
      filters: schemes.map((s) => ({ text: s.name, value: s.id })),
      filterMultiple: false,
    },
    {
      title: "Specimen Type",
      dataIndex: "specimen_type",
      width: 150,
      render: (type?: string) => type || "-",
    },
    {
      title: "Collection Site",
      dataIndex: "collection_site",
      width: 180,
      render: (site?: string) => site || "-",
    },
    {
      title: "Department",
      dataIndex: "department_id",
      key: "department_id",
      width: 150,
      render: (deptId?: number, record?: NongyneCytologyCase) =>
        record?.department?.name || deptMap[deptId!] || "-",
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: 120,
      align: "center",
      render: renderStatus,
      filters: STATUS_OPTIONS.map((o) => ({ text: o.label, value: o.value })),
      filterMultiple: true,
    },
    {
      title: "Workflow",
      key: "workflow",
      width: 180,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tag color={record.screened_at ? "blue" : "default"}>Screened</Tag>
          <Tag color={record.reported_at ? "green" : "default"}>Reported</Tag>
        </Space>
      ),
    },
    {
      title: "TAT",
      key: "tat",
      width: 170,
      render: (_: unknown, record: NongyneCytologyCase) => {
        const tat = calculateTATProgress(record.registered_at, "non_gyne", settings ?? null, !!record.is_express, holidays);
        if (!tat) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        return (
          <Tooltip title={`Due: ${dayjs(tat.dueDate).format("DD/MM/YYYY")}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 150 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, fontWeight: 500, color: tat.isOverdue ? "#f5222d" : "inherit" }}>
                  {tat.displayTime}
                </Text>
                <Text type="secondary" style={{ fontSize: 10 }}>{tat.percent}%</Text>
              </div>
              <Progress
                percent={tat.percent}
                showInfo={false}
                strokeColor={tat.statusColor}
                size={[150, 6]}
                status={tat.isOverdue ? "exception" : "active"}
              />
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: onViewPdf ? 80 : onPrint ? 60 : 40,
      fixed: "right" as const,
      align: "center" as const,
      render: (_: unknown, record: NongyneCytologyCase) => (
        <Space size={4}>
          {onPrint && (
            <Tooltip title="Print sticker">
              <Button type="default" size="middle" icon={<PrinterOutlined />}
                onClick={(e) => { e.stopPropagation(); onPrint(record); }} />
            </Tooltip>
          )}
          <Tooltip title="Edit">
            <Button type="primary" size="middle" icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(record); }} />
          </Tooltip>
          {onViewPdf && record.status === "published" && (
            <Tooltip title="View PDF">
              <Button type="default" size="middle"
                icon={<FileSearchOutlined style={{ color: "#1890ff" }} />}
                onClick={(e) => { e.stopPropagation(); onViewPdf(record.id); }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const handleTableChange: TableProps<NongyneCytologyCase>["onChange"] = (_pagination, filters, _sorter, extra) => {
    if (extra.action !== 'filter') return;
    const hospitalId = filters["hospital"]?.[0] != null ? Number(filters["hospital"][0]) : null;
    const schemeId = filters["coverage"]?.[0] != null ? Number(filters["coverage"][0]) : null;
    const statusList = (filters["status"] as string[]) ?? [];
    onFilterChange(hospitalId, schemeId, statusList);
  };

  return (
    <Table
      dataSource={dataSource}
      columns={columns}
      className="standard-table"
      onRow={(record) => ({ onClick: () => onEdit(record), style: { cursor: "pointer" } })}
      rowClassName={() => "editable-row"}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1500, y: "calc(100vh - 360px)" }}
      sticky
      onChange={handleTableChange}
      pagination={{
        current,
        total,
        onChange: onChangePage,
        showSizeChanger: false,
        showTotal: (t) => `Total ${t} cases`,
        pageSize: 20,
      }}
      bordered
      size="middle"
    />
  );
};

export default NongyneTable;
