import React from "react";
import { Tag, Tooltip, Space } from "antd";
import dayjs from "dayjs";
import { FireFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { SurgicalCase } from "../../../../types/surgical";
import { STATUS_OPTIONS } from "../../../../constants/lab.constants";
import { SurgicalWorkflowProgress } from "../../../../components/SurgicalWorkflowProgress";

export interface HospitalOption {
  id: number;
  name: string;
}

export const getColumns = (
  handleEditClick: (record: SurgicalCase) => void,
  hospitals: HospitalOption[] = [],
): ColumnsType<SurgicalCase> => [
  {
    title: "Accession No.",
    dataIndex: "accession_no",
    width: 120,
    fixed: "left",
    sorter: (a, b) => (a.accession_no || "").localeCompare(b.accession_no || ""),
    defaultSortOrder: "descend" as const,
    render: (text: string, record: SurgicalCase) => (
      <Space size={4}>
        <b style={{ color: "#1890ff" }}>{text}</b>
        {record.is_express && (
          <Tooltip title="URGENT CASE">
            <Tag
              color="red"
              icon={<FireFilled />}
              style={{
                margin: 0,
                padding: "0 4px",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            >
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
    title: "Register At",
    dataIndex: "registered_at",
    key: "registered_at",
    width: 120,
    sorter: (a, b) =>
      dayjs(a.registered_at).unix() - dayjs(b.registered_at).unix(),
    render: (value: string) =>
      value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
  },
  {
    title: "Patient",
    key: "patient_name",
    width: 180,
    render: (_, record) => {
      const p = record.patient;
      if (!p) return "-";
      const title = p.title?.title || "";
      return [p.title?.title, p.name, p.ln].filter(Boolean).join(" ") || "-";
    },
  },
  {
    title: "HN",
    dataIndex: "hn",
    width: 80,
    render: (hn) => hn,
  },
  {
    title: "Hospital",
    key: "hospital",
    dataIndex: ["hospital", "name"],
    width: 180,
    render: (name) => name || "-",
    filters: hospitals.map((h) => ({ text: h.name, value: h.id })),
    filterMultiple: false,
  },
  {
    title: "Status",
    key: "status",
    dataIndex: "status",
    width: 100,
    align: "center" as const,
    render: (status) => {
      const statusConfig = STATUS_OPTIONS.find((opt) => opt.value === status);
      return (
        <Tag color={statusConfig?.color || "default"}>
          {statusConfig?.label || status}
        </Tag>
      );
    },
    filters: STATUS_OPTIONS.map((opt) => ({
      text: opt.label,
      value: opt.value,
    })),
    filterMultiple: true,
  },
  {
    title: "Workflow Progress",
    key: "workflow",
    width: 180,
    align: "center" as const,
    render: (_, record) => <SurgicalWorkflowProgress record={record} />,
  },
];
