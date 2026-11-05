import React from "react";
import { Table, Tag, Typography, Button, Space, Tooltip } from "antd";
import { EditOutlined, PrinterOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import AccessionTag from "../../components/AccessionTag";
import { MOLECULAR_STATUS_MAP } from "../../constants/lab.constants";
import { MolecularCaseResponse } from "../../services/molecularCaseService";
import "../../styles/table-common.css";

const { Text } = Typography;

interface MolecularCaseTableProps {
  dataSource: MolecularCaseResponse[];
  loading?: boolean;
  onSelectCase: (caseId: number) => void;
  /** Standalone + pending cases only get an Edit action — parent-linked cases
   * have no demographic fields of their own to edit, and reported/cancelled
   * cases are closed. */
  onEditCase?: (caseId: number) => void;
  /** Available on any case regardless of parent-link/status — printing a
   * label doesn't touch case data the way editing demographics does. */
  onPrintCase?: (record: MolecularCaseResponse) => void;
  /** Adds an Assist Pathologist column — for the pathologist's own worklist,
   * which also lists unassigned cases and needs to tell them apart. */
  showAssistPathologist?: boolean;
}

const MolecularCaseTable: React.FC<MolecularCaseTableProps> = ({
  dataSource, loading, onSelectCase, onEditCase, onPrintCase, showAssistPathologist,
}) => {
  const columns: ColumnsType<MolecularCaseResponse> = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 140,
      fixed: "left" as const,
      sorter: (a, b) => a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
      defaultSortOrder: "descend" as const,
      render: (t: string) => <AccessionTag value={t} />,
    },
    {
      title: "Parent Case",
      dataIndex: "parent_case_accession_no",
      width: 130,
      render: (t: string | null) => (t ? <AccessionTag value={t} /> : <Tag>Standalone</Tag>),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      width: 130,
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YY HH:mm") : "—"),
    },
    { title: "Patient", dataIndex: "patient_name", width: 200, render: (t: string) => t || "—" },
    { title: "HN", dataIndex: "hn", width: 100 },
    { title: "Test", dataIndex: "test_name", width: 220, render: (t: string) => <Text>{t || "—"}</Text> },
    {
      title: "Out-lab",
      dataIndex: "is_outlab",
      width: 100,
      align: "center" as const,
      render: (v: boolean) => (v ? <Tag color="purple">Out-lab</Tag> : <Tag>In-house</Tag>),
    },
    ...(showAssistPathologist
      ? [
          {
            title: "Assist Pathologist",
            dataIndex: "assist_pathologist_name",
            width: 170,
            render: (t: string | null) => t || <Text type="secondary">Unassigned</Text>,
          },
        ]
      : []),
    {
      title: "Status",
      dataIndex: "display_status",
      width: 130,
      fixed: "right" as const,
      // display_status, not status — same value the unified-case query puts in
      // the Accession page's All tab, so both tables render the same tag.
      render: (s: string) => {
        const cfg = MOLECULAR_STATUS_MAP[s] ?? { color: "warning", label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
  ];

  if (onEditCase || onPrintCase) {
    columns.push({
      title: "",
      key: "actions",
      width: 100,
      fixed: "right" as const,
      align: "center" as const,
      render: (_: unknown, record: MolecularCaseResponse) => (
        <Space size={4}>
          {onPrintCase && (
            <Tooltip title="Print sticker">
              <Button
                type="default"
                size="middle"
                icon={<PrinterOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrintCase(record);
                }}
              />
            </Tooltip>
          )}
          {onEditCase && record.parent_case_id == null && record.status === "pending" && (
            <Tooltip title="Edit">
              <Button
                type="primary"
                size="middle"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditCase(record.id);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    });
  }

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      className="standard-table"
      rowClassName={() => "editable-row"}
      onRow={(record) => ({ onClick: () => onSelectCase(record.id) })}
      scroll={{ x: showAssistPathologist ? 1490 : 1320, y: "calc(100vh - 360px)" }}
      sticky
      pagination={{
        pageSize: 20,
        showSizeChanger: false,
        showTotal: (t) => `Total ${t} cases`,
        hideOnSinglePage: true,
      }}
      bordered
      size="middle"
    />
  );
};

export default MolecularCaseTable;
