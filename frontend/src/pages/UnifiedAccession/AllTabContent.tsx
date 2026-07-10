import React from "react";
import {
  Table,
  Tag,
  Typography,
  Space,
  Tooltip,
  Button,
} from "antd";
import {
  EditOutlined,
  EyeOutlined,
  FireFilled,
  PrinterOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import AccessionTag from "../../components/AccessionTag";
import { SurgicalWorkflowProgress } from "../../components/SurgicalWorkflowProgress";
import WorkflowBadge from "./WorkflowBadge";
import { SURGICAL_STATUS_MAP, CYTO_STATUS, statusTag } from "./constants";
import { UnifiedRow } from "./types";
import { calculateTATProgress } from "../../utils/tatUtils";
import type { SystemSetting } from "../../types/system";

const { Text } = Typography;

interface AllTabContentProps {
  rows: UnifiedRow[];
  loading: boolean;
  onRowClick: (row: UnifiedRow) => void;
  onEdit: (row: UnifiedRow) => void;
  onPrint: (row: UnifiedRow) => void;
  printLoadingKey: string | null;
  settings: SystemSetting | null;
  holidays: string[];
  total: number;
  current: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const AllTabContent: React.FC<AllTabContentProps> = ({
  rows,
  loading,
  onRowClick,
  onEdit,
  onPrint,
  printLoadingKey,
  settings,
  holidays,
  total,
  current,
  pageSize,
  onPageChange,
}) => {
  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 160,
      fixed: "left" as const,
      sorter: (a: UnifiedRow, b: UnifiedRow) =>
        a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
      defaultSortOrder: "descend" as const,
      render: (v: string, r: UnifiedRow) => (
        <div>
          <Space size={4}>
            <AccessionTag value={v} />
            {r.is_express && (
              <Tooltip title="Express / Urgent">
                <FireFilled style={{ color: "#ff4d4f", fontSize: 12 }} />
              </Tooltip>
            )}
          </Space>
          {(r.consult || r.has_pending_ihc) && (
            <div style={{ marginTop: 3 }}>
              <Space size={3} wrap>
                {r.consult && (
                  <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", marginInlineEnd: 0 }}>Consult</Tag>
                )}
                {r.has_pending_ihc && (
                  <Tag color="geekblue" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", marginInlineEnd: 0 }}>IHC</Tag>
                )}
              </Space>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      width: 120,
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YY HH:mm") : "-"),
    },
    { title: "Patient", dataIndex: "patient_name", width: 200 },
    { title: "HN", dataIndex: "hn", width: 75 },
    {
      title: "Hospital",
      dataIndex: "hospital",
      width: 180,
      render: (v: string) => <Text>{v || "-"}</Text>,
    },
    {
      title: "Department",
      dataIndex: "department",
      width: 150,
      render: (v: string) => <Text type="secondary">{v || "-"}</Text>,
    },
    {
      title: "Clinician",
      dataIndex: "clinician",
      width: 150,
      render: (v: string) => <Text>{v || "-"}</Text>,
    },
    {
      title: "Coverage",
      dataIndex: "coverage",
      width: 160,
      render: (v?: string) => (
        <Tooltip title={v}>
          <Tag color="green" style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v || "N/A"}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: "Specimen",
      dataIndex: "specimen",
      width: 160,
      render: (v: string) => <Text>{v}</Text>,
    },
    {
      title: "Workflow",
      key: "workflow",
      width: 200,
      align: "center" as const,
      render: (_: unknown, r: UnifiedRow) =>
        r.type === "surgical" ? (
          <SurgicalWorkflowProgress
            record={{
              is_grossed: r.wf_grossed,
              is_processed: r.wf_processed,
              is_slide_prepped: r.wf_slide_prepped,
              is_reported: r.wf_reported,
            }}
          />
        ) : (
          <Space size={10}>
            <WorkflowBadge
              label="SC"
              isDone={!!r.wf_screened}
              color="blue"
              tooltip={r.wf_screened ? "Screened" : "Pending Screening"}
            />
            <WorkflowBadge
              label="RP"
              isDone={!!r.wf_reported}
              color="green"
              tooltip={r.wf_reported ? "Reported" : "Pending Report"}
            />
          </Space>
        ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 130,
      fixed: "right" as const,
      render: (s: string, r: UnifiedRow) =>
        statusTag(s, r.type === "surgical" ? SURGICAL_STATUS_MAP : CYTO_STATUS),
    },
    {
      title: "Due Date",
      key: "due_date",
      width: 110,
      fixed: "right" as const,
      render: (_: unknown, r: UnifiedRow) => {
        if (r.status === "signed out" || r.status === "published" || r.status === "cancelled")
          return <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 16 }} />;
        const labType = r.type === "surgical" ? "surgical" : r.type === "gyne" ? "gyne" : "non_gyne";
        const tat = calculateTATProgress(r.registered_at, labType, settings, !!r.is_express, holidays);
        if (!tat) return <Text type="secondary">—</Text>;
        const due = dayjs(tat.dueDate);
        const now = dayjs();
        const isOverdue = now.isAfter(due);
        const isWarning = !isOverdue && due.diff(now, "hour") <= 24;
        return (
          <Text style={{ color: isOverdue ? "#ff4d4f" : isWarning ? "#fa8c16" : undefined, fontWeight: isOverdue || isWarning ? 600 : undefined }}>
            {due.format("DD/MM/YY")}
          </Text>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 120,
      fixed: "right" as const,
      align: "center" as const,
      render: (_: unknown, row: UnifiedRow) => (
        <Space size={4}>
          <Tooltip title="Print sticker">
            <Button
              type="default"
              size="middle"
              icon={<PrinterOutlined />}
              loading={printLoadingKey === `${row.type}-${row.id}`}
              onClick={(e) => { e.stopPropagation(); onPrint(row); }}
            />
          </Tooltip>
          <Tooltip title="View detail">
            <Button
              type="default"
              size="middle"
              icon={<EyeOutlined />}
              onClick={(e) => { e.stopPropagation(); onRowClick(row); }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              size="middle"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(row); }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        dataSource={rows}
        rowKey="_key"
        loading={loading}
        columns={columns}
        onRow={(row) => ({ onClick: () => onEdit(row), style: { cursor: "pointer" } })}
        scroll={{ x: 1880, y: "calc(100vh - 360px)" }}
        sticky
        pagination={{
          total,
          current,
          pageSize,
          onChange: onPageChange,
          showTotal: (t) => `Total ${t} cases`,
          hideOnSinglePage: true,
        }}
        size="middle"
        bordered
      />
    </>
  );
};

export default AllTabContent;
