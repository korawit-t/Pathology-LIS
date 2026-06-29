import React, { useMemo } from "react";
import { Table, Button, Tag, Tooltip, Space, Typography } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import dayjs from "dayjs";
import { EditOutlined, FileSearchOutlined, FireFilled, InboxOutlined, PrinterOutlined } from "@ant-design/icons";
import { STATUS_OPTIONS } from "../../../../constants/lab.constants";
import { SurgicalCase } from "../../../../types/surgical";
import type { Department } from "../../../../types/department";
import { SurgicalWorkflowProgress } from "../../../../components/SurgicalWorkflowProgress";
import AccessionTag from "../../../../components/AccessionTag";
import "../../../../styles/table-common.css";

const { Text } = Typography;

interface SurgicalTableProps {
  dataSource: SurgicalCase[];
  loading: boolean;
  departments: Department[];
  onEdit: (record: SurgicalCase) => void;
  onPrint?: (record: SurgicalCase) => void;
  onViewPdf?: (caseId: number) => void;
  total: number;
  current: number;
  onChangePage: (page: number) => void;
  hospitals: { id: number; name: string }[];
  schemes: { id: number; name: string }[];
  onFilterChange: (hospitalId: number | null, schemeId: number | null, statusList: string[]) => void;
}

const SurgicalTable: React.FC<SurgicalTableProps> = ({
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
}) => {
  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const columns: ColumnsType<SurgicalCase> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 160,
      fixed: "left",
      sorter: (a: SurgicalCase, b: SurgicalCase) =>
        a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
      defaultSortOrder: "descend" as const,
      render: (text: string, record: SurgicalCase) => (
        <Space size={4}>
          <AccessionTag value={text} />
          {record.is_express && (
            <Tooltip title="Urgent Case">
              <Tag color="red" icon={<FireFilled />} style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                URG
              </Tag>
            </Tooltip>
          )}
          {record.is_frozen_section && (
            <Tooltip title="Frozen Section">
              <Tag color="cyan" style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                ❄ FS
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      width: 150,
      sorter: (a, b) => dayjs(a.registered_at).unix() - dayjs(b.registered_at).unix(),
      render: (value: string) =>
        value ? <Text style={{ fontSize: 13 }}>{dayjs(value).format("DD/MM/YYYY HH:mm")}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Patient",
      key: "patient",
      width: 200,
      render: (_, record) => (
        <Text strong style={{ fontSize: 13 }}>
          {[record.patient?.title?.title, record.patient?.name, record.patient?.ln].filter(Boolean).join(" ") || "—"}
        </Text>
      ),
    },
    { title: "HN", dataIndex: "hn", width: 110, render: (v) => <Text style={{ fontSize: 13 }}>{v || "—"}</Text> },
    {
      title: "Hospital",
      key: "hospital",
      width: 220,
      render: (_, record: SurgicalCase) => <Text style={{ fontSize: 13 }}>{record.hospital?.name || "—"}</Text>,
      filters: hospitals.map((h) => ({ text: h.name, value: h.id })),
      filterMultiple: false,
    },
    {
      title: "Department",
      dataIndex: "department_id",
      width: 150,
      render: (deptId?: number, record?: SurgicalCase) =>
        <Text style={{ fontSize: 13 }}>{record?.department?.name || deptMap[deptId!] || "—"}</Text>,
    },
    {
      title: "Clinician",
      dataIndex: "clinician_name",
      width: 160,
      render: (name?: string) => <Text style={{ fontSize: 13 }}>{name || "—"}</Text>,
    },
    {
      title: "Coverage",
      key: "coverage",
      dataIndex: ["medical_scheme", "name"],
      width: 160,
      render: (name?: string) => <Tag color="green" style={{ fontSize: 12 }}>{name || "N/A"}</Tag>,
      filters: schemes.map((s) => ({ text: s.name, value: s.id })),
      filterMultiple: false,
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: 150,
      render: (status: string) => {
        const opt = STATUS_OPTIONS.find((o) => o.value === status);
        return <Tag color={opt?.color}>{opt?.label || status}</Tag>;
      },
      filters: STATUS_OPTIONS.map((o) => ({ text: o.label, value: o.value })),
      filterMultiple: true,
    },
    {
      title: "Workflow",
      key: "workflow",
      width: 200,
      align: "center",
      render: (_, record) => <SurgicalWorkflowProgress record={record} />,
    },
    {
      title: "",
      key: "actions",
      width: onViewPdf ? 100 : onPrint ? 80 : 60,
      fixed: "right",
      align: "center",
      render: (_, record) => (
        <Space size={4}>
          {onPrint && (
            <Tooltip title="Print sticker">
              <Button type="default" size="middle" icon={<PrinterOutlined />}
                onClick={(e) => { e.stopPropagation(); onPrint(record); }} />
            </Tooltip>
          )}
          <Tooltip title="Edit">
            <Button
              type="primary"
              size="middle"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(record); }}
            />
          </Tooltip>
          {onViewPdf && record.status === "published" && (
            <Tooltip title="View PDF">
              <Button
                type="default"
                size="middle"
                icon={<FileSearchOutlined style={{ color: "#1890ff" }} />}
                onClick={(e) => { e.stopPropagation(); onViewPdf(record.id); }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const handleTableChange: TableProps<SurgicalCase>["onChange"] = (_pagination, filters, _sorter, extra) => {
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
      rowClassName={(record) => record.is_express ? "editable-row row-express" : "editable-row"}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1500, y: "calc(100vh - 360px)" }}
      sticky
      onChange={handleTableChange}
      pagination={{
        current,
        pageSize: 20,
        total,
        showSizeChanger: false,
        showTotal: (t) => `Total ${t} cases`,
        onChange: onChangePage,
      }}
      locale={{
        emptyText: (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <InboxOutlined style={{ fontSize: 40, color: "#d9d9d9", display: "block", marginBottom: 12 }} />
            <Text type="secondary">No cases found</Text>
          </div>
        ),
      }}
      bordered
      size="middle"
    />
  );
};

export default SurgicalTable;
