import React, { useMemo } from "react";
import { Table, Tag, Space, Typography, Button, Tooltip, Progress } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import dayjs from "dayjs";
import { ExperimentOutlined, FileSearchOutlined, CheckCircleOutlined, EditOutlined, PrinterOutlined } from "@ant-design/icons";
import { GyneCytologyCase } from "../../../types/gyne-cytology";
import "../../../styles/table-common.css";
import AccessionTag from "../../../components/AccessionTag";
import { calculateTATProgress } from "../../../utils/tatUtils";
import type { SystemSetting } from "../../../types/system";

const { Text } = Typography;

const GYNE_STATUS_FILTERS = [
  { text: "Registered", value: "registered" },
  { text: "Screened", value: "screened" },
  { text: "Reported", value: "reported" },
  { text: "Revised", value: "revised" },
  { text: "Cancelled", value: "cancelled" },
];

interface GyneCytoTableProps {
  dataSource: GyneCytologyCase[];
  loading: boolean;
  onEdit: (record: GyneCytologyCase) => void;
  onPrint?: (record: GyneCytologyCase) => void;
  onViewPdf?: (caseId: number) => void;
  total: number;
  current: number;
  pageSize: number;
  onChangePage: (page: number) => void;
  hospitals: { id: number; name: string }[];
  departments?: { id: number; name: string }[];
  schemes?: { id: number; name: string }[];
  onFilterChange: (hospitalId: number | null, schemeId: number | null, statusList: string[]) => void;
  settings?: SystemSetting | null;
  holidays?: string[];
}

const GyneCytoTable: React.FC<GyneCytoTableProps> = ({
  dataSource,
  loading,
  total,
  current,
  pageSize,
  onChangePage,
  onEdit,
  onPrint,
  onViewPdf,
  hospitals,
  departments = [],
  schemes = [],
  onFilterChange,
  settings,
  holidays = [],
}) => {
  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );
  const columns: ColumnsType<GyneCytologyCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      fixed: "left",
      sorter: (a: GyneCytologyCase, b: GyneCytologyCase) =>
        a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
      defaultSortOrder: "descend" as const,
      render: (text: string) => <AccessionTag value={text} />,
    },
    {
      title: "Patient",
      key: "patient",
      width: 200,
      render: (_, record: GyneCytologyCase) =>
        [record.patient?.title?.title, record.patient?.name, record.patient?.ln].filter(Boolean).join(" ") || "-",
    },
    { title: "HN", dataIndex: "hn", width: 100 },
    {
      title: "Hospital",
      key: "hospital",
      width: 180,
      render: (_, record: GyneCytologyCase) => <Text style={{ fontSize: 13 }}>{record.hospital?.name || "—"}</Text>,
      filters: hospitals.map((h) => ({ text: h.name, value: h.id })),
      filterMultiple: false,
    },
    {
      title: "Department",
      dataIndex: "department_id",
      key: "department_id",
      width: 150,
      render: (deptId: number | undefined, record: GyneCytologyCase) => (
        <Text type="secondary">{record.department?.name || deptMap[deptId!] || "—"}</Text>
      ),
    },
    {
      title: "Coverage",
      key: "coverage",
      dataIndex: ["medical_scheme", "name"],
      width: 160,
      render: (_: unknown, record: GyneCytologyCase) => (
        <Tooltip title={record.medical_scheme?.name}>
          <Tag color="green" style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {record.medical_scheme?.name || "N/A"}
          </Tag>
        </Tooltip>
      ),
      filters: schemes.map((s) => ({ text: s.name, value: s.id })),
      filterMultiple: false,
    },
    {
      title: "LMP",
      dataIndex: "last_menstrual_period",
      width: 120,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <span>{value ? dayjs(value).format("DD/MM/YYYY") : "-"}</span>
          {record.is_postmenopausal && (
            <Tag color="volcano" style={{ fontSize: "10px", margin: 0 }}>Post-Menopause</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Specimen Type",
      dataIndex: "specimen_type",
      width: 170,
      render: (type: string, record: GyneCytologyCase) => (
        <Space size={4} wrap>
          <Tag icon={<ExperimentOutlined />} color={type?.includes("Liquid") ? "blue" : "cyan"}>
            {type || "N/A"}
          </Tag>
          {record.is_out_lab_consult && (
            <Tag color="volcano" style={{ fontSize: 11, padding: "0 5px" }}>External Consult</Tag>
          )}
          {record.is_out_lab && (
            <Tag color="geekblue" style={{ fontSize: 11, padding: "0 5px" }}>Sent Out</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: 130,
      render: (status: string) => {
        let color = "default";
        let icon: React.ReactNode = null;
        switch (status) {
          case "registered": color = "blue"; break;
          case "screened": color = "orange"; icon = <FileSearchOutlined />; break;
          case "reported": color = "green"; icon = <CheckCircleOutlined />; break;
          case "revised": color = "purple"; break;
          case "cancelled": color = "red"; break;
        }
        return <Tag color={color} icon={icon}>{status.toUpperCase()}</Tag>;
      },
      filters: GYNE_STATUS_FILTERS,
      filterMultiple: true,
    },
    {
      title: "Cytotech / Pathologist",
      key: "staff",
      width: 200,
      render: (_, record: GyneCytologyCase) => (
        <div style={{ fontSize: "12px" }}>
          <div>CT: {record.cytotechnologist?.full_name || "-"}</div>
          <div style={{ color: "#8c8c8c" }}>MD: {record.pathologist?.full_name || "-"}</div>
        </div>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      width: 150,
      render: (value: string) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "TAT",
      key: "tat",
      width: 170,
      render: (_: unknown, record: GyneCytologyCase) => {
        const tat = calculateTATProgress(record.registered_at, "gyne", settings ?? null, !!record.is_express, holidays);
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
      render: (_: unknown, record: GyneCytologyCase) => (
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
          {onViewPdf && record.status === "reported" && (
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

  const handleTableChange: TableProps<GyneCytologyCase>["onChange"] = (_pagination, filters, _sorter, extra) => {
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
      className="standard-table gyne-table"
      rowClassName={() => "editable-row"}
      onRow={(record) => ({ onClick: () => onEdit(record), style: { cursor: "pointer" } })}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1700, y: "calc(100vh - 360px)" }}
      sticky
      bordered
      size="middle"
      onChange={handleTableChange}
      pagination={{
        total,
        current,
        pageSize,
        onChange: onChangePage,
        showSizeChanger: false,
        showTotal: (t) => `Total ${t} cases`,
      }}
    />
  );
};

export default GyneCytoTable;
