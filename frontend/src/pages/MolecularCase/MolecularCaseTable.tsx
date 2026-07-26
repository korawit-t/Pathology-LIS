import React from "react";
import { Table, Tag, Typography, Button, Space, Tooltip } from "antd";
import { EditOutlined, PrinterOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

import { MolecularCaseResponse } from "../../services/molecularCaseService";

const { Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "gold",
  reported: "green",
};

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
}

const MolecularCaseTable: React.FC<MolecularCaseTableProps> = ({ dataSource, loading, onSelectCase, onEditCase, onPrintCase }) => {
  const columns: ColumnsType<MolecularCaseResponse> = [
    { title: "Accession No.", dataIndex: "accession_no", render: (t: string) => <Text strong>{t}</Text>, width: 140 },
    {
      title: "Parent Case",
      dataIndex: "parent_case_accession_no",
      width: 130,
      render: (t: string | null) => t || <Tag>Standalone</Tag>,
    },
    { title: "Patient", dataIndex: "patient_name", render: (t: string) => t || "—" },
    { title: "HN", dataIndex: "hn", width: 110 },
    { title: "Test", dataIndex: "test_name" },
    {
      title: "Out-lab",
      dataIndex: "is_outlab",
      width: 90,
      render: (v: boolean) => (v ? <Tag color="purple">Out-lab</Tag> : <Tag>In-house</Tag>),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLOR[s] || "default"}>{s}</Tag>,
    },
    { title: "Registered", dataIndex: "registered_at", width: 160, render: (v: string) => (v ? new Date(v).toLocaleString() : "—") },
  ];

  if (onEditCase || onPrintCase) {
    columns.push({
      title: "",
      key: "actions",
      width: 90,
      fixed: "right" as const,
      render: (_: unknown, record: MolecularCaseResponse) => (
        <Space size={0}>
          {onEditCase && record.parent_case_id == null && record.status === "pending" && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onEditCase(record.id);
              }}
            />
          )}
          {onPrintCase && (
            <Tooltip title="Print sticker">
              <Button
                type="text"
                icon={<PrinterOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrintCase(record);
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
      onRow={(record) => ({ onClick: () => onSelectCase(record.id), style: { cursor: "pointer" } })}
      pagination={{ pageSize: 20 }}
    />
  );
};

export default MolecularCaseTable;
